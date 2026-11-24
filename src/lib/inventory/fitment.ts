import type { VehicleFitment } from '@/types/inventory';

/**
 * Two-Wheeler Makes Exclusively for Best Auto Parts
 * Kailashpur, Saharanpur, UP
 */
export const COMMON_VEHICLE_MAKES = [
  'Bajaj',
  'Hero',
  'Honda',
] as const;

export type BikeMake = (typeof COMMON_VEHICLE_MAKES)[number];

export const BIKE_MODELS_BY_MAKE: Record<BikeMake, readonly string[]> = {
  Bajaj: [
    'Pulsar 150',
    'Pulsar 180',
    'Pulsar 220',
    'Platina 100/110',
    'CT 100',
    'Discover 125',
    'Avenger 160/220',
    'Dominar 400',
    'Chetak EV',
  ],
  Hero: [
    'Splendor Plus',
    'Super Splendor',
    'HF Deluxe',
    'Passion Pro',
    'Glamour 125',
    'Xtreme 160R/200S',
    'Xpulse 200',
    'Maestro Edge',
    'Pleasure Plus',
  ],
  Honda: [
    'Activa 3G/4G/5G/6G',
    'CB Shine 125',
    'SP 125',
    'Unicorn 150/160',
    'Hornet 2.0',
    'Dio 110/125',
    'CD 110 Dream',
    'Livo',
  ],
} as const;

export const ALL_POPULAR_BIKE_MODELS: readonly string[] = [
  ...BIKE_MODELS_BY_MAKE.Bajaj,
  ...BIKE_MODELS_BY_MAKE.Hero,
  ...BIKE_MODELS_BY_MAKE.Honda,
];

export const COMMON_PART_CATEGORIES = [
  'Braking System',
  'Engine & Mechanical',
  'Filtration',
  'Suspension & Steering',
  'Transmission & Drivetrain',
  'Electrical & Lighting',
  'Cooling & Heating',
  'Exhaust & Emission',
  'Fuel System',
  'Body & Exterior',
  'Interior & Accessories',
  'Tires & Wheels',
] as const;

export const FUEL_TYPES = [
  'Petrol',
  'Electric (EV)',
  'CNG',
] as const;

/**
 * Validate vehicle fitment year range.
 */
export function validateFitmentYearRange(
  yearFrom: number,
  yearTo?: number | null,
): { valid: boolean; error?: string } {
  const currentYear = new Date().getFullYear();
  const maxAllowedYear = currentYear + 2;

  if (isNaN(yearFrom) || yearFrom < 1900 || yearFrom > maxAllowedYear) {
    return {
      valid: false,
      error: `Year from must be between 1900 and ${maxAllowedYear}`,
    };
  }

  if (yearTo !== undefined && yearTo !== null) {
    if (isNaN(yearTo) || yearTo < 1900 || yearTo > maxAllowedYear) {
      return {
        valid: false,
        error: `Year to must be between 1900 and ${maxAllowedYear}`,
      };
    }
    if (yearTo < yearFrom) {
      return {
        valid: false,
        error: 'Year to must be greater than or equal to Year from',
      };
    }
  }

  return { valid: true };
}

/**
 * Format a vehicle fitment entry into a human-readable string.
 * e.g. "Hero Splendor Plus (2018 - 2024) • 97.2cc Single-Cyl Petrol"
 */
export function formatVehicleFitment(
  fitment: Pick<
    VehicleFitment,
    | 'manufacturer'
    | 'model'
    | 'variant'
    | 'year_from'
    | 'year_to'
    | 'engine'
    | 'fuel_type'
  >,
): string {
  const years = fitment.year_to
    ? `${fitment.year_from} - ${fitment.year_to}`
    : `${fitment.year_from}+`;

  const variantStr = fitment.variant ? ` ${fitment.variant}` : '';
  const vehicle = `${fitment.manufacturer} ${fitment.model}${variantStr} (${years})`;

  const details: string[] = [];
  if (fitment.engine) details.push(fitment.engine);
  if (fitment.fuel_type) details.push(fitment.fuel_type);

  if (details.length > 0) {
    return `${vehicle} • ${details.join(' ')}`;
  }
  return vehicle;
}
