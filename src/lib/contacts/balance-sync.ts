import type { SupabaseClient } from '@supabase/supabase-js';

export interface SimplePO {
  id?: string;
  po_number?: string;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  total_estimated_cost?: number | string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
}

export interface SimplePaymentLink {
  customer_phone?: string | null;
  amount?: number | string | null;
  remaining_amount?: number | string | null;
  status?: string | null;
}

export interface SimpleContact {
  id?: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  category?: string | null;
  unique_code?: string | null;
  pending_balance?: number | string | null;
}

/**
 * Normalizes phone numbers to standard 10-digit Indian mobile format
 * by stripping all non-digits and taking trailing 10 digits.
 */
export function normalizePhone(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(-10);
}

/**
 * Checks if a contact category represents a supplier (Distributor or Wholesaler).
 */
export function isSupplierContact(contact: {
  category?: string | null;
  name?: string | null;
  company?: string | null;
}): boolean {
  const cat = (contact.category || '').toLowerCase();
  if (cat === 'distributor' || cat === 'wholesaler') return true;

  const text = `${contact.name || ''} ${contact.company || ''}`.toLowerCase();
  return (
    text.includes('pal agency') ||
    text.includes('nabeel pathan') ||
    text.includes('hamdaan') ||
    text.includes('sandeep') ||
    text.includes('wholesaler') ||
    text.includes('distributor') ||
    text.includes('spares agency')
  );
}

/**
 * Computes live payable due for a supplier contact from live Purchase Orders.
 * Returns 0 if all POs are PAID or if no unpaid POs exist.
 */
export function computeSupplierDue(
  contact: SimpleContact,
  purchaseOrders: SimplePO[]
): number {
  const contactPhone = normalizePhone(contact.phone);
  const contactName = (contact.name || '').trim().toLowerCase();
  const contactCompany = (contact.company || '').trim().toLowerCase();

  // Find all purchase orders matching this supplier by phone, name, or company
  const matchedPos = purchaseOrders.filter((po) => {
    const poPhone = normalizePhone(po.supplier_phone);
    if (contactPhone && poPhone && contactPhone === poPhone) return true;

    const poName = (po.supplier_name || '').trim().toLowerCase();
    if (contactName && poName && (poName.includes(contactName) || contactName.includes(poName))) return true;
    if (contactCompany && poName && (poName.includes(contactCompany) || contactCompany.includes(poName))) return true;

    return false;
  });

  // Sum up unpaid or partially-paid balance
  const due = matchedPos.reduce((sum, po) => {
    const status = (po.payment_status || 'UNPAID').toUpperCase();
    if (status === 'PAID') return sum;

    const total = Number(po.total_estimated_cost || 0);
    const paid = Number(po.amount_paid || 0);
    return sum + Math.max(0, total - paid);
  }, 0);

  return due;
}

/**
 * Computes live receivable due for a customer or mechanic contact from live Payment Links.
 */
export function computeCustomerDue(
  contact: SimpleContact,
  paymentLinks: SimplePaymentLink[]
): number {
  const contactPhone = normalizePhone(contact.phone);
  if (!contactPhone) return Number(contact.pending_balance || 0);

  const pendingLinks = paymentLinks.filter(
    (l) => (l.status === 'PENDING' || l.status === 'PARTIAL') && normalizePhone(l.customer_phone) === contactPhone
  );

  if (pendingLinks.length === 0) {
    // If contact is mechanic, fallback to direct balance if present, otherwise 0
    if (contact.category === 'Mechanic') {
      return Math.max(0, Number(contact.pending_balance || 0));
    }
    return 0;
  }

  return pendingLinks.reduce((sum, link) => {
    const amt = link.remaining_amount !== undefined && link.remaining_amount !== null
      ? Number(link.remaining_amount)
      : Number(link.amount || 0);
    return sum + Math.max(0, amt);
  }, 0);
}

/**
 * Unified contact due computation.
 * - Wholesaler / Distributor: directly uses live PO ledger (0 when all PAID).
 * - Customer / Mechanic: uses live payment links / khata entries.
 */
export function computeContactDue(
  contact: SimpleContact,
  data: {
    purchaseOrders: SimplePO[];
    paymentLinks: SimplePaymentLink[];
  }
): number {
  if (isSupplierContact(contact)) {
    return computeSupplierDue(contact, data.purchaseOrders);
  }
  return computeCustomerDue(contact, data.paymentLinks);
}

/**
 * Formats due amount and returns badge status.
 */
export function getContactBadgeStatus(dueAmount: number): {
  text: string;
  isSettled: boolean;
  hasUdhaar: boolean;
} {
  if (dueAmount <= 0) {
    return {
      text: 'Settled ₹0',
      isSettled: true,
      hasUdhaar: false,
    };
  }
  return {
    text: `⚠️ ₹${dueAmount.toLocaleString('en-IN')} Due`,
    isSettled: false,
    hasUdhaar: true,
  };
}

/**
 * Syncs the contact's `pending_balance` (and `udhaar_balance`) in Supabase
 * with their live Purchase Order ledger balance.
 */
export async function syncSupplierContactBalance(
  supabase: SupabaseClient,
  accountId: string,
  supplierPhone?: string | null,
  supplierName?: string | null
): Promise<{ success: boolean; remainingDue: number; contactId?: string }> {
  try {
    const phoneDigits = normalizePhone(supplierPhone);
    const cleanName = (supplierName || '').trim();

    // 1. Fetch all POs for this supplier in this account
    let poQuery = supabase
      .from('purchase_orders')
      .select('total_estimated_cost, amount_paid, payment_status, supplier_phone, supplier_name')
      .eq('account_id', accountId);

    const { data: pos } = await poQuery;
    const allPos = (pos || []) as SimplePO[];

    // Calculate remaining due for this supplier
    const remainingDue = computeSupplierDue(
      { phone: supplierPhone, name: supplierName, company: supplierName },
      allPos
    );

    // 2. Find matching contact in contacts table
    let contactQuery = supabase
      .from('contacts')
      .select('id, name, phone, company, pending_balance')
      .eq('account_id', accountId);

    if (phoneDigits) {
      contactQuery = contactQuery.or(
        `phone.ilike.%${phoneDigits}%,name.ilike.%${cleanName}%,company.ilike.%${cleanName}%`
      );
    } else if (cleanName) {
      contactQuery = contactQuery.or(
        `name.ilike.%${cleanName}%,company.ilike.%${cleanName}%`
      );
    }

    const { data: matchedContacts } = await contactQuery;
    if (!matchedContacts || matchedContacts.length === 0) {
      return { success: true, remainingDue };
    }

    // 3. Update pending_balance on matched contacts
    for (const c of matchedContacts) {
      // Try updating pending_balance and udhaar_balance
      const payload: Record<string, unknown> = {
        pending_balance: remainingDue,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', c.id);

      if (error) {
        console.warn(`[syncSupplierContactBalance] Update error for ${c.id}:`, error.message);
      }
    }

    return { success: true, remainingDue, contactId: matchedContacts[0]?.id };
  } catch (err) {
    console.error('[syncSupplierContactBalance] Unexpected error:', err);
    return { success: false, remainingDue: 0 };
  }
}
