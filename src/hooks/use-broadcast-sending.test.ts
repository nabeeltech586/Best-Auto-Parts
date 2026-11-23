import { describe, it, expect } from 'vitest';
import { resolveVariables, type VariableMapping } from './use-broadcast-sending';
import type { Contact } from '@/types';

describe('useBroadcastSending - resolveVariables', () => {
  const sampleContact: Contact = {
    id: 'c-1',
    user_id: 'u-1',
    account_id: 'a-1',
    name: 'Saud Bhai',
    phone: '+919634722174',
    email: 'saud@bestautoparts.in',
    company: 'Best Auto Parts',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const unnamedContact: Contact = {
    ...sampleContact,
    id: 'c-2',
    name: '',
  };

  it('resolves real contact name when present', () => {
    const variables: Record<string, VariableMapping> = {
      '1': { type: 'field', value: 'name', fallback: 'Valued Customer' },
    };

    const resolved = resolveVariables(variables, sampleContact);
    expect(resolved).toEqual(['Saud Bhai']);
  });

  it('falls back to default fallback when contact name is blank', () => {
    const variables: Record<string, VariableMapping> = {
      '1': { type: 'field', value: 'name', fallback: 'Valued Customer' },
    };

    const resolved = resolveVariables(variables, unnamedContact);
    expect(resolved).toEqual(['Valued Customer']);
  });

  it('falls back to custom fallback if specified', () => {
    const variables: Record<string, VariableMapping> = {
      '1': { type: 'field', value: 'name', fallback: 'Customer' },
    };

    const resolved = resolveVariables(variables, unnamedContact);
    expect(resolved).toEqual(['Customer']);
  });

  it('resolves static values and multiple sorted numeric variables', () => {
    const variables: Record<string, VariableMapping> = {
      '2': { type: 'static', value: '10% Discount' },
      '1': { type: 'field', value: 'name' },
      '10': { type: 'static', value: 'Kailashpur, Saharanpur' },
    };

    const resolved = resolveVariables(variables, sampleContact);
    expect(resolved).toEqual(['Saud Bhai', '10% Discount', 'Kailashpur, Saharanpur']);
  });

  it('resolves custom fields from custom value map', () => {
    const customMap = new Map<string, string>([['field-bike', 'Bajaj Pulsar 150']]);

    const variables: Record<string, VariableMapping> = {
      '1': { type: 'field', value: 'name' },
      '2': { type: 'custom_field', value: 'field-bike', fallback: 'Motorcycle' },
    };

    const resolved = resolveVariables(variables, sampleContact, customMap);
    expect(resolved).toEqual(['Saud Bhai', 'Bajaj Pulsar 150']);
  });
});
