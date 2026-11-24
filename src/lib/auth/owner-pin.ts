export const DEFAULT_OWNER_PIN = '7668';
export const OWNER_PIN_STORAGE_KEY = 'bap_owner_security_pin';

/**
 * Retrieves the current Owner Security PIN from client storage or defaults to '7668'.
 */
export function getOwnerPin(): string {
  if (typeof window === 'undefined') return DEFAULT_OWNER_PIN;
  try {
    const stored = localStorage.getItem(OWNER_PIN_STORAGE_KEY);
    if (stored && /^\d{4}$/.test(stored.trim())) {
      return stored.trim();
    }
  } catch {
    // Sandboxed or private context fallback
  }
  return DEFAULT_OWNER_PIN;
}

/**
 * Saves a new 4-digit Owner Security PIN to storage.
 */
export function setOwnerPin(newPin: string): boolean {
  if (typeof window === 'undefined') return false;
  const cleaned = newPin.trim();
  if (!/^\d{4}$/.test(cleaned)) {
    return false;
  }
  try {
    localStorage.setItem(OWNER_PIN_STORAGE_KEY, cleaned);
    return true;
  } catch (err) {
    console.error('Failed to save Owner PIN to storage:', err);
    return false;
  }
}

/**
 * Validates the entered PIN against the active Owner Security PIN.
 */
export function verifyOwnerPin(enteredPin: string): boolean {
  const currentPin = getOwnerPin();
  return enteredPin.trim() === currentPin;
}
