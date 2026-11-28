import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ServiceCase,
  ServiceType,
  ServiceStage,
  ServicePaymentStatus,
  CreateServiceCaseInput,
  UpdateServiceCaseInput,
} from '@/types/services';
import { supabaseAdmin } from '@/lib/flows/admin-client';

// In-memory fallback cache starting completely empty (0 cases)
const inMemoryServiceCases: Map<string, ServiceCase> = new Map();

function getAdminClient(): SupabaseClient | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Normalizes phone number to 10 digits for matching.
 */
function cleanPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Fetch all service cases.
 * Tries Supabase `service_cases` table first; if the table does not exist or fails,
 * cleanly falls back to the isolated in-memory store.
 */
export async function getServiceCases(
  db?: SupabaseClient | null,
  accountId?: string | null
): Promise<ServiceCase[]> {
  const client = db || getAdminClient();

  if (client) {
    try {
      let query = client.from('service_cases').select('*').order('created_at', { ascending: false });
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data as ServiceCase[];
      }
      if (error) {
        console.warn('[service-cases] DB query fallback notice:', error.message);
      }
    } catch (err) {
      console.warn('[service-cases] Exception querying DB, using fallback:', err);
    }
  }

  // Fallback to in-memory store
  return Array.from(inMemoryServiceCases.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Create a new service case.
 */
export async function createServiceCase(
  input: CreateServiceCaseInput,
  db?: SupabaseClient | null
): Promise<ServiceCase> {
  const client = db || getAdminClient();
  const now = new Date().toISOString();
  const id = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const newCase: ServiceCase = {
    id,
    account_id: input.account_id || null,
    customer_name: input.customer_name.trim(),
    phone: input.phone.trim(),
    service_type: input.service_type,
    vehicle_or_ref: (input.vehicle_or_ref || '').trim(),
    notes: input.notes?.trim() || null,
    fee_amount: Number(input.fee_amount) || 0,
    payment_status: input.payment_status || 'UNPAID',
    stage: input.stage || 'NEW_INQUIRY',
    created_at: now,
    updated_at: now,
  };

  if (client) {
    try {
      const { data, error } = await client
        .from('service_cases')
        .insert({
          customer_name: newCase.customer_name,
          phone: newCase.phone,
          service_type: newCase.service_type,
          vehicle_or_ref: newCase.vehicle_or_ref,
          notes: newCase.notes,
          fee_amount: newCase.fee_amount,
          payment_status: newCase.payment_status,
          stage: newCase.stage,
          account_id: newCase.account_id,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (!error && data) {
        inMemoryServiceCases.set(data.id, data as ServiceCase);
        return data as ServiceCase;
      }
      if (error) {
        console.warn('[service-cases] DB insert failed, caching in memory:', error.message);
      }
    } catch (err) {
      console.warn('[service-cases] DB insert exception:', err);
    }
  }

  inMemoryServiceCases.set(id, newCase);
  return newCase;
}

/**
 * Update an existing service case.
 */
export async function updateServiceCase(
  id: string,
  input: UpdateServiceCaseInput,
  db?: SupabaseClient | null
): Promise<ServiceCase | null> {
  const client = db || getAdminClient();
  const now = new Date().toISOString();

  if (client) {
    try {
      const { data, error } = await client
        .from('service_cases')
        .update({
          ...input,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (!error && data) {
        inMemoryServiceCases.set(id, data as ServiceCase);
        return data as ServiceCase;
      }
    } catch (err) {
      console.warn('[service-cases] DB update exception:', err);
    }
  }

  // Update in-memory fallback
  const existing = inMemoryServiceCases.get(id);
  if (!existing) return null;

  const updated: ServiceCase = {
    ...existing,
    ...input,
    updated_at: now,
  };
  inMemoryServiceCases.set(id, updated);
  return updated;
}

/**
 * Delete a service case.
 */
export async function deleteServiceCase(
  id: string,
  db?: SupabaseClient | null
): Promise<boolean> {
  const client = db || getAdminClient();

  if (client) {
    try {
      const { error } = await client.from('service_cases').delete().eq('id', id);
      if (!error) {
        inMemoryServiceCases.delete(id);
        return true;
      }
    } catch (err) {
      console.warn('[service-cases] DB delete exception:', err);
    }
  }

  return inMemoryServiceCases.delete(id);
}

/**
 * Check if an open (non-completed) case exists for a given phone number.
 */
export async function hasOpenServiceCaseForPhone(
  phone: string,
  db?: SupabaseClient | null
): Promise<boolean> {
  const p10 = cleanPhone(phone);
  if (!p10) return false;

  const client = db || getAdminClient();

  if (client) {
    try {
      const { data, error } = await client
        .from('service_cases')
        .select('id, stage, phone')
        .neq('stage', 'COMPLETED')
        .limit(20);

      if (!error && Array.isArray(data)) {
        return data.some((c) => cleanPhone(c.phone) === p10);
      }
    } catch (err) {
      console.warn('[service-cases] DB check open case notice:', err);
    }
  }

  // Check fallback store
  return Array.from(inMemoryServiceCases.values()).some(
    (c) => c.stage !== 'COMPLETED' && cleanPhone(c.phone) === p10
  );
}

/**
 * Auto-creates a new service case from WhatsApp inbound inquiry if none open.
 */
export async function autoCreateServiceCaseFromWhatsApp(args: {
  phone: string;
  customerName?: string;
  serviceType: ServiceType;
  inboundText?: string;
  vehicleOrRef?: string;
  accountId?: string;
  db?: SupabaseClient | null;
}): Promise<ServiceCase | null> {
  const { phone, customerName, serviceType, inboundText, vehicleOrRef, accountId, db } = args;

  const alreadyOpen = await hasOpenServiceCaseForPhone(phone, db);
  if (alreadyOpen) {
    console.log(`[service-cases] Open case already exists for phone ${phone}. Skipping auto-create.`);
    return null;
  }

  const created = await createServiceCase(
    {
      customer_name: customerName?.trim() || 'WhatsApp Customer',
      phone: phone.trim(),
      service_type: serviceType,
      vehicle_or_ref: vehicleOrRef?.trim() || '',
      notes: inboundText ? `Inbound WhatsApp Inquiry: ${inboundText.trim()}` : 'Inbound WhatsApp Inquiry',
      stage: 'NEW_INQUIRY',
      payment_status: 'UNPAID',
      fee_amount: 0,
      account_id: accountId,
    },
    db
  );

  console.log(`[service-cases] Auto-created new ${serviceType} case for ${phone}: ${created.id}`);
  return created;
}

/**
 * Synchronizes customer details shared during an active online service chat into service_cases.
 * Detects vehicle registration number (e.g., UP11AY1234) or PAN (e.g., ABCDE1234F),
 * and updates or creates the service case with notes.
 */
export async function syncServiceCaseFromChat(args: {
  phone: string;
  customerName?: string;
  serviceType: ServiceType;
  messageText: string;
  accountId?: string;
  db?: SupabaseClient | null;
}): Promise<ServiceCase | null> {
  const { phone, customerName, serviceType, messageText, accountId, db } = args;
  const p10 = cleanPhone(phone);
  if (!p10) return null;

  const client = db || getAdminClient();

  // 1. Detect vehicle registration or PAN
  let vehicleOrRef = '';
  const panMatch = messageText.toUpperCase().match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  const regMatch = messageText.toUpperCase().match(/\b[A-Z]{2}\s*[-0-9]{1,2}\s*[A-Z]{0,3}\s*[0-9]{4}\b/);
  if (serviceType === 'ITR' && panMatch) {
    vehicleOrRef = panMatch[0];
  } else if (regMatch) {
    vehicleOrRef = regMatch[0].replace(/\s+/g, '');
  }

  // 2. Check for an existing open case
  let openCase: ServiceCase | null = null;
  if (client) {
    try {
      const { data } = await client
        .from('service_cases')
        .select('*')
        .neq('stage', 'COMPLETED')
        .order('created_at', { ascending: false })
        .limit(10);

      if (Array.isArray(data)) {
        const found = data.find((c) => cleanPhone(c.phone) === p10);
        if (found) openCase = found as ServiceCase;
      }
    } catch (err) {
      console.warn('[service-cases] Exception looking up open case:', err);
    }
  }

  if (!openCase) {
    const memoryFound = Array.from(inMemoryServiceCases.values()).find(
      (c) => c.stage !== 'COMPLETED' && cleanPhone(c.phone) === p10
    );
    if (memoryFound) openCase = memoryFound;
  }

  const detailNote = `[WhatsApp Details]: ${messageText.trim()}`;

  // 3. Update existing open case or create a new one
  if (openCase) {
    const updatedNotes = openCase.notes
      ? `${openCase.notes}\n${detailNote}`
      : detailNote;

    const updatePayload: UpdateServiceCaseInput = {
      notes: updatedNotes,
      stage: openCase.stage === 'NEW_INQUIRY' ? 'PORTAL_CHECK' : openCase.stage,
    };
    if (vehicleOrRef && !openCase.vehicle_or_ref) {
      updatePayload.vehicle_or_ref = vehicleOrRef;
    }
    if (customerName && openCase.customer_name === 'WhatsApp Customer') {
      updatePayload.customer_name = customerName.trim();
    }

    return await updateServiceCase(openCase.id, updatePayload, client);
  }

  // If no open case existed, create one with the captured details
  return await createServiceCase(
    {
      customer_name: customerName?.trim() || 'WhatsApp Customer',
      phone: phone.trim(),
      service_type: serviceType,
      vehicle_or_ref: vehicleOrRef,
      notes: detailNote,
      stage: 'PORTAL_CHECK',
      payment_status: 'UNPAID',
      fee_amount: 0,
      account_id: accountId,
    },
    client
  );
}
