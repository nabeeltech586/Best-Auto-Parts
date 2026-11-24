/**
 * Auto Parts Image Presets and Smart Category Visual Mapper
 * Best Auto Parts — Kailashpur, Saharanpur, UP
 */

export interface PartImagePreset {
  id: string;
  name: string;
  path: string;
  description: string;
  category: string;
}

export const DEFAULT_PART_IMAGE = '/parts/generic-part.svg';

export const PART_IMAGE_PRESETS: readonly PartImagePreset[] = [
  {
    id: 'battery',
    name: '12V Motorcycle Battery',
    path: '/parts/battery.svg',
    description: '12V VRLA / Maintenance-Free (Exide / Amaron / Pro Bike)',
    category: 'Electrical',
  },
  {
    id: 'fork-pipe',
    name: 'Front Fork Pipe & Shockers',
    path: '/parts/fork-pipe.svg',
    description: 'Front Fork Inner Pipes, Rear Shocker Sets & Hydraulic Dampers',
    category: 'Suspension',
  },
  {
    id: 'ignition-switch',
    name: 'Ignition Switch & Locks',
    path: '/parts/ignition-switch.svg',
    description: 'Ignition Key Switches, Fuel Cap Tank Locks & Lock Sets',
    category: 'Electrical',
  },
  {
    id: 'gasket-kit',
    name: 'Engine Gasket & Oil Seals',
    path: '/parts/gasket-kit.svg',
    description: 'Full Engine Paper Gaskets, Valve Stem Seals & Carburetor Kits',
    category: 'Maintenance',
  },
  {
    id: 'piston-kit',
    name: 'Piston Kit & Engine Valves',
    path: '/parts/piston-kit.svg',
    description: 'Cylinder Kits, Piston & Rings, Engine Valve Sets',
    category: 'Engine',
  },
  {
    id: 'engine-oil',
    name: '4T Engine Lubricants',
    path: '/parts/engine-oil.svg',
    description: '10W-30 / 20W-50 4T Plus Motorcycle & Scooter Engine Oils',
    category: 'Maintenance',
  },
  {
    id: 'clutch-plate',
    name: 'Clutch Plates & Variator',
    path: '/parts/clutch-plate.svg',
    description: 'Clutch Friction Plates, Centrifugal Clutch Shoes & Rollers',
    category: 'Transmission',
  },
  {
    id: 'chain-sprocket',
    name: 'Drive Chain & Sprockets',
    path: '/parts/chain-sprocket.svg',
    description: '428H Drive Chain Sprocket Kits, Cam Timing Chains & CVT Belts',
    category: 'Drivetrain',
  },
  {
    id: 'brake-pad',
    name: 'Brake Pads, Shoes & Levers',
    path: '/parts/brake-pad.svg',
    description: 'Disc Brake Pads, Drum Brake Shoes & Alloy Hand Levers',
    category: 'Braking',
  },
  {
    id: 'headlamp-bulb',
    name: 'Headlamp Bulbs & Lights',
    path: '/parts/headlamp-bulb.svg',
    description: 'Halogen HS1 / H4 12V 35W Headlight Bulbs & Electricals',
    category: 'Electrical',
  },
  {
    id: 'tyre',
    name: 'Motorcycle & Scooter Tyres',
    path: '/parts/tyre.svg',
    description: 'MRF / CEAT Tubeless & Tube Type Tyres',
    category: 'Wheels & Tyres',
  },
  {
    id: 'air-filter',
    name: 'Air Filters & Fuel Strainers',
    path: '/parts/air-filter.svg',
    description: 'Foam Elements, Viscous Filters & Fuel Pump Strainers',
    category: 'Filtration',
  },
  {
    id: 'horn',
    name: '12V Electric Horn',
    path: '/parts/horn.svg',
    description: '12V High Tone Resonator Horn Assemblies',
    category: 'Electrical',
  },
  {
    id: 'seat-cover',
    name: 'Seat Covers & Body Parts',
    path: '/parts/seat-cover.svg',
    description: 'Comfort Seat Covers, Visor Masks, Cowls, Mirrors & Shields',
    category: 'Body & Frame',
  },
  {
    id: 'bearing',
    name: 'Wheel & Steering Bearings',
    path: '/parts/bearing.svg',
    description: '6201-2RS Wheel Hub Ball Bearings & Steering Cone Sets',
    category: 'Wheels & Tyres',
  },
  {
    id: 'cable',
    name: 'Control Cables & Wires',
    path: '/parts/cable.svg',
    description: 'Clutch, Throttle Accelerator & Front/Rear Brake Cables',
    category: 'Controls',
  },
  {
    id: 'spark-plug',
    name: 'Spark Plugs & Ignition',
    path: '/parts/spark-plug.svg',
    description: 'NGK / Champion Spark Plugs (C6HSA, RG4HC, CPR7EA)',
    category: 'Ignition',
  },
  {
    id: 'generic-part',
    name: 'Genuine Auto Spare Part',
    path: '/parts/generic-part.svg',
    description: 'Original equipment motorcycle spare part',
    category: 'General',
  },
] as const;

