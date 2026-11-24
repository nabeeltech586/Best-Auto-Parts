import { describe, expect, it } from 'vitest';
import {
  validateFitmentYearRange,
  formatVehicleFitment,
  COMMON_VEHICLE_MAKES,
  FUEL_TYPES,
} from './fitment';

describe('validateFitmentYearRange', () => {
  it('passes on valid closed year range', () => {
    const result = validateFitmentYearRange(2018, 2023);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('passes on open-ended year range (yearTo omitted)', () => {
    const result = validateFitmentYearRange(2021);
    expect(result.valid).toBe(true);
  });

  it('passes when yearFrom equals yearTo (single year vehicle)', () => {
    const result = validateFitmentYearRange(2020, 2020);
    expect(result.valid).toBe(true);
  });

  it('fails if yearFrom is out of realistic bounds', () => {
    const resultOld = validateFitmentYearRange(1850);
    expect(resultOld.valid).toBe(false);
    expect(resultOld.error).toContain('between 1900');

    const resultFuture = validateFitmentYearRange(2099);
    expect(resultFuture.valid).toBe(false);
  });

  it('fails if yearTo is less than yearFrom', () => {
    const result = validateFitmentYearRange(2022, 2018);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('greater than or equal to Year from');
  });
});

describe('formatVehicleFitment', () => {
  it('formats full fitment with variant, engine, and fuel type', () => {
    const text = formatVehicleFitment({
      manufacturer: 'Hero',
      model: 'Splendor Plus',
      variant: 'XTEC',
      year_from: 2018,
      year_to: 2024,
      engine: '97.2cc Single-Cyl',
      fuel_type: 'Petrol',
    });

    expect(text).toBe('Hero Splendor Plus XTEC (2018 - 2024) • 97.2cc Single-Cyl Petrol');
  });

  it('formats open-ended year range with plus symbol', () => {
    const text = formatVehicleFitment({
      manufacturer: 'Bajaj',
      model: 'Pulsar 150',
      variant: null,
      year_from: 2020,
      year_to: null,
      engine: '149.5cc DTS-i',
      fuel_type: null,
    });

    expect(text).toBe('Bajaj Pulsar 150 (2020+) • 149.5cc DTS-i');
  });

  it('formats base vehicle without optional engine or fuel', () => {
    const text = formatVehicleFitment({
      manufacturer: 'Honda',
      model: 'Activa 6G',
      variant: null,
      year_from: 2020,
      year_to: 2025,
      engine: null,
      fuel_type: null,
    });

    expect(text).toBe('Honda Activa 6G (2020 - 2025)');
  });
});

describe('vehicle constants', () => {
  it('exports strictly Bajaj, Hero, and Honda two-wheeler makes', () => {
    expect(COMMON_VEHICLE_MAKES).toEqual(['Bajaj', 'Hero', 'Honda']);
  });

  it('exports two-wheeler fuel types', () => {
    expect(FUEL_TYPES).toContain('Petrol');
    expect(FUEL_TYPES).toContain('Electric (EV)');
    expect(FUEL_TYPES).toContain('CNG');
  });
});
