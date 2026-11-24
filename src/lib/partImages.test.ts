import { describe, expect, it } from 'vitest';
import { getMatchingPartImage, DEFAULT_PART_IMAGE, PART_IMAGE_PRESETS } from './partImages';

describe('partImages resolver', () => {
  it('returns custom image_url if provided', () => {
    expect(
      getMatchingPartImage({
        image_url: 'https://cdn.example.com/custom-part.jpg',
        part_name: 'Brake Pad',
      }),
    ).toBe('https://cdn.example.com/custom-part.jpg');
  });

  it('returns custom image_urls[0] if provided', () => {
    expect(
      getMatchingPartImage({
        image_urls: ['https://cdn.example.com/custom-battery.png'],
        part_name: '12V Battery',
      }),
    ).toBe('https://cdn.example.com/custom-battery.png');
  });

  it('matches all motorcycle spare part categories accurately across English and Hindi', () => {
    // Battery
    expect(getMatchingPartImage({ part_name: 'Exide Xpress 12V 4Ah Sealed Battery / एक्साइड 12V बैटरी' })).toBe(
      '/parts/battery.svg',
    );
    expect(getMatchingPartImage({ part_name: 'Amaron 12V 5Ah VRLA Pro Bike Battery' })).toBe('/parts/battery.svg');

    // Fork Pipe / Shocker
    expect(
      getMatchingPartImage({ part_name: 'Front Fork Inner Pipe Assembly / फ्रंट फोर्क इनर पाइप असेंबली' }),
    ).toBe('/parts/fork-pipe.svg');
    expect(getMatchingPartImage({ part_name: 'Platina ComforTec Rear Shocker Set' })).toBe('/parts/fork-pipe.svg');

    // Ignition Switch & Locks
    expect(
      getMatchingPartImage({ part_name: 'Ignition Switch Key Set with Fuel Cap Lock / इग्निशन स्विच की व टंकी लॉक सेट' }),
    ).toBe('/parts/ignition-switch.svg');
    expect(getMatchingPartImage({ part_name: 'Activa Ignition Key Switch Set' })).toBe('/parts/ignition-switch.svg');

    // Gasket Kit & Oil Seals
    expect(
      getMatchingPartImage({ part_name: 'Full Engine Overhaul Paper Gasket Kit / फुल इंजन ओवरहाल गैसकेट किट' }),
    ).toBe('/parts/gasket-kit.svg');
    expect(getMatchingPartImage({ part_name: 'Valve Stem Oil Seal Set (2 Pcs)' })).toBe('/parts/gasket-kit.svg');
    expect(getMatchingPartImage({ part_name: 'Bajaj Platina Carburetor Repair Kit' })).toBe('/parts/gasket-kit.svg');

    // Piston Kit
    expect(
      getMatchingPartImage({ part_name: 'Cylinder Kit & Piston Assly / सिलेंडर किट और पिस्टन असेंबली' }),
    ).toBe('/parts/piston-kit.svg');
    expect(getMatchingPartImage({ part_name: 'Bajaj Platina Engine Valve Set (In/Ex)' })).toBe('/parts/piston-kit.svg');

    // Engine Oil
    expect(
      getMatchingPartImage({ part_name: 'Hero 4T Plus 10W-30 Engine Oil (900ml) / हीरो 4T प्लस इंजन ऑयल' }),
    ).toBe('/parts/engine-oil.svg');
    expect(getMatchingPartImage({ part_name: 'Bajaj DTS-i 10,000 20W-50 Engine Oil (1L)' })).toBe(
      '/parts/engine-oil.svg',
    );

    // Clutch Plate
    expect(
      getMatchingPartImage({ part_name: 'Clutch Plate Friction Set (4 Pcs) / क्लच प्लेट फ्रिक्शन सेट' }),
    ).toBe('/parts/clutch-plate.svg');
    expect(getMatchingPartImage({ part_name: 'Centrifugal Clutch Shoe Assembly (3 Pcs)' })).toBe(
      '/parts/clutch-plate.svg',
    );
    expect(getMatchingPartImage({ part_name: 'Variator Roller Weight Set (6 Pcs)' })).toBe(
      '/parts/clutch-plate.svg',
    );

    // Chain & Sprocket
    expect(
      getMatchingPartImage({ part_name: 'Chain & Sprocket Drive Kit (428H) / चेन और स्प्रोकेट ड्राइव किट' }),
    ).toBe('/parts/chain-sprocket.svg');
    expect(getMatchingPartImage({ part_name: 'Timing Cam Chain Kit (84 Links)' })).toBe('/parts/chain-sprocket.svg');
    expect(getMatchingPartImage({ part_name: 'Activa 3G/4G/5G Drive CVT Belt' })).toBe('/parts/chain-sprocket.svg');

    // Brake Pad & Shoes & Levers
    expect(getMatchingPartImage({ part_name: 'Front & Rear Brake Shoe Set / फ्रंट और रियर ब्रेक शू सेट' })).toBe(
      '/parts/brake-pad.svg',
    );
    expect(getMatchingPartImage({ part_name: 'Front Disc Brake Pad Set (Glamour/Xtreme)' })).toBe(
      '/parts/brake-pad.svg',
    );
    expect(getMatchingPartImage({ part_name: 'Front Brake & Clutch Lever Pair (Alloy)' })).toBe(
      '/parts/brake-pad.svg',
    );

    // Headlamp Bulb
    expect(
      getMatchingPartImage({ part_name: 'Halogen Headlight Bulb 12V 35/35W / हैलोजन हेडलाइट बल्ब' }),
    ).toBe('/parts/headlamp-bulb.svg');

    // Tyre
    expect(
      getMatchingPartImage({ part_name: 'MRF Nylogrip Plus 2.75-18 Tube Type Tyre / एमआरएफ टायर' }),
    ).toBe('/parts/tyre.svg');
    expect(getMatchingPartImage({ part_name: 'CEAT Secura Zoom 2.75-17 Rear Tyre' })).toBe('/parts/tyre.svg');

    // Air Filter
    expect(getMatchingPartImage({ part_name: 'Air Filter Foam Element / एयर फिल्टर फोम एलिमेंट' })).toBe(
      '/parts/air-filter.svg',
    );
    expect(getMatchingPartImage({ part_name: 'PGM-FI Fuel Pump Filter Strainer' })).toBe('/parts/air-filter.svg');

    // Horn
    expect(getMatchingPartImage({ part_name: '12V High Tone Horn Assembly / 12V हॉर्न असेंबली' })).toBe(
      '/parts/horn.svg',
    );

    // Seat Cover & Visor
    expect(getMatchingPartImage({ part_name: 'Deluxe Comfort Seat Cover Assembly / डीलक्स सीट कवर' })).toBe(
      '/parts/seat-cover.svg',
    );
    expect(getMatchingPartImage({ part_name: 'Front Visor Mask Cowl (Black)' })).toBe('/parts/seat-cover.svg');
    expect(getMatchingPartImage({ part_name: 'Rearview Mirror Pair (L+R Black)' })).toBe('/parts/seat-cover.svg');

    // Bearings
    expect(
      getMatchingPartImage({ part_name: 'Wheel Hub Ball Bearing 6201-2RS / व्हील हब बेयरिंग 6201' }),
    ).toBe('/parts/bearing.svg');
    expect(getMatchingPartImage({ part_name: 'Steering Handle Cone Bearing Set' })).toBe('/parts/bearing.svg');

    // Cables
    expect(
      getMatchingPartImage({ part_name: 'Clutch Cable Inner & Outer Wire / क्लच केबल इनर और आउटर वायर' }),
    ).toBe('/parts/cable.svg');
    expect(getMatchingPartImage({ part_name: 'Throttle Accelerator Cable Assembly' })).toBe('/parts/cable.svg');

    // Spark Plug
    expect(
      getMatchingPartImage({ part_name: 'Spark Plug Champion / NGK C6HSA / स्पार्क प्लग चैंपियन' }),
    ).toBe('/parts/spark-plug.svg');
  });

  it('falls back to DEFAULT_PART_IMAGE for unknown or null parts', () => {
    expect(getMatchingPartImage(null)).toBe(DEFAULT_PART_IMAGE);
    expect(getMatchingPartImage({})).toBe(DEFAULT_PART_IMAGE);
    expect(getMatchingPartImage({ part_name: 'Unknown Miscellaneous Mystery Item' })).toBe(DEFAULT_PART_IMAGE);
  });

  it('exports valid PART_IMAGE_PRESETS array', () => {
    expect(PART_IMAGE_PRESETS.length).toBeGreaterThan(15);
    PART_IMAGE_PRESETS.forEach((preset) => {
      expect(preset.path).toMatch(/^\/parts\/.+\.svg$/);
    });
  });
});
