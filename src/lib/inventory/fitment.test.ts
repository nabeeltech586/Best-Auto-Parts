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
      manufacturer: 'Toyota',
      model: 'Camry',
      variant: 'XLE',
      year_from: 2018,
      year_to: 2023,
      engine: '2.5L 4-Cyl',
      fuel_type: 'Hybrid',
    });

    expect(text).toBe('Toyota Camry XLE (2018 - 2023) • 2.5L 4-Cyl Hybrid');
  });

  it('formats open-ended year range with plus symbol', () => {
    const text = formatVehicleFitment({
      manufacturer: 'Ford',
      model: 'F-150',
      variant: null,
      year_from: 2021,
      year_to: null,
      engine: '3.5L EcoBoost',
      fuel_type: null,
    });

    expect(text).toBe('Ford F-150 (2021+) • 3.5L EcoBoost');
  });

  it('formats base vehicle without optional engine or fuel', () => {
    const text = formatVehicleFitment({
      manufacturer: 'Honda',
      model: 'Civic',
      variant: null,
      year_from: 2016,
      year_to: 2021,
      engine: null,
      fuel_type: null,
    });

    expect(text).toBe('Honda Civic (2016 - 2021)');
  });
});

describe('vehicle constants', () => {
  it('exports common automotive vehicle makes', () => {
    expect(COMMON_VEHICLE_MAKES).toContain('Toyota');
    expect(COMMON_VEHICLE_MAKES).toContain('BMW');
    expect(COMMON_VEHICLE_MAKES).toContain('Ford');
  });

  it('exports automotive fuel types', () => {
    expect(FUEL_TYPES).toContain('Diesel');
    expect(FUEL_TYPES).toContain('Hybrid');
  });
});
