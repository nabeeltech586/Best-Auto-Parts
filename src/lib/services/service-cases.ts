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
import { engineSendText } from '@/lib/flows/meta-send';

// In-memory fallback cache starting completely empty (0 cases)
const inMemoryServiceCases: Map<string, ServiceCase> = new Map();

interface ServiceCaseMeta {
  govt_fee?: number;
  service_charge?: number;
  receipt_number?: string | null;
  payment_date?: string | null;
}

const META_PREFIX = '[SERVICE_META]:';

/**
 * Parses internal [SERVICE_META] JSON tag from notes.
 */
export function parseServiceMeta(notes?: string | null): {
  cleanNotes: string;
  meta: ServiceCaseMeta;
} {
  if (!notes) {
    return { cleanNotes: '', meta: {} };
  }

  const idx = notes.indexOf(META_PREFIX);
  if (idx === -1) {
    return { cleanNotes: notes.trim(), meta: {} };
  }

  const clean = notes.slice(0, idx).trim();
  const jsonStr = notes.slice(idx + META_PREFIX.length).trim();
  try {
    const meta = JSON.parse(jsonStr) as ServiceCaseMeta;
    return { cleanNotes: clean, meta };
  } catch {
    return { cleanNotes: notes.trim(), meta: {} };
  }
}

/**
 * Injects structured fee and date metadata into notes for safe backward-compatible storage.
 */
export function injectServiceMeta(
  notes: string | null | undefined,
  meta: ServiceCaseMeta
): string | null {
  const { cleanNotes } = parseServiceMeta(notes);
  const hasMeta =
    (meta.govt_fee !== undefined && meta.govt_fee > 0) ||
    (meta.service_charge !== undefined && meta.service_charge > 0) ||
    Boolean(meta.receipt_number) ||
    Boolean(meta.payment_date);

  if (!hasMeta) {
    return cleanNotes || null;
  }

  const metaTag = `${META_PREFIX}${JSON.stringify(meta)}`;
  return cleanNotes ? `${cleanNotes}\n${metaTag}` : metaTag;
}

/**
 * Normalizes a raw database/memory record into a fully typed ServiceCase.
 * Guarantees service_charge, govt_fee, and fee_amount are always in sync and never wrongly 0.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeServiceCase(raw: any): ServiceCase {
  const { cleanNotes, meta } = parseServiceMeta(raw.notes);

  const govt_fee = Number(raw.govt_fee ?? meta.govt_fee ?? 0) || 0;
  const service_charge =
    raw.service_charge !== undefined && raw.service_charge !== null
      ? Number(raw.service_charge) || 0
      : meta.service_charge !== undefined
      ? Number(meta.service_charge) || 0
      : Number(raw.fee_amount) || 0;

  const receipt_number = raw.receipt_number || meta.receipt_number || null;
  const payment_date = raw.payment_date || meta.payment_date || null;
  const fee_amount =
    govt_fee + service_charge > 0
      ? govt_fee + service_charge
      : Number(raw.fee_amount) || 0;

  return {
    id: raw.id,
    account_id: raw.account_id || null,
    customer_name: (raw.customer_name || '').trim(),
    phone: (raw.phone || '').trim(),
    service_type: raw.service_type,
    vehicle_or_ref: (raw.vehicle_or_ref || '').trim(),
    notes: cleanNotes || raw.notes || null,
    fee_amount,
    govt_fee,
    service_charge,
    receipt_number,
    payment_date,
    payment_status: raw.payment_status || 'UNPAID',
    stage: raw.stage || 'NEW_INQUIRY',
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

/**
 * Formats a date string into "28 Nov 2026" display format.
 */
export function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Gets today's date in YYYY-MM-DD format in Asia/Kolkata timezone.
 */
export function getKolkataTodayDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Builds the complete WhatsApp status update message including fee breakdown and payment date.
 */
