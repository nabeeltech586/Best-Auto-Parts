import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Shipping & Delivery Policy — Best Auto Parts',
  description: 'Shipping, fulfillment timelines and store pickup information for Best Auto Parts.',
};

export default function ShippingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 shadow-sm rounded-xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12">
        <header className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
          <Link href="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold mt-2 text-slate-900 dark:text-white">Shipping & Delivery Policy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Last updated: November 2026 | Best Auto Parts</p>
        </header>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Fulfillment Options</h2>
            <p>Best Auto Parts offers flexible fulfillment options for two-wheeler and four-wheeler vehicle spare parts:</p>
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">🏪 Store Pickup</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Pick up your reserved parts directly from our main retail shop. Orders are ready within 30 minutes of payment or confirmation.
                  Free of charge.
                </p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">🚚 Doorstep Delivery</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Delivery across Saharanpur and nearby local areas via reliable courier partners. Dispatch is initiated within 24 hours.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Processing & Dispatch Timelines</h2>
            <p>
              Orders confirmed before 3:00 PM IST on business days are processed and dispatched on the same day. Orders placed after 3:00 PM IST
              or on holidays/Sundays are dispatched on the next business day.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. Estimated Delivery Times</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Local Service Area (Saharanpur & Kailashpur):</strong> Same-day local delivery or immediate store counter pickup.</li>
              <li><strong>Nearby Local Areas (Western Uttar Pradesh):</strong> 1 to 2 business days.</li>
              <li><strong>Regional Transport Hubs:</strong> 2 to 3 business days.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Shipping Charges</h2>
            <p>
              Shipping costs are calculated based on package weight, dimensions, and delivery PIN code. Exact courier charges are clearly communicated
              to you via WhatsApp before you proceed with online payment. There are zero hidden fees.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Tracking Your Delivery</h2>
            <p>
              Once your order has shipped, you will receive an automated WhatsApp notification containing the courier service name, consignment/tracking
              number, and estimated arrival window.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Damaged Shipments</h2>
            <p>
              If your parcel arrives with visible exterior damage, please inspect the contents before accepting, or take photos/videos upon unboxing.
              Report any shipping damage within 48 hours to our WhatsApp support (+91 9761224004) for an immediate replacement.
            </p>
          </section>
        </div>

        <footer className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/terms" className="hover:underline">Terms & Conditions</Link>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:underline">Refund Policy</Link>
          <Link href="/contact" className="hover:underline">Contact Us</Link>
        </footer>
      </div>
    </div>
  );
}
