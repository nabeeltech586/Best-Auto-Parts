import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact Us — Best Auto Parts',
  description: 'Contact Best Auto Parts, business location, WhatsApp hotline, and customer support hours.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 shadow-sm rounded-xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12">
        <header className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
          <Link href="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold mt-2 text-slate-900 dark:text-white">Contact Us</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Get in touch with Best Auto Parts for spare parts, orders & support</p>
        </header>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-4">
            <div>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Business Legal Entity</h2>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">Best Auto Parts</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Proprietor: Nabeel Khan</p>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Store & Workshop Address</h2>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 leading-relaxed">
                Main Automobile Market, GT Road,<br />
                Aligarh, Uttar Pradesh — 202001, India
              </p>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Business Hours (IST)</h2>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                <strong>Monday – Thursday, Saturday – Sunday:</strong> 9:00 AM – 8:00 PM<br />
                <strong>Friday:</strong> 9:00 AM – 12:30 PM &amp; 2:30 PM – 8:00 PM<br />
                <em>(Friday prayer break: 12:30 PM – 2:30 PM)</em>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">WhatsApp Direct Support</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Message us directly for instant stock inquiries, price quotes, fitment verification, or online payment support:
              </p>
              <a
                href="https://wa.me/919761224004"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition"
              >
                Chat on WhatsApp (+91 9761224004)
              </a>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Phone & Email</h2>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                <strong>Primary Contact:</strong> +91 9761224004<br />
                <strong>Alternate Contact:</strong> +91 9634224004<br />
                <strong>Email:</strong> support@bestautoparts.in
              </p>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">UPI Payee Details</h2>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 font-mono text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                Verified UPI ID: 9761224004-2@axl<br />
                Payee Name: Nabeel Khan (Best Auto Parts)
              </p>
            </div>
          </div>
        </div>

        <footer className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/terms" className="hover:underline">Terms & Conditions</Link>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:underline">Refund Policy</Link>
          <Link href="/shipping" className="hover:underline">Shipping Policy</Link>
        </footer>
      </div>
    </div>
  );
}