export function buildServiceCaseWhatsAppMessage(sc: ServiceCase): string {
  const STAGE_TITLES: Record<string, string> = {
    NEW_INQUIRY: 'New Inquiry / Docs Pending',
    PORTAL_CHECK: 'Portal Check & Quote',
    PAYMENT_PENDING: 'Payment Pending',
    PROCESSING: 'Processing / Filing',
    COMPLETED: 'Completed & Delivered',
  };
  const stageTitle = STAGE_TITLES[sc.stage] || sc.stage;
  const refStr = sc.vehicle_or_ref ? ` (${sc.vehicle_or_ref})` : '';

  const govtFee = sc.govt_fee || 0;
  const serviceCharge = sc.service_charge ?? sc.fee_amount ?? 0;
  const totalAmount = govtFee + serviceCharge;

  const govtFeeLine =
    govtFee > 0 ? `🏛️ *Govt / Portal Fee:* ₹${govtFee.toLocaleString('en-IN')}\n` : '';
  const serviceChargeLine = `💼 *Service Charge:* ₹${serviceCharge.toLocaleString('en-IN')} (${sc.payment_status})\n`;
  const totalLine =
    govtFee > 0
      ? `💰 *Total Amount:* ₹${totalAmount.toLocaleString('en-IN')}\n`
      : `💰 *Total Amount:* ₹${serviceCharge.toLocaleString('en-IN')}\n`;

  const dateVal = sc.payment_date || sc.created_at;
  const formattedDate = formatDisplayDate(dateVal);
  const receiptStr = sc.receipt_number ? ` (Receipt No: ${sc.receipt_number})` : '';
  const dateLine = formattedDate ? `📅 *Date:* ${formattedDate}${receiptStr}\n` : '';

  const { cleanNotes } = parseServiceMeta(sc.notes);

  return (
    `*Best Auto Parts & Online Services* 🏍️\n` +
    `*Kailashpur, Saharanpur* | +91 96347 22174\n\n` +
    `Hello *${sc.customer_name}*,\n` +
    `Status update regarding your *${sc.service_type}* request${refStr}:\n\n` +
    `📌 *Current Stage:* ${stageTitle}\n` +
    govtFeeLine +
    serviceChargeLine +
    totalLine +
    dateLine +
    (cleanNotes ? `\n📝 *Notes:* ${cleanNotes}\n\n` : '\n') +
    `For any questions or documents, feel free to reply directly or contact *Saud Khan (+91 96347 22174)*.\nHave a wonderful day!`
  );
}

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
        return data.map((item) => normalizeServiceCase(item));
      }
      if (error) {
        console.warn('[service-cases] DB query fallback notice:', error.message);
      }
    } catch (err) {
      console.warn('[service-cases] Exception querying DB, using fallback:', err);
    }
  }

  // Fallback to in-memory store
  return Array.from(inMemoryServiceCases.values())
    .map((item) => normalizeServiceCase(item))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Retrieves a single service case by ID.
 */
