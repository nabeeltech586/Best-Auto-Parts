import type { SupabaseClient } from '@supabase/supabase-js';

export const CATEGORY_CODE_PREFIXES: Record<string, string> = {
  Customer: 'BAP-CUS',
  Mechanic: 'BAP-MEC',
  Distributor: 'BAP-DIS',
  Wholesaler: 'BAP-WHL',
};

/**
 * Returns the 3-letter prefix for a given category.
 * Defaults to 'BAP-CUS'.
 */
export function getCategoryPrefix(category?: string | null): string {
  if (category && CATEGORY_CODE_PREFIXES[category]) {
    return CATEGORY_CODE_PREFIXES[category];
  }
  return 'BAP-CUS';
}

/**
 * Deterministically generates the next unique code for a category within an account.
 * E.g., BAP-MEC-004
 */
export async function generateNextUniqueCode(
  supabase: SupabaseClient,
  accountId: string,
  category?: string | null
): Promise<string> {
  const prefix = getCategoryPrefix(category);

  try {
    let query = supabase
      .from('contacts')
      .select('unique_code')
      .eq('account_id', accountId);

    if (typeof (query as any).ilike === 'function') {
      query = (query as any).ilike('unique_code', `${prefix}-%`);
    }

    const { data: contacts } = await query;

    let maxSeq = 0;
    contacts?.forEach((c) => {
      if (c.unique_code) {
        const parts = c.unique_code.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${prefix}-${nextSeq}`;
  } catch (err) {
    console.error('Error generating next unique code:', err);
    return `${prefix}-001`;
  }
}

/**
 * Returns contact's unique code or a deterministic fallback
 */
export function getContactUniqueCode(
  contact: { unique_code?: string | null; category?: string | null; id?: string },
  fallbackIndex = 1
): string {
  if (contact.unique_code) return contact.unique_code;
  const prefix = getCategoryPrefix(contact.category);
  return `${prefix}-${String(fallbackIndex).padStart(3, '0')}`;
}
