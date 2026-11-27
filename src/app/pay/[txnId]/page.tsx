import { redirect, RedirectType } from 'next/navigation';
import { AlertCircle, Phone } from 'lucide-react';
import { getPaymentLinkByTxnId } from '@/lib/payments/razorpay';
import CustomerPaymentReceipt from '@/components/payments/CustomerPaymentReceipt';

export const dynamic = 'force-dynamic';

interface PayPageProps {
  params: Promise<{ txnId: string }>;
}

export default async function PayRedirectPage({ params }: PayPageProps) {
  const { txnId } = await params;
  const record = await getPaymentLinkByTxnId(txnId);

  // 1. Not Found / Expired Case
  if (!record) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Payment Link Expired or Not Found</h1>
          <p className="text-sm text-slate-600 mb-6">
            Yeh payment link expire ho chuka hai ya verify nahi ho paya. Kripya naya payment link pane ke liye store team se contact karein.
          </p>

          <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-200 mb-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Best Auto Parts</h2>
            <p className="text-sm text-slate-800 font-medium">Saud Bhai / Store Team</p>
            <p className="text-xs text-slate-600">Kailashpur, Saharanpur, UP 247001</p>
            <p className="text-xs text-slate-600 mt-1">📞 +91 96347 22174</p>
          </div>

          <a
            href="https://wa.me/919634722174?text=Hello%20Best%20Auto%20Parts,%20mera%20payment%20link%20verify%20karna%20hai."
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition shadow-sm"
          >
            <Phone className="w-4 h-4" />
            Contact on WhatsApp
          </a>
        </div>
      </main>
    );
  }

  // 2. Partial State -> Redirect to Pay Checkout page with remaining balance
  if (record.status === 'PARTIAL') {
    const remaining = record.remaining_amount !== undefined ? record.remaining_amount : record.amount;
    const checkoutUrl = `/pay?order=${encodeURIComponent(record.order_id)}&phone=${encodeURIComponent(
      record.customer_phone
    )}&name=${encodeURIComponent(record.customer_name || '')}&item=${encodeURIComponent(
      record.part_details
    )}&amount=${remaining}`;
    redirect(checkoutUrl, RedirectType.replace);
  }

  // 3. Pending State -> Redirect to Razorpay Payment Link or BestPay Checkout
  if (record.status === 'PENDING') {
    const liveUrl = record.razorpay_payment_link_url || record.phonepe_redirect_url;
    if (liveUrl) {
      redirect(liveUrl, RedirectType.replace);
    } else {
      const checkoutUrl = `/pay?order=${encodeURIComponent(record.order_id)}&phone=${encodeURIComponent(
        record.customer_phone
      )}&name=${encodeURIComponent(record.customer_name || '')}&item=${encodeURIComponent(
        record.part_details
      )}&amount=${record.amount}`;
      redirect(checkoutUrl, RedirectType.replace);
    }
  }

  // 4. Paid State -> Clean Customer Receipt Page with 4-second auto-redirect to WhatsApp
  return (
    <CustomerPaymentReceipt
      orderId={record.order_id}
      amount={record.amount}
      customerName={record.customer_name || 'Valued Customer'}
      customerPhone={record.customer_phone}
      itemDescription={record.part_details}
      paymentMode={record.payment_mode || 'Razorpay / UPI'}
      paymentId={record.razorpay_payment_id || record.phonepe_transaction_id || undefined}
      paidAt={record.paid_at}
      status="PAID"
      autoRedirectSeconds={4}
      whatsappUrl={`https://wa.me/919634722174?text=${encodeURIComponent(
        `Hello Best Auto Parts, mera Order #${record.order_id} (₹${record.amount}) confirm ho gaya hai.`
      )}`}
    />
  );
}
