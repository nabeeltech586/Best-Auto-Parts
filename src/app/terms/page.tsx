import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms & Conditions — Best Auto Parts',
  description: 'Terms and conditions for purchasing genuine motorcycle and automotive spare parts from Best Auto Parts.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 shadow-sm rounded-xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12">
        <header className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
          <Link href="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold mt-2 text-slate-900 dark:text-white">Terms & Conditions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Last updated: November 2026 | Best Auto Parts</p>
        </header>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Overview & Acceptance</h2>
            <p>
              Welcome to Best Auto Parts (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), operated by Nabeel Khan. By accessing our services,
              requesting product quotations, placing orders via our website or verified WhatsApp CRM channel (+91 9761224004 / +91 9634224004),
              you agree to be bound by these Terms and Conditions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Genuine Products & Vehicle Fitment</h2>
            <p>
              We specialize in genuine OEM and verified aftermarket two-wheeler spare parts for Bajaj, Hero, and Honda motorcycles and scooters.
              While we provide compatibility guidance, customers are advised to verify vehicle model, manufacture year,
              and engine variant before finalizing an order.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. Pricing and Payments</h2>
            <p>
              All prices are quoted in Indian Rupees (₹ / INR) inclusive of applicable taxes. Online payments are processed securely through
              Razorpay Payment Gateway via UPI, cards, and netbanking. We never ask for your UPI PIN, banking passwords, or OTPs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Order Confirmation & Fulfillment</h2>
            <p>
              An order is deemed confirmed once verified by our payment gateway or accepted for store pickup. Orders can be fulfilled via:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Store Pickup:</strong> Free self-pickup from our retail outlet during business hours.</li>
              <li><strong>Delivery:</strong> Express courier / local dispatch across Saharanpur and nearby local areas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Cancellations</h2>
            <p>
              You may request order cancellation prior to dispatch by contacting us on WhatsApp. Once an order is dispatched with a courier tracking ID,
              it follows our standard <Link href="/refund-policy" className="text-blue-600 dark:text-blue-400 hover:underline">Refund & Cancellation Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Limitation of Liability</h2>
            <p>
              Best Auto Parts is not liable for indirect, incidental, or consequential damages resulting from improper installation or misuse of spare parts.
              Professional installation by a certified mechanic is strongly recommended.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">7. Governing Law</h2>
            <p>
              These terms are governed by the laws of India. Any disputes arising in connection with these terms shall be subject to the exclusive
              jurisdiction of the courts of Uttar Pradesh, India.
            </p>
          </section>
        </div>

        <footer className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:underline">Refund Policy</Link>
          <Link href="/shipping" className="hover:underline">Shipping Policy</Link>
          <Link href="/contact" className="hover:underline">Contact Us</Link>
        </footer>
      </div>
    </div>
  );
}
