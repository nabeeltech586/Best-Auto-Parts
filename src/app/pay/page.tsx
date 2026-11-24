'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Wrench,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  QrCode,
  Store,
  Phone,
  CheckCircle2,
  MapPin,
  Sparkles,
  ArrowRight,
  Smartphone,
  Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';

function PayCheckoutContent() {
  const searchParams = useSearchParams();

  // Parse Query Parameters
  const orderId = searchParams.get('order')?.trim() || 'BAP-ORDER';
  const customerName = searchParams.get('name')?.trim() || 'Valued Customer';
  const customerPhone = searchParams.get('phone')?.trim() || '+91 96347 22174';
  const itemDescription = searchParams.get('item')?.trim() || 'Motorcycle Genuine Spare Parts';
  const amountParam = searchParams.get('amount')?.trim() || '340';
  const rawAmount = Math.max(1, Number(amountParam) || 340);

  // States
  const [paymentMode, setPaymentMode] = useState<'upi' | 'cash'>('upi');
  const [showQr, setShowQr] = useState(true);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);

  // 5-Minute Live Session Countdown Timer (300 seconds)
  const [secondsLeft, setSecondsLeft] = useState(300);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  const timerText = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  // UPI Configuration
  const upiId = '9761224004-2@ybl';
  const upiAmount = Number.isInteger(rawAmount) ? String(rawAmount) : rawAmount.toFixed(2);
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    'Best Auto Parts'
  )}&am=${upiAmount}&cu=INR&tn=${encodeURIComponent(orderId)}`;

  // Handle Instant 1-Click Pay
  const handleProceedToPay = () => {
    if (typeof window !== 'undefined') {
      window.location.href = upiUri;
    }
  };

  // Handle Copy UPI ID
  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      toast.success('UPI ID (9761224004-2@ybl) copied to clipboard!');
      setTimeout(() => setCopiedUpi(false), 2500);
    } catch {
      toast.error('Failed to copy UPI ID');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100/90 py-8 px-4 sm:px-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
        {/* 1. Sleek Gradient Header */}
        <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 text-white p-6 relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-inner">
                <Wrench className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xl font-bold tracking-tight text-white">Best Auto Parts</h1>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                    VERIFIED
                  </span>
                </div>
                <p className="text-xs text-cyan-100 font-medium mt-0.5">
                  Genuine Spares • Hero • Bajaj • Honda
                </p>
                <div className="flex items-center gap-1 text-[11px] text-cyan-100/90 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>Kailashpur, Saharanpur, Uttar Pradesh</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Session Countdown Bar */}
          <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-cyan-50 font-medium">
              <Clock className="h-3.5 w-3.5 animate-pulse text-amber-300" />
              <span>Session expires in</span>
            </div>
            <div className="font-mono font-bold px-2 py-0.5 rounded-md bg-black/25 text-amber-200 text-xs border border-white/10">
              {timerText}
            </div>
          </div>
        </div>

        {/* 2. Order / Ledger Summary Section */}
        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Order & Customer Summary
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                <span className="text-[11px] text-slate-500 block">Customer / Partner</span>
                <span className="text-sm font-bold text-slate-900 truncate block mt-0.5">
                  {customerName}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                <span className="text-[11px] text-slate-500 block">Order / Ref ID</span>
                <span className="text-xs font-mono font-bold text-slate-800 truncate block mt-1">
                  #{orderId}
                </span>
              </div>
            </div>

            <div className="mt-2.5 rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-500">Item / Ledger Description</span>
                <span className="text-xs font-medium text-slate-800 mt-0.5 line-clamp-1">
                  {itemDescription}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 shrink-0">
                {customerPhone}
              </span>
            </div>
          </div>

          {/* 3. Highlighted Total Amount Box */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-md relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-300">Total Payable Amount</span>
                <div className="text-3xl font-extrabold tracking-tight mt-0.5 text-white font-mono">
                  {formatCurrency(rawAmount)}
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 border border-emerald-400/30">
                  <Sparkles className="h-3 w-3" />
                  All Taxes Included
                </span>
                <span className="block text-[10px] text-slate-400 mt-1">Direct Merchant Billing</span>
              </div>
            </div>
          </div>

          {/* 4. Payment Mode Toggle Tabs */}
          <div>
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setPaymentMode('upi')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  paymentMode === 'upi'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="h-4 w-4 text-blue-600" />
                <span>UPI App / QR</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('cash')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  paymentMode === 'cash'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="h-4 w-4 text-emerald-600" />
                <span>Pay at Shop (Cash)</span>
              </button>
            </div>
          </div>

          {/* TAB 1: UPI App / QR */}
          {paymentMode === 'upi' && (
            <div className="space-y-4">
              {/* Primary Instant 1-Click Pay Button */}
              <Button
                type="button"
                onClick={handleProceedToPay}
                className="w-full h-12 text-sm font-bold bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-lg shadow-teal-600/20 rounded-xl gap-2 transition-all transform active:scale-[0.99]"
              >
                <span>Proceed to Pay {formatCurrency(rawAmount)}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-center text-[11px] text-slate-500 font-medium">
                Opens PhonePe, Google Pay, or Paytm directly on your phone
              </p>

              {/* Scannable Dynamic QR Code Card */}
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-teal-600" />
                    <span className="text-xs font-bold text-slate-800">Scan & Pay via any UPI App</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQr(!showQr)}
                    className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 underline"
                  >
                    {showQr ? 'Hide QR' : 'Show QR'}
                  </button>
                </div>

                {showQr && (
                  <div className="flex flex-col items-center justify-center py-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <img
                      src={`/api/payments/qr?text=${encodeURIComponent(upiUri)}`}
                      alt="UPI QR Code"
                      width={180}
                      height={180}
                      className="rounded-lg shadow-inner"
                    />
                    <p className="text-[10px] text-slate-400 font-mono mt-2 text-center">
                      Scan with PhonePe, Google Pay, Paytm, BHIM, or Banking Apps
                    </p>
                  </div>
                )}

                {/* Copyable UPI ID Box */}
                <div className="flex items-center justify-between rounded-xl bg-white border border-slate-200 p-2.5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Merchant UPI ID
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">{upiId}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyUpi}
                    className="h-7 text-xs gap-1 border-slate-200"
                  >
                    {copiedUpi ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-600 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 text-slate-500" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* "I Have Paid" Confirmation Action */}
                {!paidConfirmed ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPaidConfirmed(true);
                      toast.success('Thank you! Payment confirmation reported.');
                    }}
                    className="w-full h-9 text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    I Have Paid ₹{rawAmount}
                  </Button>
                ) : (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center space-y-2">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Payment Reported! Order #{orderId}</span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      Please share your payment screenshot or UTR with Saud Bhai on WhatsApp to speed up invoice generation.
                    </p>
                    <a
                      href={`https://wa.me/919634722174?text=${encodeURIComponent(
                        `Hello Saud Bhai, maine Order #${orderId} ke liye ₹${rawAmount} ka payment kar diya hai.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 py-1.5 px-3 rounded-lg shadow-sm w-full"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Notify Saud Bhai on WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Pay at Shop (Cash) */}
          {paymentMode === 'cash' && (
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 space-y-3 text-xs text-slate-700">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Store className="h-4 w-4 text-emerald-600" />
                <span>Pay Cash at Best Auto Parts Counter</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                You can pay cash directly when collecting your spare parts at our workshop counter in Kailashpur, Saharanpur.
              </p>
              <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1 text-slate-600">
                <p className="font-semibold text-slate-800">Best Auto Parts — Workshop & Hub</p>
                <p>Main Market Road, Kailashpur, Saharanpur, UP 247001</p>
                <p className="text-slate-500 font-mono mt-1">Open Daily: 9:00 AM – 9:00 PM</p>
              </div>
              <a
                href={`https://wa.me/919634722174?text=${encodeURIComponent(
                  `Hello Saud Bhai, main Order #${orderId} (₹${rawAmount}) ka cash payment dukan par aakar karunga.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
              >
                <Phone className="h-4 w-4" />
                <span>Confirm Cash Pickup with Saud Bhai</span>
              </a>
            </div>
          )}

          {/* 5. High-Trust Footer Badges */}
          <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>GST & Udyam Verified Hub</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500 font-medium">
              <span>🔒 256-Bit Secured Checkout</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PayCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Clock className="h-4 w-4 animate-spin text-teal-600" />
            <span>Loading Best Auto Parts Checkout...</span>
          </div>
        </div>
      }
    >
      <PayCheckoutContent />
    </Suspense>
  );
}
