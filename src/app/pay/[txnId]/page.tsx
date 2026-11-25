import { redirect, RedirectType } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, Phone, ArrowLeft, ShieldCheck, Clock, FileCheck2 } from 'lucide-react'
import { getPaymentLinkByTxnId } from '@/lib/payments/phonepe-link'

export const dynamic = 'force-dynamic'

interface PayPageProps {
  params: Promise<{ txnId: string }>
}

export default async function PayRedirectPage({ params }: PayPageProps) {
  const { txnId } = await params
  const record = await getPaymentLinkByTxnId(txnId)

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
            <p className="text-xs text-slate-600">Main Market, Auto Parts Hub</p>
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
    )
  }

  // 2. Partial State -> Redirect to Pay Checkout page with remaining balance
  if (record.status === 'PARTIAL') {
    const remaining = record.remaining_amount !== undefined ? record.remaining_amount : record.amount
    const checkoutUrl = `/pay?order=${encodeURIComponent(record.order_id)}&phone=${encodeURIComponent(
      record.customer_phone
    )}&name=${encodeURIComponent(record.customer_name || '')}&item=${encodeURIComponent(
      record.part_details
    )}&amount=${remaining}`
    redirect(checkoutUrl, RedirectType.replace)
  }

  // 3. Pending State -> Clean Redirect to PhonePe Gateway or BestPay Checkout
  if (record.status === 'PENDING') {
    if (record.phonepe_redirect_url) {
      redirect(record.phonepe_redirect_url, RedirectType.replace)
    } else {
      const checkoutUrl = `/pay?order=${encodeURIComponent(record.order_id)}&phone=${encodeURIComponent(
        record.customer_phone
      )}&name=${encodeURIComponent(record.customer_name || '')}&item=${encodeURIComponent(
        record.part_details
      )}&amount=${record.amount}`
      redirect(checkoutUrl, RedirectType.replace)
    }
  }

  // 4. Paid State -> Clean "Already Paid" Receipt Screen
  const paidDate = record.paid_at
    ? new Date(record.paid_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
    : 'Verified'

  const directPayUrl = `/pay?order=${encodeURIComponent(record.order_id)}&phone=${encodeURIComponent(
    record.customer_phone
  )}&amount=${record.amount}`

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30 mb-1">
            ✅ PAYMENT ALREADY COMPLETED
          </div>
          <h1 className="text-2xl font-bold">Payment Completed</h1>
          <p className="text-emerald-100 text-xs mt-1">Order payment verified & recorded in CRM</p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center pb-6 border-b border-slate-100">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Paid</span>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">₹{record.amount.toFixed(2)}</div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold mt-2 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              Paid via {record.payment_mode || 'UPI / BestPay'}
            </div>
          </div>

          <div className="py-4 space-y-3 text-sm">
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Order ID:</span>
              <span className="font-semibold text-slate-800">#{record.order_id}</span>
            </div>
            <div className="flex justify-between items-start py-1">
              <span className="text-slate-500">Item / Part:</span>
              <span className="font-medium text-slate-800 text-right max-w-[200px]">{record.part_details}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Customer Name:</span>
              <span className="font-medium text-slate-800">{record.customer_name || 'Valued Customer'}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Customer Phone:</span>
              <span className="font-medium text-slate-800">{record.customer_phone}</span>
            </div>
            {record.phonepe_transaction_id && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Reference ID:</span>
                <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{record.phonepe_transaction_id}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Paid At:</span>
              <span className="text-slate-700 text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {paidDate}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 mt-2 space-y-1">
            <p className="font-semibold text-slate-800">Best Auto Parts</p>
            <p>Main Market Road, Kailashpur, Saharanpur • Timing: 09:00 AM – 09:00 PM</p>
            <p className="text-emerald-700 font-medium">Hamari team aapka spare part dispatch / counter pickup ke liye arrange kar rahi hai.</p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              href={directPayUrl}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-sm text-sm"
            >
              <FileCheck2 className="w-4 h-4" />
              📄 View / Download Digital Receipt
            </Link>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/919634722174?text=${encodeURIComponent(
                  `Hello Saud Bhai, mera Order #${record.order_id} (₹${record.amount}) paid ho gaya hai. Please dispatch update karein.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp Support
              </a>
              <a
                href="/payments"
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer select-none"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                ← Back to CRM
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
