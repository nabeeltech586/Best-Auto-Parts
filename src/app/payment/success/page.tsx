import { Suspense } from 'react';
import CustomerPaymentReceipt from '@/components/payments/CustomerPaymentReceipt';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PaymentSuccessProps {
  searchParams: Promise<{
    order_id?: string;
    orderId?: string;
    payment_id?: string;
    razorpay_payment_id?: string;
    amount?: string;
  }>;
}

async function SuccessContent({ searchParams }: PaymentSuccessProps) {
  const params = await searchParams;
  const rawOrderId = params.order_id || params.orderId || 'BAP-ORDER';
  const paymentId = params.payment_id || params.razorpay_payment_id || '';
  const amountParam = Number(params.amount) || 0;

  let customerName = 'Valued Customer';
  let customerPhone: string | undefined;
  let itemDescription = 'Motorcycle Genuine Spare Parts';
  let amount = amountParam;
  let paidAt: string | null = new Date().toISOString();
  let paymentMode = 'Razorpay / UPI';

  if (rawOrderId) {
    try {
      const db = supabaseAdmin();
      // Try fetching from payment_links or razorpay_payments
      const { data: link } = await db
        .from('payment_links')
        .select('*')
        .or(`order_id.eq.${rawOrderId},merchant_transaction_id.eq.${rawOrderId}`)
        .limit(1)
        .maybeSingle();

      if (link) {
        customerName = link.customer_name || customerName;
        customerPhone = link.customer_phone || customerPhone;
        itemDescription = link.part_details || itemDescription;
        amount = Number(link.amount) || amount;
        paidAt = link.paid_at || paidAt;
        paymentMode = link.payment_mode || paymentMode;
      } else {
        const { data: rzp } = await db
          .from('razorpay_payments')
          .select('*')
          .or(`order_id.eq.${rawOrderId},razorpay_payment_id.eq.${paymentId}`)
          .limit(1)
          .maybeSingle();

        if (rzp) {
          customerName = rzp.customer_name || customerName;
          customerPhone = rzp.customer_phone || customerPhone;
          itemDescription = rzp.description || itemDescription;
          amount = Number(rzp.amount) || amount;
          paidAt = rzp.paid_at || paidAt;
          paymentMode = rzp.payment_method || paymentMode;
        }
      }
    } catch {
      // Non-blocking lookup
    }
  }

  return (
    <CustomerPaymentReceipt
      orderId={rawOrderId}
      amount={amount}
      customerName={customerName}
      customerPhone={customerPhone}
      itemDescription={itemDescription}
      paymentMode={paymentMode}
      paymentId={paymentId || undefined}
      paidAt={paidAt}
      status="PAID"
      autoRedirectSeconds={4}
      whatsappUrl={`https://wa.me/919634722174?text=${encodeURIComponent(
        `Hello Best Auto Parts, mera Order #${rawOrderId} (₹${amount.toFixed(2)}) confirm ho gaya hai.`
      )}`}
    />
  );
}

export default async function PaymentSuccessPage(props: PaymentSuccessProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-sm text-slate-600 font-medium">Loading Best Auto Parts Receipt...</p>
          </div>
        </main>
      }
    >
      <SuccessContent {...props} />
    </Suspense>
  );
}
