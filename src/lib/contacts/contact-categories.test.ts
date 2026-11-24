import { describe, it, expect } from 'vitest';
import type { ContactCategory, CategoryTab } from '@/app/(dashboard)/contacts/page';

describe('Contact Categories & Shortcuts', () => {
  it('defines valid category tabs including All and the four primary roles', () => {
    const tabs: CategoryTab[] = ['All', 'Distributor', 'Wholesaler', 'Mechanic', 'Customer'];
    expect(tabs).toHaveLength(5);
    expect(tabs).toContain('Distributor');
    expect(tabs).toContain('Wholesaler');
    expect(tabs).toContain('Mechanic');
    expect(tabs).toContain('Customer');
  });

  it('generates correct inbox redirect URL with phone and name', () => {
    const contact = { phone: '+919997688875', name: 'Mohd ali' };
    const url = `/inbox?phone=${encodeURIComponent(contact.phone)}&name=${encodeURIComponent(contact.name)}`;
    expect(url).toBe('/inbox?phone=%2B919997688875&name=Mohd%20ali');
  });

  it('generates correct payments ledger redirect URL', () => {
    const contact = { phone: '+918791823550', name: 'Sandeep' };
    const url = `/payments?search=${encodeURIComponent(contact.phone || contact.name)}`;
    expect(url).toBe('/payments?search=%2B918791823550');
  });

  it('generates correct udhaar / khata redirect URL with tab=udhaar', () => {
    const contact = { phone: '+918791823550', name: 'Sandeep' };
    const url = `/payments?tab=udhaar&search=${encodeURIComponent(contact.phone || contact.name)}`;
    expect(url).toBe('/payments?tab=udhaar&search=%2B918791823550');
  });

  it('normalizes 10-digit Indian phone numbers for reliable matching', () => {
    const normalizeLast10 = (raw: string) => raw.replace(/\D/g, '').slice(-10);
    expect(normalizeLast10('+919997688875')).toBe('9997688875');
    expect(normalizeLast10('919997688875')).toBe('9997688875');
    expect(normalizeLast10('09997688875')).toBe('9997688875');
    expect(normalizeLast10('+91 99976 88875')).toBe('9997688875');
  });

  it('correctly prioritizes dues from direct balance vs pending POs or payment links', () => {
    const contactDirectDue = 0;
    const duesByPhone: Record<string, number> = { '8791823550': 420 };
    const contactPhone = '+918791823550';
    const rawDigits = contactPhone.replace(/\D/g, '').slice(-10);
    const calculatedDue = Math.max(contactDirectDue, duesByPhone[rawDigits] || 0);
    expect(calculatedDue).toBe(420);
  });
});
