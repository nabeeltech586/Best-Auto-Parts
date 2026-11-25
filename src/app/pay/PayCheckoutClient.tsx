'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Loader2,
  Receipt,
  ArrowLeft,
  Printer,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';

interface LivePaymentStatus {
  orderId: string;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  paymentMode: string;
  referenceId: string;
  paidAt: string | null;
}

export default function PayCheckoutClient() {
  const searchParams = useSearchParams();

  // Query Parameters Fallbacks
  const urlOrderId = searchParams.get('order')?.trim() || 'BAP-ORDER';
  const urlCustomerName = searchParams.get('name')?.trim() || 'Valued Customer';
  const urlCustomerPhone = searchParams.get('phone')?.trim() || '+91 96347 22174';
  const urlItemDescription = searchParams.get('item')?.trim() || 'Motorcycle Genuine Spare Parts';
  const urlAmountParam = searchParams.get('amount')?.trim() || '340';
  const urlRawAmount = Math.max(1, Number(urlAmountParam) || 340);

  // Live Server State
  const [loadingLiveStatus, setLoadingLiveStatus] = useState(true);
  const [liveData, setLiveData] = useState<LivePaymentStatus>({
    orderId: urlOrderId,
    customerName: urlCustomerName,
    customerPhone: urlCustomerPhone,
    itemDescription: urlItemDescription,
    totalAmount: urlRawAmount,
    paidAmount: 0,
    remainingAmount: urlRawAmount,
    status: 'PENDING',
    paymentMode: 'UPI / QR',
    referenceId: 'PENDING',
    paidAt: null,
  });

  // UI Flow & States
  const [paymentStage, setPaymentStage] = useState<'initial' | 'confirming' | 'completed'>('initial');
  const [hasProceeded, setHasProceeded] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'upi' | 'cash'>('upi');
  const [showQr, setShowQr] = useState(true);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [confirmingLoading, setConfirmingLoading] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Completed State Data
  const [completedData, setCompletedData] = useState<{
    order_id: string;
    utr: string;
    amount: number;
    payment_mode: string;
    paid_at: string;
  } | null>(null);

  // 5-Minute Live Session Countdown Timer (300 seconds)
  const [secondsLeft, setSecondsLeft] = useState(300);

  // Auto-redirect countdown (8s) back to CRM on completed / already paid view
  const [redirectCountdown, setRedirectCountdown] = useState(8);
  const [isRedirectPaused, setIsRedirectPaused] = useState(false);

  // Dedicated navigation to CRM /payments using window.location.assign
  const navigateToCrm = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.assign('/payments');
    }
  }, []);

  // Fetch Live Order/Ledger Record on mount from Supabase via zero-cache endpoint
  const checkLiveStatus = useCallback(async () => {
    try {
      setLoadingLiveStatus(true);
      const params = new URLSearchParams({
        order: urlOrderId,
        phone: urlCustomerPhone,
        amount: String(urlRawAmount),
      });

      const res = await fetch(`/api/payments/order-status?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store, no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const totalAmt = Number(data.totalAmount) || urlRawAmount;
          const paidAmt = Number(data.paidAmount) || (data.status === 'PAID' ? totalAmt : 0);
          const remAmt =
            data.remainingAmount !== undefined
              ? Number(data.remainingAmount)
              : Math.max(0, totalAmt - paidAmt);
          const effStatus: 'PENDING' | 'PARTIAL' | 'PAID' =
            data.status === 'PAID' || remAmt <= 0
              ? 'PAID'
              : data.status === 'PARTIAL' || (paidAmt > 0 && remAmt > 0)
              ? 'PARTIAL'
              : 'PENDING';

          setLiveData({
            orderId: data.orderId || urlOrderId,
            customerName: data.customerName || urlCustomerName,
            customerPhone: data.customerPhone || urlCustomerPhone,
            itemDescription: data.itemDescription || urlItemDescription,
            totalAmount: totalAmt,
            paidAmount: paidAmt,
            remainingAmount: remAmt,
            status: effStatus,
            paymentMode: data.paymentMode || 'UPI / QR',
            referenceId: data.referenceId || 'VERIFIED',
            paidAt: data.paidAt || null,
          });

          // If fully paid, pre-fill completed stage
          if (effStatus === 'PAID') {
            setCompletedData({
              order_id: data.orderId || urlOrderId,
              utr: data.referenceId || 'VERIFIED',
              amount: totalAmt,
              payment_mode: data.paymentMode || 'UPI / QR',
              paid_at: data.paidAt || new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.warn('[pay] Live status check failed, using fallback:', err);
    } finally {
      setLoadingLiveStatus(false);
    }
  }, [urlOrderId, urlCustomerPhone, urlRawAmount, urlCustomerName, urlItemDescription]);

  useEffect(() => {
    checkLiveStatus();
  }, [checkLiveStatus]);

  // Derived effective payment target amounts
  const isAlreadyPaid = liveData.status === 'PAID' || liveData.remainingAmount <= 0;
  const isPartial = liveData.status === 'PARTIAL' && liveData.remainingAmount > 0;
  const payableAmount = isPartial ? liveData.remainingAmount : liveData.totalAmount;

  // Countdown timer for unpaid sessions
  useEffect(() => {
    if (secondsLeft <= 0 || isAlreadyPaid || paymentStage === 'completed') return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft, isAlreadyPaid, paymentStage]);

  const timerText = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  // Auto-redirect timer (8s) on the Completed / Already Paid view
  // Calls window.location.assign('/payments') when countdown reaches 0
  // Pauses automatically if paused by user or if the receipt preview modal is open
  useEffect(() => {
    const isCompletedView = isAlreadyPaid || paymentStage === 'completed';
    if (!isCompletedView || isRedirectPaused || showReceiptModal) {
      return;
    }

    if (redirectCountdown <= 0) {
      navigateToCrm();
      return;
    }

    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigateToCrm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAlreadyPaid, paymentStage, isRedirectPaused, showReceiptModal, redirectCountdown, navigateToCrm]);

  // UPI Configuration bound STRICTLY to payableAmount (remainingAmount if partial)
  const upiId = '9761224004-2@ybl';
  const upiAmountStr = Number.isInteger(payableAmount)
    ? String(payableAmount)
    : payableAmount.toFixed(2);
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    'Best Auto Parts'
  )}&am=${upiAmountStr}&cu=INR&tn=${encodeURIComponent(liveData.orderId)}`;

  // Visibility change fallback when returning from UPI app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        hasProceeded &&
        paymentStage === 'initial' &&
        !isAlreadyPaid
      ) {
        setPaymentStage('confirming');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hasProceeded, paymentStage, isAlreadyPaid]);

  // Handle Proceed to Pay
  const handleProceedToPay = () => {
    setHasProceeded(true);
    if (typeof window !== 'undefined') {
      window.location.href = upiUri;
    }
    setTimeout(() => {
      setPaymentStage('confirming');
    }, 1200);
  };

  // Copy UPI ID
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
          order_id: liveData.orderId,
          amount: payableAmount,
          customer_name: liveData.customerName,
          customer_phone: liveData.customerPhone,
          item_description: liveData.itemDescription,
          payment_mode: paymentMode === 'cash' ? 'Cash' : 'UPI / QR',
          utr: utrInput.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record payment');
      }

      const completedAt = data.paid_at || new Date().toISOString();
      setCompletedData({
        order_id: data.order_id || liveData.orderId,
        utr: data.utr || 'VERIFIED',
        amount: data.amount || payableAmount,
        payment_mode: data.payment_mode || (paymentMode === 'cash' ? 'Cash' : 'UPI / QR'),
        paid_at: completedAt,
      });

      // Update live status to fully paid
      setLiveData((prev) => ({
        ...prev,
        status: 'PAID',
        paidAmount: prev.totalAmount,
        remainingAmount: 0,
        paidAt: completedAt,
        referenceId: data.utr || 'VERIFIED',
      }));

      setPaymentStage('completed');
      toast.success(
        data.alreadyPaid
          ? 'Payment Already Verified & Recorded!'
          : 'Payment Recorded & Ledger Updated!'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm payment';
      toast.error(msg);
    } finally {
      setConfirmingLoading(false);
    }
  };

  // Formatted Timestamp for receipt
  const formattedPaidTimestamp = useMemo(() => {
    const raw = completedData?.paid_at || liveData.paidAt || new Date().toISOString();
    try {
      return new Date(raw).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return raw;
    }
  }, [completedData, liveData]);

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

          {/* Live Session Countdown Bar (Only shown when payment is active/unpaid) */}
          {!isAlreadyPaid && paymentStage !== 'completed' && (
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

        {/* 2. CASE A: FULL PAYMENT COMPLETED (Locked Green Confirmation Card) */}
        {(isAlreadyPaid || paymentStage === 'completed') && (
          <div className="p-6 space-y-6">
            <div className="text-center space-y-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border border-emerald-200 shadow-sm animate-in zoom-in duration-300">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 mb-2">
                  <span>✅ PAYMENT ALREADY COMPLETED</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  Transaction Verified & Ledger Updated
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  This bill is fully settled with Best Auto Parts. No further payment is required.
                </p>
              </div>
            </div>

            {/* Receipt Summary Block */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Order / Bill Ref:</span>
                <span className="font-bold text-slate-900">#{liveData.orderId}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Total Paid:</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {formatCurrency(completedData?.amount || liveData.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Payment Method:</span>
                <span className="font-semibold text-slate-900">
                  {completedData?.payment_mode || liveData.paymentMode || 'UPI / QR'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                <span className="text-slate-600 font-sans">Reference ID / UTR:</span>
                <span className="font-bold text-slate-800 truncate max-w-[200px]">
                  {completedData?.utr || liveData.referenceId || 'VERIFIED'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 font-sans">Paid Timestamp (IST):</span>
                <span className="text-slate-600 text-[11px] font-medium">
                  {formattedPaidTimestamp}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-start gap-2.5 text-xs text-blue-800">
              <Receipt className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Digital receipt is on record for{' '}
                <strong className="font-mono">{liveData.customerPhone}</strong>. Your parts are
                ready for workshop dispatch or counter pickup.
              </span>
            </div>

            {/* Action Buttons: High Visibility View/Download Receipt & WhatsApp Support */}
            <div className="space-y-2.5 pt-2 relative z-10">
              <Button
                type="button"
                onClick={() => {
                  setIsRedirectPaused(true);
                  setShowReceiptModal(true);
                }}
                className="w-full h-11 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <FileCheck2 className="h-4 w-4" />
                <span>📄 View / Download Digital Receipt</span>
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/919634722174?text=${encodeURIComponent(
                    `Hello Saud Bhai, mera Order #${liveData.orderId} (${formatCurrency(
                      liveData.totalAmount
                    )}) successfully paid hai. Please dispatch update dein.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>WhatsApp Support</span>
                </a>

                <a
                  href="/payments"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToCrm();
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer select-none shadow-sm"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  <span>← Back to CRM</span>
                </a>
              </div>

              {/* 8-Second Auto-Redirect Indicator with Pause/Resume */}
              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
                <span>
                  {isRedirectPaused || showReceiptModal ? (
                    <span className="text-amber-700 font-medium">Auto-redirect paused</span>
                  ) : (
                    <>
                      Auto-redirecting to CRM in{' '}
                      <strong className="font-mono text-emerald-700 font-bold">{redirectCountdown}s</strong>...
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setIsRedirectPaused((p) => !p)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 underline font-medium cursor-pointer"
                >
                  {isRedirectPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. STAGE: CONFIRMING (Verification & UTR Entry) */}
        {!isAlreadyPaid && paymentStage === 'confirming' && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Confirm Payment</h2>
                <p className="text-xs text-slate-500">
                  Verify your payment to instantly update the running ledger.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                #{liveData.orderId}
              </span>
            </div>

            {/* Partial Balance Breakdown Card if Partial */}
            {isPartial && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between font-medium text-slate-700">
                  <span>Total Bill Amount:</span>
                  <span className="font-mono font-semibold">{formatCurrency(liveData.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between font-medium text-emerald-700">
                  <span>Already Paid:</span>
                  <span className="font-mono font-semibold">
                    - {formatCurrency(liveData.paidAmount)}
                  </span>
                </div>
                <div className="pt-2 border-t border-amber-200 flex items-center justify-between font-bold text-amber-900 text-sm">
                  <span>Remaining Balance Due:</span>
                  <span className="font-mono">{formatCurrency(liveData.remainingAmount)}</span>
                </div>
              </div>
            )}

            {/* Total Payable Box */}
            <div className="rounded-xl bg-slate-900 p-4 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400">
                  {isPartial ? 'Balance Due to Pay' : 'Total Payable Amount'}
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {formatCurrency(payableAmount)}
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
                  <span>
                    ✅ I Have Paid {formatCurrency(payableAmount)} — Update Ledger
                  </span>
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

        {/* 4. STAGE: INITIAL (Standard Selection View with Partial / Unpaid Handling) */}
        {!isAlreadyPaid && paymentStage === 'initial' && (
          <div className="p-6 space-y-5">
            {/* Loading Indicator for live verification */}
            {loadingLiveStatus && (
              <div className="p-2.5 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600 shrink-0" />
                <span>Checking live ledger status with Best Auto Parts...</span>
              </div>
            )}

            {/* Order / Customer Summary Section */}
            <div>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                Order & Customer Summary
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                  <span className="text-[11px] text-slate-500 block">Customer / Partner</span>
                  <span className="text-sm font-bold text-slate-900 truncate block mt-0.5">
                    {liveData.customerName}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                  <span className="text-[11px] text-slate-500 block">Order / Ref ID</span>
                  <span className="text-xs font-mono font-bold text-slate-800 truncate block mt-1">
                    #{liveData.orderId}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-500">Item / Ledger Description</span>
                  <span className="text-xs font-medium text-slate-800 mt-0.5 line-clamp-1">
                    {liveData.itemDescription}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {liveData.customerPhone}
                </span>
              </div>
            </div>

            {/* CASE B: PARTIAL PAYMENT BREAKDOWN CARD */}
            {isPartial && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Partial Payment Record
                  </span>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-mono text-[10px]">
                    PARTIALLY PAID
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <div className="p-2 rounded-lg bg-white/80 border border-amber-200 text-center">
                    <span className="text-[10px] text-slate-500 block">Total Bill</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {formatCurrency(liveData.totalAmount)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <span className="text-[10px] text-emerald-700 block">Already Paid</span>
                    <span className="font-bold text-emerald-700 font-mono">
                      {formatCurrency(liveData.paidAmount)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-100 border border-amber-300 text-center">
                    <span className="text-[10px] text-amber-800 font-semibold block">Remaining Due</span>
                    <span className="font-extrabold text-amber-900 font-mono">
                      {formatCurrency(liveData.remainingAmount)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Total Payable Box (STRICTLY remainingAmount for partial, totalAmount for unpaid) */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-md relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-300">
                    {isPartial ? 'Remaining Balance Due Now' : 'Total Payable Amount'}
                  </span>
                  <div className="text-3xl font-extrabold tracking-tight mt-0.5 text-white font-mono">
                    {formatCurrency(payableAmount)}
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

            {/* TAB 1: UPI App / QR (STRICTLY BOUND TO payableAmount) */}
            {paymentMode === 'upi' && (
              <div className="space-y-4">
                {/* Primary Instant 1-Click Pay Button */}
                <Button
                  type="button"
                  onClick={handleProceedToPay}
                  className="w-full h-12 text-sm font-bold bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-lg shadow-teal-600/20 rounded-xl gap-2 transition-all transform active:scale-[0.99]"
                >
                  <span>Proceed to Pay {formatCurrency(payableAmount)} -&gt;</span>
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
                      <span className="text-xs font-bold text-slate-800">
                        Scan & Pay {formatCurrency(payableAmount)} via UPI
                      </span>
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
                    I Have Paid {formatCurrency(payableAmount)}
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
                  <p>Kailashpur, Saharanpur, UP 247001</p>
                  <p className="text-slate-500 font-mono mt-1">Open Daily: 9:00 AM – 9:00 PM</p>
                </div>

                <Button
                  type="button"
                  onClick={() => setPaymentStage('confirming')}
                  className="w-full h-11 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Record Cash Payment ({formatCurrency(payableAmount)})
                </Button>

                <a
                  href={`https://wa.me/919634722174?text=${encodeURIComponent(
                    `Hello Saud Bhai, main Order #${liveData.orderId} (${formatCurrency(
                      payableAmount
                    )}) ka cash payment dukan par aakar karunga.`
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

            {/* High-Trust Footer Badges */}
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

      {/* 5. MODAL: VIEW / DOWNLOAD DIGITAL RECEIPT */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                <h3 className="font-bold text-sm">Best Auto Parts — Digital Receipt</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="text-white/80 hover:text-white text-xs font-semibold px-2 py-1 rounded-md bg-white/10"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Receipt Content */}
            <div className="p-6 space-y-4 text-xs font-sans">
              <div className="text-center pb-3 border-b border-slate-200">
                <h4 className="font-extrabold text-base text-slate-900">BEST AUTO PARTS</h4>
                <p className="text-[11px] text-slate-500">
                  Kailashpur, Saharanpur, UP 247001
                </p>
                <p className="text-[10px] text-slate-400">Helpline & WhatsApp: +91 96347 22174</p>
                <div className="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>TAX INVOICE / CASH MEMO</span>
                </div>
              </div>

              <div className="space-y-2 font-mono">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Invoice / Order #:</span>
                  <span className="font-bold text-slate-800">{liveData.orderId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Customer Name:</span>
                  <span className="font-semibold text-slate-800">{liveData.customerName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Phone Number:</span>
                  <span className="font-semibold text-slate-800">{liveData.customerPhone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Item / Part:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                    {liveData.itemDescription}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Total Bill Amount:</span>
                  <span className="font-bold text-slate-800">{formatCurrency(liveData.totalAmount)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Amount Paid:</span>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    {formatCurrency(completedData?.amount || liveData.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Balance Remaining:</span>
                  <span className="font-bold text-slate-800">₹0.00 (Fully Settled)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">Payment Method:</span>
                  <span className="font-semibold text-slate-800">
                    {completedData?.payment_mode || liveData.paymentMode || 'UPI / QR'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-sans">UTR / Transaction Ref:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                    {completedData?.utr || liveData.referenceId || 'VERIFIED'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 font-sans">Date & Time:</span>
                  <span className="text-slate-600 text-[11px]">{formattedPaidTimestamp}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 text-center">
                This is a computer generated digital cash memo. Genuine two-wheeler spare parts
                supplied by Best Auto Parts.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="text-xs gap-1.5 flex-1"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print / Save PDF</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const receiptText =
                    `🧾 *Digital Payment Receipt — Best Auto Parts* 🏍️\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `• Order ID: #${liveData.orderId}\n` +
                    `• Customer: ${liveData.customerName}\n` +
                    `• Item: ${liveData.itemDescription}\n` +
                    `• Amount Paid: ${formatCurrency(completedData?.amount || liveData.totalAmount)}\n` +
                    `• Status: PAID & VERIFIED ✅\n` +
                    `• Ref / UTR: ${completedData?.utr || liveData.referenceId || 'VERIFIED'}\n` +
                    `• Date: ${formattedPaidTimestamp}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Store: Best Auto Parts, Kailashpur, Saharanpur | +91 96347 22174`;
                  navigator.clipboard.writeText(receiptText);
                  toast.success('Digital receipt text copied!');
                }}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 flex-1"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Receipt</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
