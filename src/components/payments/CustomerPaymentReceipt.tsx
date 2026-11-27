'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  ShieldCheck,
  Package,
  Printer,
  Sparkles,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export interface CustomerPaymentReceiptProps {
  orderId: string;
  amount: number;
  customerName?: string;
  customerPhone?: string;
  itemDescription?: string;
  paymentMode?: string;
  paymentId?: string;
  paidAt?: string | null;
  status?: 'PAID' | 'PENDING' | 'FAILED';
  autoRedirectSeconds?: number;
  whatsappUrl?: string;
}

export default function CustomerPaymentReceipt({
  orderId,
  amount,
  customerName = 'Valued Customer',
  customerPhone,
  itemDescription = 'Motorcycle Genuine Spare Parts',
  paymentMode = 'UPI / Online',
  paymentId,
  paidAt,
  status = 'PAID',
  autoRedirectSeconds = 4,
  whatsappUrl = 'https://wa.me/919634722174',
}: CustomerPaymentReceiptProps) {
  const [secondsLeft, setSecondsLeft] = useState(autoRedirectSeconds);
  const [isPaused, setIsPaused] = useState(false);

  const displayOrderId = orderId.startsWith('#') ? orderId : `#${orderId}`;

  const formattedDate = paidAt
    ? new Date(paidAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

  // 4-Second Auto-redirect to WhatsApp
  useEffect(() => {
    if (status !== 'PAID' || isPaused) return;

    if (secondsLeft <= 0) {
      if (typeof window !== 'undefined') {
        window.location.href = whatsappUrl;
      }
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (typeof window !== 'undefined') {
            window.location.href = whatsappUrl;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, status, isPaused, whatsappUrl]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      setIsPaused(true);
      window.print();
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Status Header */}
        {status === 'PAID' && (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30 mb-2">
              <Sparkles className="w-3 h-3" />
              PAYMENT VERIFIED & CONFIRMED
            </div>
            <h1 className="text-2xl font-bold">Payment Successful</h1>
            <p className="text-emerald-100 text-xs mt-1">Thank you! Your spare parts order is confirmed.</p>
          </div>
        )}

        {status === 'PENDING' && (
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm animate-pulse">
              <Clock className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Payment Pending</h1>
            <p className="text-amber-100 text-xs mt-1">Waiting for confirmation from your bank or UPI app.</p>
          </div>
        )}

        {status === 'FAILED' && (
          <div className="bg-gradient-to-r from-rose-600 to-red-700 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Payment Failed</h1>
            <p className="text-rose-100 text-xs mt-1">Transaction could not be completed. Stock is unchanged.</p>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6">
          <div className="text-center pb-5 border-b border-slate-100">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Amount Paid</span>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">{formatCurrency(amount)}</div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold mt-2 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Mode: {paymentMode}
            </div>
          </div>

          <div className="py-4 space-y-2.5 text-sm">
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 text-xs">Order ID:</span>
              <span className="font-semibold text-slate-900 font-mono text-xs">{displayOrderId}</span>
            </div>

            <div className="flex justify-between items-start py-1">
              <span className="text-slate-500 text-xs">Item(s):</span>
              <span className="font-medium text-slate-800 text-right text-xs max-w-[220px] line-clamp-2">
                {itemDescription}
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 text-xs">Customer Name:</span>
              <span className="font-medium text-slate-800 text-xs">{customerName}</span>
            </div>

            {customerPhone && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 text-xs">Customer Phone:</span>
                <span className="font-medium text-slate-800 text-xs">{customerPhone}</span>
              </div>
            )}

            {paymentId && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 text-xs">Razorpay Payment ID:</span>
                <span className="font-mono text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                  {paymentId}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 text-xs">Date & Time (IST):</span>
              <span className="text-slate-700 text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Store Info */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs text-slate-600 mt-2 space-y-1">
            <p className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-600" /> Best Auto Parts
            </p>
            <p>Kailashpur, Saharanpur, UP 247001 • Timing: 09:00 AM – 09:00 PM</p>
            <p className="text-emerald-700 font-medium">Direct Helpline: Saud Khan (+91 96347 22174)</p>
          </div>

          {/* Auto Redirect Banner */}
          {status === 'PAID' && (
            <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
              <p className="text-xs text-emerald-800">
                {isPaused ? (
                  <span>Auto-redirect paused. Click below to return to chat.</span>
                ) : (
                  <>
                    Redirecting to WhatsApp in{' '}
                    <strong className="font-mono text-emerald-700 font-bold text-sm">{secondsLeft}s</strong>...
                  </>
                )}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 flex flex-col gap-2.5">
            <a
              href={whatsappUrl}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-sm text-sm"
            >
              <Phone className="w-4 h-4" />
              Return to WhatsApp
            </a>

            <button
              type="button"
              onClick={handlePrint}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition text-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save Receipt
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
