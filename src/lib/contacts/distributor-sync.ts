import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Normalizes phone numbers to standard 10-digit Indian mobile format
 * by stripping all non-digits and taking the trailing 10 digits.
 */
export function normalize10Digits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

export interface SyncDistributorResult {
  synced: number;
  inserted: number;
  updated: number;
  errors: string[];
}

/**
 * Reconciles suppliers / distributors, purchase orders, and contacts:
 * 1. Finds all suppliers in `suppliers` (or `distributors` view)
 * 2. Finds distinct supplier entries in `purchase_orders`
 * 3. Upserts missing distributors/wholesalers into `contacts` with category 'Distributor' or 'Wholesaler'
 * 4. Ensures known contacts have their firm/company subtitle attached (e.g. Sandeep -> PAL AGENCY)
 */
export async function syncDistributorsAndWholesalers(
  supabase: SupabaseClient,
  accountId?: string
): Promise<SyncDistributorResult> {
  const result: SyncDistributorResult = {
    synced: 0,
    inserted: 0,
    updated: 0,
    errors: [],
  };

  try {
    // 1. Fetch suppliers / distributors
    let suppliersQuery = supabase.from('suppliers').select('*');
    if (accountId) {
      suppliersQuery = suppliersQuery.eq('account_id', accountId);
    }
    const { data: suppliers, error: supErr } = await suppliersQuery;
    if (supErr) {
      console.warn('[distributor-sync] Error fetching suppliers:', supErr.message);
    }

    // 2. Fetch distinct PO suppliers
    let poQuery = supabase
      .from('purchase_orders')
      .select('supplier_name, supplier_phone, supplier_id, account_id');
    if (accountId) {
      poQuery = poQuery.eq('account_id', accountId);
    }
    const { data: pos, error: poErr } = await poQuery;
    if (poErr) {
      console.warn('[distributor-sync] Error fetching PO suppliers:', poErr.message);
    }

    // 3. Fetch all current contacts
    let contactsQuery = supabase.from('contacts').select('id, name, phone, company, category, account_id, user_id');
    if (accountId) {
      contactsQuery = contactsQuery.eq('account_id', accountId);
    }
    const { data: contacts, error: contactErr } = await contactsQuery;
    if (contactErr) {
      console.error('[distributor-sync] Error fetching contacts:', contactErr.message);
      result.errors.push(contactErr.message);
      return result;
    }

    const contactsList = contacts || [];
    // Map existing contacts by last 10 digits
    const contactMapByDigits = new Map<string, typeof contactsList[0]>();
    contactsList.forEach((c) => {
      const digits = normalize10Digits(c.phone);
      if (digits) {
        contactMapByDigits.set(digits, c);
      }
    });

    // Aggregate unique suppliers from suppliers table and POs
    const targetSuppliers = new Map<
      string,
      {
        firmName: string;
        contactPerson: string | null;
        phone: string;
        category: 'Distributor' | 'Wholesaler';
        accountId: string;
      }
    >();

    // From suppliers table
    suppliers?.forEach((s) => {
      const digits = normalize10Digits(s.whatsapp_number);
      if (digits) {
        // Classify PAL AGENCY as Distributor, HAMDAAN as Wholesaler/Distributor
        const category: 'Distributor' | 'Wholesaler' =
          s.firm_name?.toUpperCase().includes('AGENCY') ? 'Distributor' : 'Wholesaler';

        targetSuppliers.set(digits, {
          firmName: s.firm_name,
          contactPerson: s.contact_person || null,
          phone: s.whatsapp_number,
          category,
          accountId: s.account_id,
        });
      }
    });

    // From POs (capturing any ad-hoc supplier names/numbers)
    pos?.forEach((p) => {
      const digits = normalize10Digits(p.supplier_phone);
      if (digits && !targetSuppliers.has(digits)) {
        const category: 'Distributor' | 'Wholesaler' =
          p.supplier_name?.toUpperCase().includes('AGENCY') ? 'Distributor' : 'Wholesaler';

        targetSuppliers.set(digits, {
          firmName: p.supplier_name,
          contactPerson: p.supplier_name,
          phone: p.supplier_phone,
          category,
          accountId: p.account_id,
        });
      }
    });

    // Reconcile each target supplier against contacts
    for (const [digits, target] of targetSuppliers.entries()) {
      const existing = contactMapByDigits.get(digits);

      if (existing) {
        // Already exists: check if company or category needs updating
        const needsCompanyUpdate = !existing.company || existing.company !== target.firmName;
        const needsCategoryUpdate =
          !existing.category ||
          (existing.category !== 'Distributor' && existing.category !== 'Wholesaler');

        if (needsCompanyUpdate || needsCategoryUpdate) {
          const updatePayload: Record<string, string> = {
            updated_at: new Date().toISOString(),
          };
          if (needsCompanyUpdate) updatePayload.company = target.firmName;
          if (needsCategoryUpdate) updatePayload.category = target.category;

          const { error: updErr } = await supabase
            .from('contacts')
            .update(updatePayload)
            .eq('id', existing.id);

          if (!updErr) {
            result.updated++;
          } else {
            result.errors.push(`Failed to update contact ${existing.id}: ${updErr.message}`);
          }
        }
        result.synced++;
      } else {
        // Missing in contacts: insert
        const targetAccountId = accountId || target.accountId;
        // Determine user_id to use if available from an existing contact row in account
        const fallbackUserId = contactsList[0]?.user_id || null;

        const insertPayload: Record<string, unknown> = {
          account_id: targetAccountId,
          name: target.contactPerson || target.firmName,
          company: target.firmName,
          phone: target.phone,
          category: target.category,
        };
        if (fallbackUserId) {
          insertPayload.user_id = fallbackUserId;
        }

        const { error: insErr } = await supabase.from('contacts').insert(insertPayload);

        if (!insErr) {
          result.inserted++;
          result.synced++;
        } else {
          result.errors.push(`Failed to insert contact for ${target.firmName}: ${insErr.message}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[distributor-sync] Unexpected error:', msg);
    result.errors.push(msg);
  }

  return result;
}

/**
 * Automatically syncs a single distributor/supplier to the `contacts` table.
 */
export async function syncSupplierToContact(
  supabase: SupabaseClient,
  supplier: {
    firm_name: string;
    whatsapp_number: string;
    contact_person?: string | null;
    account_id: string;
  }
) {
  const digits = normalize10Digits(supplier.whatsapp_number);
  if (!digits) return;

  const category: 'Distributor' | 'Wholesaler' =
    supplier.firm_name?.toUpperCase().includes('AGENCY') ? 'Distributor' : 'Wholesaler';

  // Check if contact exists
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, company, category')
    .or(`phone.ilike.%${digits}%,phone_normalized.ilike.%${digits}%`)
    .eq('account_id', supplier.account_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('contacts')
      .update({
        company: supplier.firm_name,
        category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Lookup user_id
    const { data: sample } = await supabase
      .from('contacts')
      .select('user_id')
      .eq('account_id', supplier.account_id)
      .limit(1)
      .maybeSingle();

    await supabase.from('contacts').insert({
      account_id: supplier.account_id,
      user_id: sample?.user_id,
      name: supplier.contact_person || supplier.firm_name,
      company: supplier.firm_name,
      phone: supplier.whatsapp_number,
      category,
    });
  }
}

/**
 * Automatically syncs a contact with category Distributor or Wholesaler
 * into the `suppliers` table so inventory and POs recognize them immediately.
 */
export async function syncContactToSupplier(
  supabase: SupabaseClient,
  contact: {
    id?: string;
    name?: string | null;
    phone: string;
    company?: string | null;
    category?: string | null;
    account_id: string;
  }
) {
  if (contact.category !== 'Distributor' && contact.category !== 'Wholesaler') {
    return;
  }

  const digits = normalize10Digits(contact.phone);
  if (!digits) return;

  const firmName = contact.company || contact.name || 'Auto Parts Supplier';

  // Check if supplier exists
  const { data: existing } = await supabase
    .from('suppliers')
    .select('id, firm_name')
    .or(`whatsapp_number.ilike.%${digits}%`)
    .eq('account_id', contact.account_id)
    .maybeSingle();

  if (existing) {
    if (contact.company && existing.firm_name !== contact.company) {
      await supabase
        .from('suppliers')
        .update({
          firm_name: contact.company,
          contact_person: contact.name || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
  } else {
    await supabase.from('suppliers').insert({
      account_id: contact.account_id,
      firm_name: firmName,
      contact_person: contact.name || null,
      whatsapp_number: contact.phone,
      brand_specialty: ['Hero', 'Bajaj', 'Honda'],
      is_active: true,
    });
  }
}
