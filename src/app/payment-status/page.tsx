'use client'

import React, { useEffect, useState, useTransition, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Phone,
  ArrowLeft,
  ShieldCheck,
  Package,
  Loader2,
} from 'lucide-react'

interface PaymentData {
  status: 'PAID' | 'PENDING' | 'FAILED'
  merchantTransactionId: string
  orderId?: string
  amount?: number
  customerName?: string
  partDetails?: string
  paymentMode?: string
  phonepeTransactionId?: string
  paidAt?: string
}

function PaymentStatusContent() {
  const searchParams = useSearchParams()
  const txnId = searchParams.get('txnId')
  const isSimulated = searchParams.get('simulated') === 'true'

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PaymentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [isPending, startTransition] = useTransition()

  const checkStatus = useCallback(async () => {
    if (!txnId) {
      setLoading(false)
      setError('Missing transaction ID.')
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`/api/payments/verify?txnId=${encodeURIComponent(txnId)}`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to check status')
      }
      setData(json)
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [txnId])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Auto-poll if pending (every 4s up to 6 times)
  useEffect(() => {
    if (data?.status === 'PENDING' && pollCount < 6) {
      const timer = setTimeout(() => {
        setPollCount((prev) => prev + 1)
        checkStatus()
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [data?.status, pollCount, checkStatus])

  // Mock simulate payment for testing
  const simulatePaymentSuccess = async () => {
    if (!txnId) return
    startTransition(async () => {
      try {
        setLoading(true)
        // Call webhook directly with mocked success
        const mockPayload = {
          response: Buffer.from(
            JSON.stringify({
              code: 'PAYMENT_SUCCESS',
              data: {
                merchantTransactionId: txnId,
                transactionId: `SIM_${Date.now()}`,
                paymentInstrument: { type: 'UPI' },
              },
            })
          ).toString('base64'),
        }

        // Verify endpoint handles update
        await fetch(`/api/payments/verify?txnId=${encodeURIComponent(txnId)}`)
        await checkStatus()
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })
  }

  if (!txnId) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Request</h1>
          <p className="text-sm text-slate-600 mb-6">No transaction reference found in URL.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </main>
    )
  }

  const status = data?.status || 'PENDING'

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Status Header */}
        {status === 'PAID' && (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Payment Successful</h1>
            <p className="text-emerald-100 text-sm mt-1">Thank you! Your payment has been confirmed.</p>
          </div>
        )}

        {status === 'PENDING' && (
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm animate-pulse">
              <Clock className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Payment is Pending</h1>
            <p className="text-amber-100 text-sm mt-1">Waiting for confirmation from your bank or UPI app.</p>
          </div>
        )}

        {status === 'FAILED' && (
          <div className="bg-gradient-to-r from-rose-600 to-red-700 text-white p-6 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Payment Failed</h1>
            <p className="text-rose-100 text-sm mt-1">Transaction could not be completed.</p>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6">
          {data?.amount ? (
            <div className="text-center pb-6 border-b border-slate-100">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Amount</span>
              <div className="text-3xl font-extrabold text-slate-900 mt-1">₹{data.amount.toFixed(2)}</div>
              {data.paymentMode && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold mt-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Mode: {data.paymentMode}
                </div>
              )}
            </div>
          ) : null}

          <div className="py-4 space-y-3 text-sm">
            {data?.orderId && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-semibold text-slate-800">#{data.orderId}</span>
              </div>
            )}
            {data?.partDetails && (
              <div className="flex justify-between items-start py-1">
                <span className="text-slate-500">Item / Part:</span>
                <span className="font-medium text-slate-800 text-right max-w-[200px]">{data.partDetails}</span>
              </div>
            )}
            {data?.customerName && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Customer:</span>
                <span className="font-medium text-slate-800">{data.customerName}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Reference:</span>
              <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded max-w-[200px] truncate">
                {txnId}
              </span>
            </div>
            {data?.phonepeTransactionId && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">PhonePe Ref ID:</span>
                <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {data.phonepeTransactionId}
                </span>
              </div>
            )}
          </div>

          {/* Store Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 mt-2 space-y-1">
            <p className="font-semibold text-slate-800 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-emerald-600" /> Best Auto Parts
            </p>
            <p>Kailashpur, Saharanpur, UP 247001 • Timing: 09:00 AM – 09:00 PM</p>
            <p className="text-slate-500">Saud Bhai: +91 96347 22174</p>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col gap-2.5">
            {status === 'PENDING' && (
              <button
                type="button"
                onClick={checkStatus}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium rounded-xl transition shadow-sm text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Checking Status...' : 'Check Status Now'}
              </button>
            )}

            {isSimulated && status === 'PENDING' && (
              <button
                type="button"
                onClick={simulatePaymentSuccess}
                disabled={loading || isPending}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl transition text-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                Simulate Successful Payment (Sandbox Test)
              </button>
            )}

            <a
              href="https://wa.me/919634722174"
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition shadow-sm text-sm"
            >
              <Phone className="w-4 h-4" />
              Help / Chat on WhatsApp
            </a>

            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Store
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function PaymentStatusPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-sm text-slate-600 font-medium">Checking payment status...</p>
          </div>
        </main>
      }
    >
      <PaymentStatusContent />
    </Suspense>
  )
}

