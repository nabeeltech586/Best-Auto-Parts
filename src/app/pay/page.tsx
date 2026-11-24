'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  Loader2,
  Receipt,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency';

function PayCheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse Query Parameters
  const orderId = searchParams.get('order')?.trim() || 'BAP-ORDER';
  const customerName = searchParams.get('name')?.trim() || 'Valued Customer';
  const customerPhone = searchParams.get('phone')?.trim() || '+91 96347 22174';
  const itemDescription = searchParams.get('item')?.trim() || 'Motorcycle Genuine Spare Parts';
  const amountParam = searchParams.get('amount')?.trim() || '340';
  const rawAmount = Math.max(1, Number(amountParam) || 340);

  // Flow & State
  const [paymentStage, setPaymentStage] = useState<'initial' | 'confirming' | 'completed'>('initial');
  const [hasProceeded, setHasProceeded] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'upi' | 'cash'>('upi');
  const [showQr, setShowQr] = useState(true);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [confirmingLoading, setConfirmingLoading] = useState(false);
  const [completedData, setCompletedData] = useState<{
    order_id: string;
    utr: string;
    amount: number;
    payment_mode: string;
    paid_at: string;
  } | null>(null);

  // 5-Minute Live Session Countdown Timer (300 seconds)
  const [secondsLeft, setSecondsLeft] = useState(300);

  // Auto-redirect countdown (2.5s) back to CRM after payment confirmation
  const [redirectCountdown, setRedirectCountdown] = useState(2);

  useEffect(() => {
    if (paymentStage !== 'completed') return;

    let seconds = 2;
    setRedirectCountdown(2);

    const interval = setInterval(() => {
      seconds -= 1;
      if (seconds >= 0) {
        setRedirectCountdown(seconds);
      }
      if (seconds <= 0) {
        clearInterval(interval);
        router.push('/payments');
      }
    }, 1000);

    const timer = setTimeout(() => {
      router.push('/payments');
    }, 2500);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [paymentStage, router]);

  useEffect(() => {
    if (secondsLeft <= 0 || paymentStage === 'completed') return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft, paymentStage]);

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

  // Transition to Confirming via visibilitychange when returning from UPI app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && hasProceeded && paymentStage === 'initial') {
        setPaymentStage('confirming');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hasProceeded, paymentStage]);

  // Handle Instant 1-Click Pay
  const handleProceedToPay = () => {
    setHasProceeded(true);
    if (typeof window !== 'undefined') {
      window.location.href = upiUri;
    }
    // Transition to confirming view after brief dispatch
    setTimeout(() => {
      setPaymentStage('confirming');
    }, 1200);
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

  // Confirm Payment with Backend API
  const handleConfirmPayment = async () => {
    setConfirmingLoading(true);
    try {
      const res = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          amount: rawAmount,
          customer_name: customerName,
          customer_phone: customerPhone,
          item_description: itemDescription,
          payment_mode: paymentMode === 'cash' ? 'Cash' : 'UPI / QR',
          utr: utrInput.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record payment');
      }

      setCompletedData({
        order_id: data.order_id || orderId,
        utr: data.utr || 'VERIFIED',
        amount: data.amount || rawAmount,
        payment_mode: data.payment_mode || (paymentMode === 'cash' ? 'Cash' : 'UPI / QR'),
        paid_at: data.paid_at || new Date().toISOString(),
      });
      setPaymentStage('completed');
      toast.success('Payment Recorded & Ledger Updated!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm payment';
      toast.error(msg);
    } finally {
      setConfirmingLoading(false);
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
          {paymentStage !== 'completed' && (
            <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-cyan-50 font-medium">
                <Clock className="h-3.5 w-3.5 animate-pulse text-amber-300" />
                <span>Session expires in</span>
              </div>
              <div className="font-mono font-bold px-2 py-0.5 rounded-md bg-black/25 text-amber-200 text-xs border border-white/10">
                {timerText}
              </div>
            </div>
          )}
        </div>

        {/* 2. STAGE: COMPLETED (Green Receipt Card) */}
        {paymentStage === 'completed' && completedData && (
          <div className="p-6 space-y-6">
            <div className="text-center space-y-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border border-emerald-200 shadow-sm animate-in zoom-in duration-300">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Payment Recorded & Ledger Updated!
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Your transaction has been securely captured in Best Auto Parts CRM.
                </p>
              </div>
            </div>

            {/* Receipt Summary Block */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Order ID:</span>
                <span className="font-bold text-slate-900">#{completedData.order_id}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Amount Received:</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {formatCurrency(completedData.amount)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Payment Mode:</span>
                <span className="font-semibold text-slate-900">{completedData.payment_mode}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Ref ID / UTR:</span>
                <span className="font-bold text-slate-800 truncate max-w-[180px]">
                  {completedData.utr}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 font-sans">Timestamp:</span>
                <span className="text-slate-600 text-[11px]">
                  {new Date(completedData.paid_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-start gap-2.5 text-xs text-blue-800">
              <Receipt className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Automated WhatsApp payment confirmation receipt has been sent to{' '}
                <strong className="font-mono">{customerPhone}</strong>.
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                type="button"
                onClick={() => {
                  router.push('/payments');
                }}
                className="w-full h-11 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                <span>Back to CRM / Done</span>
                <span className="text-xs font-normal text-emerald-100">
                  (Redirecting in {redirectCountdown}s...)
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* 3. STAGE: CONFIRMING (Instant Confirmation Card) */}
        {paymentStage === 'confirming' && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Confirm Payment</h2>
                <p className="text-xs text-slate-500">
                  Verify your payment to instantly update the running ledger.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                #{orderId}
              </span>
            </div>

            {/* Total Payable Box */}
            <div className="rounded-xl bg-slate-900 p-4 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400">Total Payable Amount</span>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {formatCurrency(rawAmount)}
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30">
                {paymentMode === 'cash' ? 'Cash Pickup' : 'UPI / QR Payment'}
              </span>
            </div>

            {/* Optional 12-digit UTR Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>12-Digit UPI Ref / UTR (Optional)</span>
                <span className="text-[10px] text-slate-400">From GPay / PhonePe / Paytm</span>
              </label>
              <Input
                placeholder="e.g. 432109876543 (or leave blank to auto-generate)"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                maxLength={20}
                className="h-10 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-500">
                If omitted, an instant QR transaction reference will be auto-generated for your ledger record.
              </p>
            </div>

            {/* Confirm Payment Button */}
            <Button
              type="button"
              disabled={confirmingLoading}
              onClick={handleConfirmPayment}
              className="w-full h-12 text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-lg shadow-emerald-600/20 gap-2 transition-all"
            >
              {confirmingLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating Ledger & Sending Receipt...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>✅ I Have Paid {formatCurrency(rawAmount)} — Update Ledger</span>
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => setPaymentStage('initial')}
              className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 w-full pt-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Payment Mode & QR</span>
            </button>
          </div>
        )}

        {/* 4. STAGE: INITIAL (Standard Selection View) */}
        {paymentStage === 'initial' && (
          <div className="p-6 space-y-5">
            {/* Order / Ledger Summary Section */}
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

            {/* Total Payable Box */}
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

            {/* Payment Mode Toggle Tabs */}
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
                  <span>Proceed to Pay {formatCurrency(rawAmount)} -&gt;</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-center text-[11px] text-slate-500 font-medium">
                  Opens PhonePe, Google Pay, Paytm, or BHIM directly on your device
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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

                  {/* Direct transition to Confirm Card */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPaymentStage('confirming')}
                    className="w-full h-9 text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    I Have Paid {formatCurrency(rawAmount)}
                  </Button>
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

                <Button
                  type="button"
                  onClick={() => setPaymentStage('confirming')}
                  className="w-full h-11 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Record Cash Payment ({formatCurrency(rawAmount)})
                </Button>

                <a
                  href={`https://wa.me/919634722174?text=${encodeURIComponent(
                    `Hello Saud Bhai, main Order #${orderId} (${formatCurrency(rawAmount)}) ka cash payment dukan par aakar karunga.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Notify Saud Bhai on WhatsApp</span>
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
        )}
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
