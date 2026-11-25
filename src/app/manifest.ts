import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Best Auto Parts CRM',
    short_name: 'Best Auto Parts',
    description:
      'WhatsApp Business CRM, Live Inventory & Udhaar Ledger for Best Auto Parts, Kailashpur, Saharanpur',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B1120',
    theme_color: '#0F172A',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'WhatsApp Inbox',
        short_name: 'Inbox',
        url: '/inbox',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Parts Inventory',
        short_name: 'Inventory',
        url: '/inventory',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Customers & Scratch',
        short_name: 'Contacts',
        url: '/contacts',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Udhaar & Payments',
        short_name: 'Payments',
        url: '/payments',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
    ],
  };
}