export async function getServiceCaseById(
  id: string,
  db?: SupabaseClient | null
): Promise<ServiceCase | null> {
  const client = db || getAdminClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('service_cases')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        return normalizeServiceCase(data);
      }
    } catch (err) {
      console.warn('[service-cases] Exception fetching case by ID:', err);
    }
  }
  const mem = inMemoryServiceCases.get(id);
  return mem ? normalizeServiceCase(mem) : null;
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

  const govt_fee = Number(input.govt_fee) || 0;
  const service_charge =
    input.service_charge !== undefined
      ? Number(input.service_charge) || 0
      : Number(input.fee_amount) || 0;
  const fee_amount =
    govt_fee + service_charge > 0 ? govt_fee + service_charge : Number(input.fee_amount) || 0;
  const receipt_number = input.receipt_number?.trim() || null;
  const payment_date = input.payment_date?.trim() || null;

  const notesWithMeta = injectServiceMeta(input.notes, {
    govt_fee,
    service_charge,
    receipt_number,
    payment_date,
  });

  const rawCase: ServiceCase = {
    id,
    account_id: input.account_id || null,
    customer_name: input.customer_name.trim(),
    phone: input.phone.trim(),
    service_type: input.service_type,
    vehicle_or_ref: (input.vehicle_or_ref || '').trim(),
    notes: input.notes?.trim() || null,
    fee_amount,
    govt_fee,
    service_charge,
    receipt_number,
    payment_date,
    payment_status: input.payment_status || 'UNPAID',
    stage: input.stage || 'NEW_INQUIRY',
    created_at: now,
    updated_at: now,
  };

  if (client) {
    try {
      // 1. Try inserting with all dedicated columns
      const { data, error } = await client
        .from('service_cases')
        .insert({
          customer_name: rawCase.customer_name,
          phone: rawCase.phone,
          service_type: rawCase.service_type,
          vehicle_or_ref: rawCase.vehicle_or_ref,
          notes: notesWithMeta,
          fee_amount: rawCase.fee_amount,
          govt_fee: rawCase.govt_fee,
          service_charge: rawCase.service_charge,
          receipt_number: rawCase.receipt_number,
          payment_date: rawCase.payment_date,
          payment_status: rawCase.payment_status,
          stage: rawCase.stage,
          account_id: rawCase.account_id,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (!error && data) {
        const normalized = normalizeServiceCase(data);
        inMemoryServiceCases.set(normalized.id, normalized);
        return normalized;
      }

      // 2. Fallback if new columns are not migrated yet
      if (error) {
        const { data: baseData, error: baseError } = await client
          .from('service_cases')
          .insert({
            customer_name: rawCase.customer_name,
            phone: rawCase.phone,
            service_type: rawCase.service_type,
            vehicle_or_ref: rawCase.vehicle_or_ref,
            notes: notesWithMeta,
            fee_amount: rawCase.fee_amount,
            payment_status: rawCase.payment_status,
            stage: rawCase.stage,
            account_id: rawCase.account_id,
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single();

        if (!baseError && baseData) {
          const normalized = normalizeServiceCase({
            ...baseData,
            govt_fee,
            service_charge,
            receipt_number,
            payment_date,
          });
          inMemoryServiceCases.set(normalized.id, normalized);
          return normalized;
        }
      }
    } catch (err) {
      console.warn('[service-cases] DB insert exception:', err);
    }
  }

  inMemoryServiceCases.set(id, rawCase);
  return rawCase;
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

  const existing = (await getServiceCaseById(id, client)) || inMemoryServiceCases.get(id);

  const govt_fee =
    input.govt_fee !== undefined ? Number(input.govt_fee) || 0 : existing?.govt_fee;

  const service_charge =
    input.service_charge !== undefined
      ? Number(input.service_charge) || 0
      : input.fee_amount !== undefined
      ? Number(input.fee_amount) || 0
      : existing?.service_charge;

  const fee_amount =
    govt_fee !== undefined || service_charge !== undefined
      ? (govt_fee || 0) + (service_charge || 0)
      : input.fee_amount !== undefined
      ? Number(input.fee_amount) || 0
      : existing?.fee_amount || 0;

  const receipt_number =
    input.receipt_number !== undefined
      ? input.receipt_number?.trim() || null
      : existing?.receipt_number || null;

  const payment_date =
    input.payment_date !== undefined
      ? input.payment_date?.trim() || null
      : existing?.payment_date || null;

  const notesWithMeta = injectServiceMeta(
    input.notes !== undefined ? input.notes : existing?.notes,
    {
      govt_fee,
      service_charge,
      receipt_number,
      payment_date,
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayloadWithColumns: any = {
    ...input,
    updated_at: now,
  };
  if (notesWithMeta !== undefined) {
    updatePayloadWithColumns.notes = notesWithMeta;
  }
  if (fee_amount !== undefined) {
    updatePayloadWithColumns.fee_amount = fee_amount;
  }
  if (govt_fee !== undefined) {
    updatePayloadWithColumns.govt_fee = govt_fee;
  }
  if (service_charge !== undefined) {
    updatePayloadWithColumns.service_charge = service_charge;
  }
  if (receipt_number !== undefined) {
    updatePayloadWithColumns.receipt_number = receipt_number;
  }
  if (payment_date !== undefined) {
    updatePayloadWithColumns.payment_date = payment_date;
  }

  if (client) {
    try {
      const { data, error } = await client
        .from('service_cases')
        .update(updatePayloadWithColumns)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (!error && data) {
        const normalized = normalizeServiceCase(data);
        inMemoryServiceCases.set(id, normalized);
        return normalized;
      }

      // If dedicated column fails, fallback to updating base fields with metadata in notes
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const basePayload: any = { ...input, updated_at: now };
        delete basePayload.govt_fee;
        delete basePayload.service_charge;
        delete basePayload.receipt_number;
        delete basePayload.payment_date;
        if (notesWithMeta !== undefined) {
          basePayload.notes = notesWithMeta;
        }
        if (fee_amount !== undefined) {
          basePayload.fee_amount = fee_amount;
        }

        const { data: baseData, error: baseError } = await client
          .from('service_cases')
          .update(basePayload)
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (!baseError && baseData) {
          const normalized = normalizeServiceCase({
            ...baseData,
            govt_fee,
            service_charge,
            receipt_number,
            payment_date,
          });
          inMemoryServiceCases.set(id, normalized);
          return normalized;
        }
      }
    } catch (err) {
      console.warn('[service-cases] DB update exception:', err);
    }
  }

  // Update in-memory fallback
  if (!existing) return null;

  const updated: ServiceCase = normalizeServiceCase({
    ...existing,
    ...input,
    govt_fee: govt_fee ?? existing.govt_fee,
    service_charge: service_charge ?? existing.service_charge,
    receipt_number: receipt_number ?? existing.receipt_number,
    payment_date: payment_date ?? existing.payment_date,
    fee_amount,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    updated_at: now,
  });

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
 * Detects vehicle registration number (e.g., UP11BT4854) or PAN (e.g., ABCDE1234F) from text.
 */
export function extractVehicleOrRef(text: string): { vehicle?: string; pan?: string } {
  const raw = (text || '').toUpperCase();
  const cleanRaw = raw.replace(/[-_]/g, ' ');
  const regMatch = cleanRaw.match(/\b([A-Z]{2}\s*[0-9]{1,2}\s*[A-Z]{0,3}\s*[0-9]{4})\b/);
  const panMatch = raw.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
  return {
    vehicle: regMatch ? regMatch[1].replace(/\s+/g, '') : undefined,
    pan: panMatch ? panMatch[1] : undefined,
  };
}

/**
 * Check if an open (non-completed) case exists for a given phone number and optional service type.
 */
export async function hasOpenServiceCaseForPhone(
  phone: string,
  serviceType?: ServiceType,
  db?: SupabaseClient | null
): Promise<boolean> {
  const p10 = cleanPhone(phone);
  if (!p10) return false;

  const client = db || getAdminClient();

  if (client) {
    try {
      let query = client
        .from('service_cases')
        .select('id, stage, phone, service_type')
        .neq('stage', 'COMPLETED')
        .order('created_at', { ascending: false })
        .limit(20);

      if (serviceType) {
        query = query.eq('service_type', serviceType);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.some(
          (c) => cleanPhone(c.phone) === p10 && (!serviceType || c.service_type === serviceType)
        );
      }
    } catch (err) {
      console.warn('[service-cases] DB check open case notice:', err);
    }
  }

  // Check fallback store
  return Array.from(inMemoryServiceCases.values()).some(
    (c) => c.stage !== 'COMPLETED' && cleanPhone(c.phone) === p10 && (!serviceType || c.service_type === serviceType)
  );
}

/**
 * Retrieves the most recent open (non-completed) case for a given phone and optional service type.
 */
export async function getOpenServiceCaseForPhone(
  phone: string,
  serviceType?: ServiceType,
  db?: SupabaseClient | null
): Promise<ServiceCase | null> {
  const p10 = cleanPhone(phone);
  if (!p10) return null;

  const client = db || getAdminClient();
  if (client) {
    try {
      let query = client
        .from('service_cases')
        .select('*')
        .neq('stage', 'COMPLETED')
        .order('created_at', { ascending: false });

      if (serviceType) {
        query = query.eq('service_type', serviceType);
      }

      const { data, error } = await query.limit(10);
      if (!error && Array.isArray(data)) {
        const found = data.find(
          (c) => cleanPhone(c.phone) === p10 && (!serviceType || c.service_type === serviceType)
        );
        if (found) return normalizeServiceCase(found);
      }
    } catch (err) {
      console.warn('[service-cases] Exception fetching open case:', err);
    }
  }

  const memory = Array.from(inMemoryServiceCases.values()).find(
    (c) => c.stage !== 'COMPLETED' && cleanPhone(c.phone) === p10 && (!serviceType || c.service_type === serviceType)
  );
  return memory ? normalizeServiceCase(memory) : null;
}

/**
 * Builds the polite handover response confirming saved details, requesting the RC photo (for vehicle services),
 * and introducing Portal Expert Saud Khan (+91 96347 22174).
 */
export function buildOnlineServiceHandoverReply(args: {
  serviceType: ServiceType;
  vehicleOrRef?: string;
  isImage?: boolean;
}): string {
  const { serviceType, vehicleOrRef, isImage } = args;

  if (isImage) {
    return (
      '📸 *RC Photo Received & Saved!*\n\n' +
      'Aapki RC photo hamare service record me save ho gayi hai.\n\n' +
      'Aapki chat aur details ab hamare Customer Care / Portal Expert *Saud Khan (+91 96347 22174)* ko transfer kar di gayi hain. ' +
      'Woh official portal par check karke jald hi aapko message ya call par exact details share karenge. — *Best Auto Parts & Online Services*'
    );
  }

  const refLabel = vehicleOrRef ? `• *Vehicle / Ref:* ${vehicleOrRef}\n` : '';

  switch (serviceType) {
    case 'Vehicle Insurance':
      return (
        '🛡️ *Vehicle Insurance Details Saved!*\n' +
        refLabel +
        '• *Service:* Vehicle Insurance\n\n' +
        '📸 *Next Step:* Kripya apne vehicle ki *RC ki photo* (ya RC Valid Upto Date) aur purani policy expiry date share karein, ' +
        'aur batayein ki policy Third-Party chahiye ya Comprehensive / Full.\n\n' +
        'Aapki chat aur details ab hamare Customer Care / Portal Expert *Saud Khan (+91 96347 22174)* ko transfer kar di gayi hain. ' +
        'Woh official portal par check karke jald hi aapko message ya call par exact details share karenge. — *Best Auto Parts & Online Services*'
      );

    case 'ITR':
      return (
        '📊 *Annual ITR Filing Details Saved!*\n' +
        refLabel +
        '• *Service:* Annual ITR Filing (FY 2025-26)\n\n' +
        '📋 *Next Step:* Kripya batayein:\n' +
        '1️⃣ Occupation Type: Service / Salaried ya Self-Employed / Business\n' +
        '2️⃣ Approximate Annual Income / Business Turnover\n' +
        '3️⃣ Full Name & PAN Card photo / number\n\n' +
        'Aapki chat aur details ab hamare Customer Care / Portal Expert *Saud Khan (+91 96347 22174)* ko transfer kar di gayi hain. ' +
        'Woh official portal par check karke jald hi aapko message ya call par exact details share karenge. — *Best Auto Parts & Online Services*'
      );

    case 'RTO Road Tax':
      return (
        '🚔 *RTO Road Tax Details Saved!*\n' +
        refLabel +
        '• *Service:* RTO Road Tax\n\n' +
        '📸 *Next Step:* Kripya apne vehicle ki *RC ki photo* (ya RC Valid Upto Date) aur State Name & Tax Period (Quarterly / Annual / One-Time / Lifetime) share karein.\n\n' +
        'Aapki chat aur details ab hamare Customer Care / Portal Expert *Saud Khan (+91 96347 22174)* ko transfer kar di gayi hain. ' +
        'Woh official portal par check karke jald hi aapko message ya call par exact details share karenge. — *Best Auto Parts & Online Services*'
      );

    case 'State Border Tax':
      return (
        '🚔 *State Border Tax Details Saved!*\n' +
        refLabel +
        '• *Service:* State Border Tax\n\n' +
        '📸 *Next Step:* Kripya apne vehicle ki *RC ki photo* (ya RC Valid Upto Date), Entry State (e.g. Uttarakhand, Haryana, Delhi), aur Entry Date & Duration (Days / Weekly / Monthly) share karein.\n\n' +
        'Aapki chat aur details ab hamare Customer Care / Portal Expert *Saud Khan (+91 96347 22174)* ko transfer kar di gayi hain. ' +
        'Woh official portal par check karke jald hi aapko message ya call par exact details share karenge. — *Best Auto Parts & Online Services*'
      );

    case 'E-Challan':
    default:
      return (
        '🚔 *E-Challan Settlement Details Saved!*\n' +
        refLabel +
        '• *Service:* E-Challan Service\n\n' +
        '📸 *Next Step:* Kripya apne vehicle ki *RC ki photo* ya Chassis / Engine number ke aakhri 5 digits share karein taaki Parivahan portal par challan verify kiya ja sake.\n\n' +
        'Aapki chat aur details ab hamare Customer Care / Portal Expert *Saud Khan (+91 96347 22174)* ko transfer kar di gayi hain. ' +
        'Woh official portal par check karke jald hi aapko message ya call par exact details share karenge. — *Best Auto Parts & Online Services*'
      );
  }
}

/**
 * Auto-creates a new service case from WhatsApp inbound inquiry if none open for this service.
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

  const alreadyOpen = await hasOpenServiceCaseForPhone(phone, serviceType, db);
  if (alreadyOpen) {
    console.log(`[service-cases] Open ${serviceType} case already exists for phone ${phone}. Skipping auto-create.`);
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
 * Manages separate (phone, service_type) cards, detects vehicle number or PAN,
 * and updates stage to PORTAL_CHECK once vehicle/PAN details are received.
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
  const { vehicle, pan } = extractVehicleOrRef(messageText);
  const vehicleOrRef = serviceType === 'ITR' ? (pan || vehicle || '') : (vehicle || pan || '');

  // 2. Check for an existing open case for (phone, service_type)
  const openCase = await getOpenServiceCaseForPhone(phone, serviceType, client);

  const detailNote = `[WhatsApp Details]: ${messageText.trim()}`;

  // 3. Update existing open case or create a new one
  if (openCase) {
    const updatedNotes = openCase.notes
      ? `${openCase.notes}\n${detailNote}`
      : detailNote;

    const nextStage: ServiceStage =
      vehicleOrRef || openCase.vehicle_or_ref
        ? 'PORTAL_CHECK'
        : (openCase.stage === 'NEW_INQUIRY' ? 'PORTAL_CHECK' : openCase.stage);

    const updatePayload: UpdateServiceCaseInput = {
      notes: updatedNotes,
      stage: nextStage,
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
      stage: vehicleOrRef ? 'PORTAL_CHECK' : 'PORTAL_CHECK',
      payment_status: 'UNPAID',
      fee_amount: 0,
      account_id: accountId,
    },
    client
  );
}

/**
 * Handles incoming follow-up messages or RC photos for active online services.
 * Updates service_cases, transitions stage to PORTAL_CHECK, and sends immediate polite reply
 * confirming received details, requesting RC photo, and transferring customer to Saud Khan (+91 96347 22174).
 */
export async function handleOnlineServiceFollowUp(args: {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  phone: string;
  customerName?: string;
  inboundText: string;
  isImage?: boolean;
  forcedServiceType?: ServiceType;
}): Promise<{
  handled: boolean;
  replyText?: string;
  serviceType?: ServiceType;
  whatsappMessageId?: string;
}> {
  const {
    db,
    accountId,
    userId,
    conversationId,
    contactId,
    phone,
    customerName,
    inboundText,
    isImage,
    forcedServiceType,
  } = args;

  const p10 = cleanPhone(phone);
  if (!p10) return { handled: false };

  // 1. Determine service type
  let serviceType: ServiceType | undefined = forcedServiceType;
  let existingCase: ServiceCase | null = null;

  if (serviceType) {
    existingCase = await getOpenServiceCaseForPhone(phone, serviceType, db);
  } else {
    existingCase = await getOpenServiceCaseForPhone(phone, undefined, db);
    if (existingCase) {
      serviceType = existingCase.service_type;
    }
  }

  // If no open case was found, inspect text for registration number or PAN to infer service
  const { vehicle, pan } = extractVehicleOrRef(inboundText);
  if (!serviceType) {
    if (pan) {
      serviceType = 'ITR';
    } else if (vehicle) {
      serviceType = 'RTO Road Tax';
    }
  }

  if (!serviceType) {
    return { handled: false };
  }

  // 2. Sync details to service_cases
  const vehicleOrRef = serviceType === 'ITR' ? (pan || vehicle || '') : (vehicle || pan || '');
  await syncServiceCaseFromChat({
    phone,
    customerName,
    serviceType,
    messageText: isImage ? '[RC Photo Uploaded via WhatsApp]' : inboundText,
    accountId,
    db,
  });

  // 3. Build immediate polite reply
  const replyText = buildOnlineServiceHandoverReply({
    serviceType,
    vehicleOrRef: vehicleOrRef || existingCase?.vehicle_or_ref,
    isImage,
  });

  // 4. Send WhatsApp session message
  try {
    const sendRes = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: replyText,
    });

    return {
      handled: true,
      replyText,
      serviceType,
      whatsappMessageId: sendRes.whatsapp_message_id,
    };
  } catch (sendErr) {
    console.error('[service-cases] Failed sending online service follow-up reply:', sendErr);
    return {
      handled: true,
      replyText,
      serviceType,
    };
  }
}
