import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — Best Auto Parts',
  description: '7-day replacement, returns and refund policy for Best Auto Parts.',
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 shadow-sm rounded-xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12">
        <header className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
          <Link href="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold mt-2 text-slate-900 dark:text-white">Refund & Cancellation Policy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Last updated: November 2026 | Best Auto Parts</p>
        </header>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. 7-Day Replacement & Return Guarantee</h2>
            <p>
              At Best Auto Parts, we take pride in delivering genuine, high-quality spare parts. If you receive a part that is physically damaged in transit,
              has a manufacturing defect, or does not match the specifications confirmed during purchase, you are eligible for a replacement or return
              within <strong>7 days</strong> of delivery or store pickup.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Conditions for Return / Replacement</h2>
            <p>To be eligible for a return or replacement:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>The part must be unused and uninstalled (parts showing grease marks, scratches, or bolt installation signs cannot be returned).</li>
              <li>The original brand packaging, MRP stickers, and bar-codes must be intact.</li>
              <li>Proof of purchase (order reference number or payment confirmation) must be provided.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. How to Initiate a Return</h2>
            <p>
              To request a return or replacement:
            </p>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Send a message to our official WhatsApp support number at <strong>+91 9761224004</strong>.</li>
              <li>Share your Order ID and clear photos or a short video showing the unopened part and the issue.</li>
              <li>Our technical team will review the issue within 24 business hours and guide you on pickup or return drop-off.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Refund Method and Timelines</h2>
            <p>
              Once the returned part is received and inspected at our workshop:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Verification:</strong> Inspection is completed within 2 business days of receipt.</li>
              <li><strong>Refund Processing:</strong> Refunds are processed back to the original payment source via Razorpay Payment Gateway.</li>
              <li><strong>Bank Settlement Timeline:</strong> Funds typically credit to your UPI-linked bank account within <strong>5 to 7 business days</strong> depending on your issuing bank.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Order Cancellations</h2>
            <p>
              Orders can be canceled free of charge before dispatch. If you cancel an order that was paid online, the full refund is initiated immediately
              and settles according to standard banking timelines (5–7 business days).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Non-Returnable Items</h2>
            <p>
              The following categories cannot be returned unless received in defective condition:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Electrical items (bulbs, CDI units, wiring harnesses) once installed.</li>
              <li>Opened consumable fluids (engine oils, brake fluids, lubricants).</li>
            </ul>
          </section>
        </div>

        <footer className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/terms" className="hover:underline">Terms & Conditions</Link>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/shipping" className="hover:underline">Shipping Policy</Link>
          <Link href="/contact" className="hover:underline">Contact Us</Link>
        </footer>
      </div>
    </div>
  );
}
