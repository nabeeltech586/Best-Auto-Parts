import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Best Auto Parts',
  description: 'Privacy Policy and data protection practices of Best Auto Parts.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 shadow-sm rounded-xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12">
        <header className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
          <Link href="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold mt-2 text-slate-900 dark:text-white">Privacy Policy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Last updated: November 2026 | Best Auto Parts</p>
        </header>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Introduction</h2>
            <p>
              Best Auto Parts respects your privacy and is committed to protecting your personal information. This Privacy Policy explains
              how we collect, use, and safeguard your details when you interact with us via our website, WhatsApp Business channel, or in store.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Information We Collect</h2>
            <p>We collect only information necessary to process your inquiries and fulfill orders:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Contact Information:</strong> Name, phone number, and delivery address.</li>
              <li><strong>Order Inquiries:</strong> Vehicle model, spare part requested, and fulfillment preference.</li>
              <li><strong>Transaction Data:</strong> Merchant transaction ID, payment status, and bank UTR reference provided by the payment gateway. We do NOT store card numbers, CVVs, or UPI PINs.</li>
              <li><strong>WhatsApp Communications:</strong> Inbound messages, language preferences (English/Hinglish), and customer service interactions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. WhatsApp Communication & Consent</h2>
            <p>
              When you message our business WhatsApp number (+91 9761224004 / +91 9634224004), you consent to receive automated and agent-assisted
              responses regarding parts availability, quotations, payment links, and order updates. You may opt out at any time by messaging &quot;STOP&quot;.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Payment Processing Security</h2>
            <p>
              Online payments are processed securely through Razorpay Payment Gateway (a regulated payment aggregator under the Reserve Bank of India).
              Transaction verification is performed through secure server-to-server APIs with SHA-256 HMAC cryptographic signatures.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Data Sharing & Disclosure</h2>
            <p>
              We do not sell, rent, or trade your personal information. Your contact details and address are shared only with:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Authorized logistics and courier partners strictly for delivery execution.</li>
              <li>Razorpay Payment Gateway for payment processing and dispute resolution.</li>
              <li>Legal or regulatory authorities if required under Indian law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Contact for Privacy Inquiries</h2>
            <p>
              If you have questions regarding this Privacy Policy or wish to request deletion of your contact data, contact us at:
              <br />
              <strong>Best Auto Parts</strong> — Attention: Saud Khan
              <br />
              Phone: +91 9761224004 | Email: support@bestautoparts.in
            </p>
          </section>
        </div>

        <footer className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/terms" className="hover:underline">Terms & Conditions</Link>
          <Link href="/refund-policy" className="hover:underline">Refund Policy</Link>
          <Link href="/shipping" className="hover:underline">Shipping Policy</Link>
          <Link href="/contact" className="hover:underline">Contact Us</Link>
        </footer>
      </div>
    </div>
  );
}
