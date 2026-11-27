import { stripPartialMetadataTag } from './partial-metadata';

export interface PaymentItemLike {
  id?: string;
  order_id: string;
  merchant_transaction_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  part_details?: string | null;
  amount: number;
  paid_amount?: number;
  remaining_amount?: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED' | string;
  razorpay_payment_link_url?: string | null;
  razorpay_payment_link_id?: string | null;
  razorpay_payment_id?: string | null;
  gateway?: string | null;
  payment_mode?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  contact_category?: 'Mechanic' | 'Customer' | string | null;
}

/**
 * Determines whether a transaction was initiated or processed via Razorpay online payment.
 * Matches razorpay_payment_id, razorpay_payment_link_id, gateway === 'razorpay',
 * or payment_mode containing RAZORPAY / ONLINE / PAYMENT_LINK.
 */
export function isRazorpayTransaction(item: PaymentItemLike): boolean {
  if (!item) return false;
  if (item.razorpay_payment_id || item.razorpay_payment_link_id) return true;
  if (item.gateway && item.gateway.toLowerCase() === 'razorpay') return true;

  const mode = (item.payment_mode || '').toUpperCase();
  if (
    mode.includes('RAZORPAY') ||
    mode.includes('ONLINE') ||
    mode.includes('PAYMENT_LINK')
  ) {
    return true;
  }

  // Also check part_details for encoded razorpay metadata
  const details = (item.part_details || '').toUpperCase();
  if (details.includes('RAZORPAY') || details.includes('PLINK_')) {
    return true;
  }

  return false;
}

/**
 * Converts any ISO or timestamp date string to 'YYYY-MM-DD' in Asia/Kolkata (IST).
 */
export function getIstDateString(isoOrDateString?: string | null): string {
  if (!isoOrDateString) return '';
  try {
    const d = new Date(isoOrDateString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Returns today's date formatted as 'YYYY-MM-DD' in Asia/Kolkata (IST).
 */
export function getTodayIstDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Returns yesterday's date formatted as 'YYYY-MM-DD' in Asia/Kolkata (IST).
 */
export function getYesterdayIstDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Formats a 'YYYY-MM-DD' date string into a friendly IST display label, e.g. "27 Nov 2026".
 */
export function formatIstDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const [year, month, day] = parts;
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export type PaymentFilterTab =
  | 'ALL'
  | 'RAZORPAY'
  | 'PAID'
  | 'PENDING'
  | 'MECHANIC'
  | 'CUSTOMER'
  | 'FAILED';

/**
 * Pure filter function used across UI and unit tests for comprehensive filtering.
 */
export function filterPayments<T extends PaymentItemLike>(
  items: T[],
  options: {
    activeTab?: PaymentFilterTab;
    selectedDate?: string; // 'YYYY-MM-DD' in IST
    search?: string;
  }
): T[] {
  const { activeTab = 'ALL', selectedDate = '', search = '' } = options;
  const cleanSearch = search.trim().toLowerCase();

  return items.filter((item) => {
    // 1. Status / Category / Razorpay tab filter
    if (activeTab === 'RAZORPAY') {
      if (!isRazorpayTransaction(item)) return false;
    } else if (activeTab === 'PAID') {
      if (item.status !== 'PAID') return false;
    } else if (activeTab === 'PENDING') {
      if (item.status !== 'PENDING' && item.status !== 'PARTIAL') return false;
    } else if (activeTab === 'FAILED') {
      if (item.status !== 'FAILED') return false;
    } else if (activeTab === 'MECHANIC') {
      if (item.contact_category !== 'Mechanic') return false;
    } else if (activeTab === 'CUSTOMER') {
      if (item.contact_category !== 'Customer') return false;
    }

    // 2. IST Date filter
    if (selectedDate) {
      const itemIstDate = getIstDateString(item.paid_at || item.created_at);
      if (itemIstDate !== selectedDate) return false;
    }

    // 3. Search query filter
    if (cleanSearch) {
      const name = (item.customer_name || '').toLowerCase();
      const phone = (item.customer_phone || '').toLowerCase();
      const orderId = (item.order_id || '').toLowerCase();
      const txnId = (item.merchant_transaction_id || '').toLowerCase();
      const details = stripPartialMetadataTag(item.part_details || '').toLowerCase();
      const rzpId = (item.razorpay_payment_id || '').toLowerCase();

      const matches =
        name.includes(cleanSearch) ||
        phone.includes(cleanSearch) ||
        orderId.includes(cleanSearch) ||
        txnId.includes(cleanSearch) ||
        details.includes(cleanSearch) ||
        rzpId.includes(cleanSearch);

      if (!matches) return false;
    }

    return true;
  });
}
