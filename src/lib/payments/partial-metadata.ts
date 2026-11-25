/**
 * Partial Payment Metadata Engine for Best Auto Parts CRM.
 *
 * Provides safe serialization and deserialization of partial payment states
 * (paid_amount, remaining_amount, mode, utr) across both dedicated Supabase
 * columns and schema-fallback fields (part_details / phonepe_transaction_id).
 */

export interface ParsedPaymentAmounts {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED';
  paymentMode?: string | null;
  utr?: string | null;
}

const PARTIAL_TAG_REGEX = /\[PARTIAL:paid=([0-9.]+):remaining=([0-9.]+)(?::mode=([^:]*))?(?::utr=([^\]]*))?\]/i;
const SHORT_TXN_REGEX = /^PARTIAL:([0-9.]+):([0-9.]+)(?::(.*))?$/i;

/**
 * Encodes partial payment tracking metadata into an idempotent bracketed tag
 * suitable for persisting in part_details or notes fields.
 */
export function encodePartialMetadata(opts: {
  paidAmount: number;
  remainingAmount: number;
  mode?: string | null;
  utr?: string | null;
}): string {
  const paid = Math.max(0, opts.paidAmount).toFixed(2);
  const remaining = Math.max(0, opts.remainingAmount).toFixed(2);
  const mode = (opts.mode || 'UPI / QR').trim().replace(/[:\]]/g, ' ');
  const utr = (opts.utr || '').trim().replace(/[:\]]/g, ' ');

  return `[PARTIAL:paid=${paid}:remaining=${remaining}:mode=${mode}:utr=${utr}]`;
}

/**
 * Strips the internal `[PARTIAL:...]` tracking tag from part details text
 * so invoices, receipts, and UI labels always display clean spare part names.
 */
export function stripPartialMetadataTag(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/\s*\[PARTIAL:[^\]]+\]/gi, '')
    .trim();
}

/**
 * Resolves accurate `paidAmount`, `remainingAmount`, and `status` ('PAID' | 'PARTIAL' | 'PENDING' | 'FAILED')
 * from a payment link record, checking dedicated columns first and structured fallback metadata second.
 */
export function parsePaymentAmountsAndStatus(item: {
  amount?: number | string | null;
  status?: string | null;
  paid_amount?: number | string | null;
  remaining_amount?: number | string | null;
  part_details?: string | null;
  phonepe_transaction_id?: string | null;
  payment_mode?: string | null;
}): ParsedPaymentAmounts {
  const totalAmount = Math.max(0, Number(item.amount) || 0);
  const rawStatus = (item.status || 'PENDING').toUpperCase();

  // 1. If explicitly marked PAID, all balance is settled
  if (rawStatus === 'PAID') {
    return {
      totalAmount,
      paidAmount: totalAmount,
      remainingAmount: 0,
      status: 'PAID',
      paymentMode: item.payment_mode || 'UPI / QR',
      utr: item.phonepe_transaction_id || null,
    };
  }

  // 2. Check dedicated columns if present and populated
  const hasDedicatedPaid =
    item.paid_amount !== undefined &&
    item.paid_amount !== null &&
    !isNaN(Number(item.paid_amount)) &&
    Number(item.paid_amount) > 0;

  if (hasDedicatedPaid) {
    const paidAmount = Number(item.paid_amount);
    const remainingAmount =
      item.remaining_amount !== undefined && item.remaining_amount !== null && !isNaN(Number(item.remaining_amount))
        ? Number(item.remaining_amount)
        : Math.max(0, totalAmount - paidAmount);

    const derivedStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED' =
      remainingAmount <= 0
        ? 'PAID'
        : paidAmount > 0
        ? 'PARTIAL'
        : (rawStatus as 'PENDING' | 'FAILED');

    return {
      totalAmount,
      paidAmount,
      remainingAmount,
      status: derivedStatus,
      paymentMode: item.payment_mode || null,
      utr: item.phonepe_transaction_id || null,
    };
  }

  // 3. Check part_details for encoded partial metadata fallback
  if (item.part_details) {
    const match = item.part_details.match(PARTIAL_TAG_REGEX);
    if (match) {
      const parsedPaid = Math.max(0, Number(match[1]) || 0);
      const parsedRem = Math.max(0, Number(match[2]) || 0);
      const parsedMode = match[3]?.trim() || item.payment_mode || null;
      const parsedUtr = match[4]?.trim() || item.phonepe_transaction_id || null;

      const derivedStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED' =
        parsedRem <= 0 || (totalAmount > 0 && parsedPaid >= totalAmount)
          ? 'PAID'
          : parsedPaid > 0
          ? 'PARTIAL'
          : 'PENDING';

      return {
        totalAmount,
        paidAmount: parsedPaid,
        remainingAmount: parsedRem,
        status: derivedStatus,
        paymentMode: parsedMode,
        utr: parsedUtr,
      };
    }
  }

  // 4. Check phonepe_transaction_id for short-form PARTIAL:... fallback
  if (item.phonepe_transaction_id && item.phonepe_transaction_id.startsWith('PARTIAL:')) {
    const match = item.phonepe_transaction_id.match(SHORT_TXN_REGEX);
    if (match) {
      const parsedPaid = Math.max(0, Number(match[1]) || 0);
      const parsedRem = Math.max(0, Number(match[2]) || 0);
      const parsedUtr = match[3]?.trim() || null;

      const derivedStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED' =
        parsedRem <= 0 || (totalAmount > 0 && parsedPaid >= totalAmount)
          ? 'PAID'
          : parsedPaid > 0
          ? 'PARTIAL'
          : 'PENDING';

      return {
        totalAmount,
        paidAmount: parsedPaid,
        remainingAmount: parsedRem,
        status: derivedStatus,
        paymentMode: item.payment_mode || null,
        utr: parsedUtr,
      };
    }
  }

  // 5. Default state for PENDING or FAILED
  return {
    totalAmount,
    paidAmount: 0,
    remainingAmount: totalAmount,
    status: (rawStatus as 'PENDING' | 'FAILED') || 'PENDING',
    paymentMode: item.payment_mode || null,
    utr: item.phonepe_transaction_id || null,
  };
}