interface PartLike {
  image_url?: string | null;
  image_urls?: string[] | null;
  part_name?: string | null;
  sku?: string | null;
  category?: string | null;
  subcategory?: string | null;
}

/**
 * Smart resolver to map any part record to its optimal, high-contrast product thumbnail.
 * Checks existing custom image first, then detects keywords across English and Hindi.
 */
export function getMatchingPartImage(part?: PartLike | null): string {
  if (!part) return DEFAULT_PART_IMAGE;

  // 1. Direct custom image URL check
  if (part.image_url && typeof part.image_url === 'string' && part.image_url.trim().length > 0) {
    return part.image_url.trim();
  }

  if (Array.isArray(part.image_urls) && part.image_urls.length > 0) {
    const first = part.image_urls[0];
    if (first && typeof first === 'string' && first.trim().length > 0) {
      return first.trim();
    }
  }

  // 2. Synthesize search text from part_name, sku, category, subcategory
  const text = [
    part.part_name || '',
    part.sku || '',
    part.category || '',
    part.subcategory || '',
  ]
    .join(' ')
    .toLowerCase();

  // 3. Keyword matching rules in prioritized sequence
  // Battery
  if (
    text.includes('battery') ||
    text.includes('बैटरी') ||
    text.includes('vrla') ||
    text.includes('exide') ||
    text.includes('amaron') ||
    /\b(3ah|4ah|5ah|7ah|9ah)\b/i.test(text)
  ) {
    return '/parts/battery.svg';
  }

  // Spark Plug (checked before Ignition Switch so category 'Ignition' doesn't hijack plugs)
  if (
    text.includes('spark plug') ||
    text.includes('स्पार्क प्लग') ||
    text.includes('champion') ||
    text.includes('ngk') ||
    text.includes('c6hsa') ||
    text.includes('rg4hc') ||
    text.includes('mr7c') ||
    text.includes('cpr7ea') ||
    (/\bplug\b/i.test(text) && !text.includes('drain'))
  ) {
    return '/parts/spark-plug.svg';
  }

  // Ignition Switch & Tank Locks
  if (
    text.includes('ignition switch') ||
    text.includes('इग्निशन') ||
    text.includes('key switch') ||
    text.includes('चाबी स्विच') ||
    text.includes('fuel cap lock') ||
    text.includes('टंकी लॉक') ||
    text.includes('lock set') ||
    (text.includes('ignition') && text.includes('switch')) ||
    (text.includes('ignition') && text.includes('key')) ||
    (text.includes('ignition') && text.includes('lock')) ||
    text.includes('चाबी')
  ) {
    return '/parts/ignition-switch.svg';
  }

  // Engine Oil & Lubricants
  if (
    text.includes('engine oil') ||
    text.includes('इंजन ऑयल') ||
    text.includes('10w-30') ||
    text.includes('20w-50') ||
    text.includes('10w-40') ||
    text.includes('4t plus') ||
    text.includes('4t scooter') ||
    text.includes('castrol') ||
    text.includes('motul') ||
    text.includes('dts-i 10,000') ||
    text.includes('lubricant')
  ) {
    return '/parts/engine-oil.svg';
  }

  // Front Fork Pipes & Shock Absorbers
  if (
    text.includes('fork') ||
    text.includes('inner pipe') ||
    text.includes('फोर्क') ||
    text.includes('shocker') ||
    text.includes('शॉकर') ||
    text.includes('damper') ||
    text.includes('डैम्पर') ||
    text.includes('shock absorber')
  ) {
    return '/parts/fork-pipe.svg';
  }

  // Piston Kit, Cylinder & Engine Valves
  if (
    text.includes('piston') ||
    text.includes('पिस्टन') ||
    text.includes('cylinder kit') ||
    text.includes('सिलेंडर') ||
    text.includes('valve set') ||
    text.includes('वाल्व सेट')
  ) {
    return '/parts/piston-kit.svg';
  }

  // Gasket Kits & Oil Seals
  if (
    text.includes('gasket') ||
    text.includes('गैसकेट') ||
    text.includes('oil seal') ||
    text.includes('ऑयल सील') ||
    text.includes('carburetor repair kit') ||
    text.includes('कार्बोरेटर')
  ) {
    return '/parts/gasket-kit.svg';
  }

  // Clutch Plates & CVT Variator
  if (
    text.includes('clutch plate') ||
    text.includes('क्लच प्लेट') ||
    text.includes('clutch shoe') ||
    text.includes('variator') ||
    text.includes('roller weight') ||
    text.includes('वेरीएटर')
  ) {
    return '/parts/clutch-plate.svg';
  }

  // Chain & Sprockets, CVT Belts & Cam Timing Chain
  if (
    text.includes('sprocket') ||
    text.includes('स्प्रोकेट') ||
    text.includes('cvt belt') ||
    text.includes('ड्राइव सीवीटी बेल्ट') ||
    text.includes('cam chain') ||
    text.includes('timing chain') ||
    text.includes('428h') ||
    text.includes('428-118l') ||
    text.includes('चेन') ||
    (text.includes('chain') && !text.includes('lock'))
  ) {
    return '/parts/chain-sprocket.svg';
  }

  // Control Cables & Wires
  if (
    text.includes('cable') ||
    text.includes('केबल') ||
    text.includes('inner wire') ||
    text.includes('outer wire') ||
    text.includes('throttle') ||
    text.includes('accelerator') ||
    text.includes('थ्रॉटल')
  ) {
    return '/parts/cable.svg';
  }

  // Brake Pads, Brake Shoes & Hand Levers
  if (
    text.includes('brake') ||
    text.includes('ब्रेक') ||
    text.includes('disc pad') ||
    text.includes('brake shoe') ||
    text.includes('brake pad') ||
    text.includes('lever') ||
    text.includes('लीवर')
  ) {
    return '/parts/brake-pad.svg';
  }

  // Air Filter Elements & Fuel Pump Strainer
  if (
    text.includes('air filter') ||
    text.includes('एयर फिल्टर') ||
    text.includes('foam element') ||
    text.includes('viscous') ||
    text.includes('strainer') ||
    text.includes('स्ट्रेनर') ||
    text.includes('filter') ||
    text.includes('फिल्टर')
  ) {
    return '/parts/air-filter.svg';
  }

  // Headlamp Bulbs & Electrical Lighting
  if (
    text.includes('bulb') ||
    text.includes('बल्ब') ||
    text.includes('headlight') ||
    text.includes('headlamp') ||
    text.includes('हेडलाइट') ||
    text.includes('halogen') ||
    text.includes('हैलोजन') ||
    text.includes('hs1') ||
    text.includes('35/35w')
  ) {
    return '/parts/headlamp-bulb.svg';
  }

  // Wheel Bearings & Steering Cone (checked before Tyres so wheel bearings match bearing)
  if (
    text.includes('bearing') ||
    text.includes('बेयरिंग') ||
    text.includes('6201') ||
    text.includes('cone set')
  ) {
    return '/parts/bearing.svg';
  }

  // Tyres & Wheels
  if (
    text.includes('tyre') ||
    text.includes('tire') ||
    text.includes('टायर') ||
    text.includes('mrf') ||
    text.includes('ceat') ||
    text.includes('tubeless') ||
    text.includes('zapper') ||
    text.includes('nylogrip') ||
    text.includes('2.75-18') ||
    text.includes('2.75-17') ||
    text.includes('90/100-10')
  ) {
    return '/parts/tyre.svg';
  }

  // Horns
  if (text.includes('horn') || text.includes('हॉर्न')) {
    return '/parts/horn.svg';
  }

  // Seat Covers, Visors, Cowls, Mirrors, Silencer Shields & Body Panels
  if (
    text.includes('seat cover') ||
    text.includes('सीट कवर') ||
    text.includes('visor') ||
    text.includes('वाइजर') ||
    text.includes('mask') ||
    text.includes('cowl') ||
    text.includes('nose cover') ||
    text.includes('panel') ||
    text.includes('पैनल') ||
    text.includes('mirror') ||
    text.includes('मिरर') ||
    text.includes('heat shield') ||
    text.includes('silencer shield') ||
    text.includes('shield') ||
    text.includes('शील्ड') ||
    text.includes('silencer')
  ) {
    return '/parts/seat-cover.svg';
  }

  // Final category fallback
  const cat = (part.category || '').toLowerCase();
  if (cat.includes('brak')) return '/parts/brake-pad.svg';
  if (cat.includes('elect')) return '/parts/headlamp-bulb.svg';
  if (cat.includes('suspen')) return '/parts/fork-pipe.svg';
  if (cat.includes('trans')) return '/parts/clutch-plate.svg';
  if (cat.includes('drive')) return '/parts/chain-sprocket.svg';
  if (cat.includes('filtr')) return '/parts/air-filter.svg';
  if (cat.includes('eng')) return '/parts/piston-kit.svg';
  if (cat.includes('wheel') || cat.includes('tyre')) return '/parts/tyre.svg';
  if (cat.includes('body')) return '/parts/seat-cover.svg';
  if (cat.includes('control')) return '/parts/cable.svg';
  if (cat.includes('ignit')) return '/parts/spark-plug.svg';

  return DEFAULT_PART_IMAGE;
}
