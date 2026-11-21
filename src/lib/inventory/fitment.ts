import type { VehicleFitment } from '@/types/inventory';

export const COMMON_VEHICLE_MAKES = [
  'Acura',
  'Alfa Romeo',
  'Audi',
  'BMW',
  'Buick',
  'Cadillac',
  'Chevrolet',
  'Chrysler',
  'Dodge',
  'Ford',
  'GMC',
  'Honda',
  'Hyundai',
  'Infiniti',
  'Jaguar',
  'Jeep',
  'Kia',
  'Land Rover',
  'Lexus',
  'Lincoln',
  'Mazda',
  'Mercedes-Benz',
  'Mini',
  'Mitsubishi',
  'Nissan',
  'Porsche',
  'Ram',
  'Subaru',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
] as const;

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
  'Petrol / Gasoline',
  'Diesel',
  'Hybrid',
  'Plug-in Hybrid (PHEV)',
  'Electric (EV)',
  'Flex Fuel / Ethanol',
  'CNG / LPG',
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
 * e.g. "Toyota Camry (2018 - 2023) • 2.5L 4-Cyl Petrol"
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
