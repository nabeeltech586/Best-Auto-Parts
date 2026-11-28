'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';
import {
  Receipt,
  Printer,
  Copy,
  CheckCircle2,
  PackageCheck,
  Send,
  Loader2,
  ExternalLink,
  CreditCard,
  Wallet,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export interface ReceiptOrderData {
  order_id: string;
  merchant_transaction_id?: string;
  customer_name?: string | null;
  customer_phone: string;
  part_details: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | string;
  razorpay_payment_id?: string | null;
  razorpay_payment_link_id?: string | null;
  gateway?: string | null;
  phonepe_transaction_id?: string | null;
  payment_mode?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
}

interface CustomerReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ReceiptOrderData | null;
}

export function CustomerReceiptDialog({
  open,
  onOpenChange,
  order,
}: CustomerReceiptDialogProps) {
  const [sendingApi, setSendingApi] = useState(false);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open || !order) return null;

  const isPaid = order.status === 'PAID';
  const rawDate = order.paid_at || order.created_at;
  const formattedDate = rawDate
    ? new Date(rawDate).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const paymentModeStr = (order.payment_mode || '').toUpperCase();
  const isCash = paymentModeStr === 'CASH' || paymentModeStr.includes('CASH');
  const isRazorpay =
    Boolean(order.razorpay_payment_id) ||
    Boolean(order.razorpay_payment_link_id) ||
    order.gateway === 'razorpay' ||
    paymentModeStr.includes('RAZORPAY') ||
    paymentModeStr.includes('ONLINE') ||
    paymentModeStr.includes('PAYMENT_LINK');

  const paymentSourceLabel = isRazorpay
    ? 'Razorpay Online'
    : isCash
    ? 'Cash'
    : 'Shop UPI / QR';

  const refLabel = order.razorpay_payment_id
    ? 'Razorpay Payment ID'
    : order.razorpay_payment_link_id
    ? 'Razorpay Link ID'
    : 'Transaction Ref / UTR';

  const refValue =
    order.razorpay_payment_id ||
    order.razorpay_payment_link_id ||
    order.phonepe_transaction_id ||
    'VERIFIED';

  const receiptText =
    `🧾 *Digital Payment Receipt — Best Auto Parts* 🏍️\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Order ID: #${order.order_id}\n` +
    `• Customer: ${order.customer_name || 'Customer'}\n` +
    `• Phone: ${order.customer_phone}\n` +
    `• Spare Part: ${order.part_details}\n` +
    `• Amount Paid: ${formatCurrency(order.amount)}\n` +
    `• Status: ${isPaid ? 'PAID (Success) ✅' : order.status}\n` +
    `• Payment Source: ${paymentSourceLabel}\n` +
    `• Payment Mode: ${order.payment_mode || (isRazorpay ? 'Razorpay Online (UPI/Card/NetBanking)' : 'UPI / QR')}\n` +
    `• ${refLabel}: ${refValue}\n` +
    `• Stock Status: Auto-Deducted (-1 Unit) ✅\n` +
    `• Date & Time: ${formattedDate}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for your order! Your payment has been verified and your spare parts are ready for dispatch/pickup.\n\n` +
    `📍 Store: Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
    `📞 Helpline: Saud Bhai (+91 96347 22174)`;

  const cleanPhone = (order.customer_phone || '').replace(/[^0-9]/g, '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(receiptText)}`
    : null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(receiptText);
    toast.success('Digital receipt copied to clipboard!');
  };

  const handleSendApi = async () => {
    if (!order || !cleanPhone) {
      toast.error('Recipient phone number is required');
      return;
    }

    setSendingApi(true);
    try {
      const res = await fetch('/api/whatsapp/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: order.customer_name || 'Customer',
          recipientPhone: order.customer_phone,
          receiptId: `#${order.order_id}`,
          details: order.part_details,
          totalAmount: Number(order.amount) || 0,
          paymentStatus: isPaid ? 'PAID (UPI/QR)' : String(order.status || 'PENDING'),
          date: formattedDate,
          formattedReceiptText: receiptText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send receipt via WhatsApp API');
      }

      toast.success('✓ Receipt Sent via WhatsApp!', {
        description: `Delivered to +${data.recipientPhone} via direct WhatsApp message. Logged in Inbox.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending receipt';
      toast.error(msg);
    } finally {
      setSendingApi(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-receipt-title"
    >
      {/* Print-specific style */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: auto;
            margin: 12mm;
          }
          html, body {
            background: #fff !important;
            color: #000 !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-customer-receipt,
          #printable-customer-receipt * {
            visibility: visible !important;
          }
          #printable-customer-receipt {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 600px !important;
            margin: 0 auto !important;
            padding: 24px !important;
            color: #000 !important;
            background: #fff !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            border-radius: 8px !important;
          }
          #printable-customer-receipt .text-muted-foreground {
            color: #4b5563 !important;
          }
          #printable-customer-receipt .text-foreground {
            color: #111827 !important;
          }
        }
      `,
        }}
      />

      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl bg-card border border-border text-foreground animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-border px-5 py-4 bg-card">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="customer-receipt-title"
                className="text-base font-bold text-foreground leading-tight"
              >
                Customer Digital Receipt
              </h2>
              <p className="text-xs text-muted-foreground">
                Official payment receipt & order confirmation for Best Auto Parts.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            title="Close Receipt (Esc)"
            aria-label="Close Receipt"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div
            id="printable-customer-receipt"
            className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5 space-y-4 font-mono text-xs text-foreground"
          >
            {/* Header */}
            <div className="text-center border-b border-border pb-3 font-sans space-y-1">
              <div className="inline-flex items-center justify-center gap-1.5 text-primary font-bold text-base">
                <span>🏍️</span>
                <span>Best Auto Parts</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Kailashpur, Saharanpur, UP 247001 | +91 96347 22174
              </p>
              <div className="inline-block mt-1 px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary">
                Official Cash Memo & Payment Receipt
              </div>
            </div>

            {/* Details Grid */}
            <div className="space-y-2 divide-y divide-border/50 font-sans">
              <div className="flex justify-between items-center gap-3 pt-1.5">
                <span className="text-muted-foreground text-xs shrink-0">Order ID:</span>
                <span className="font-mono font-bold text-foreground text-xs text-right min-w-0 break-words">
                  #{order.order_id}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Customer Name:</span>
                <span className="font-semibold text-foreground text-xs text-right min-w-0 break-words">
                  {order.customer_name || 'Customer'}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Customer WhatsApp:</span>
                <span className="font-mono text-foreground text-xs text-right min-w-0 break-words">
                  {order.customer_phone}
                </span>
              </div>

              <div className="flex justify-between items-start gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Spare Part Details:</span>
                <span className="font-semibold text-foreground text-xs text-right min-w-0 break-words max-w-[240px]">
                  {order.part_details}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Amount Paid:</span>
                <span className="font-mono font-extrabold text-foreground text-base text-emerald-600 dark:text-emerald-400 text-right min-w-0 break-words">
                  {formatCurrency(order.amount)}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Payment Status:</span>
                <div className="text-right shrink-0">
                  {isPaid ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                      <CheckCircle2 className="size-3" /> PAID (Success)
                    </Badge>
                  ) : order.status === 'PARTIAL' ? (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-semibold">
                      ⚡ PARTIALLY PAID
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      {order.status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Stock Inventory:</span>
                <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] gap-1 font-semibold shrink-0">
                  <PackageCheck className="size-3" /> Auto-Deducted (-1 Unit)
                </Badge>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Payment Source:</span>
                <div className="text-right shrink-0">
                  {isRazorpay ? (
                    <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 text-[10px] gap-1 font-semibold">
                      <CreditCard className="size-3" /> Razorpay Online
                    </Badge>
                  ) : isCash ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                      <Wallet className="size-3" /> Cash
                    </Badge>
                  ) : (
                    <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30 text-[10px] gap-1 font-semibold">
                      <ShieldCheck className="size-3" /> Shop UPI / QR
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Payment Mode:</span>
                <span className="font-medium text-foreground text-xs text-right min-w-0 break-words">
                  {isRazorpay
                    ? order.payment_mode || 'Razorpay Online (UPI / Cards / NetBanking)'
                    : isCash
                    ? 'Cash in Hand (Store Counter)'
                    : order.payment_mode || 'BestPay Instant (UPI / QR)'}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">{refLabel}:</span>
                <span
                  className="font-mono text-muted-foreground text-[11px] text-right min-w-0 break-words max-w-[200px]"
                  title={refValue}
                >
                  {refValue}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3 pt-2">
                <span className="text-muted-foreground text-xs shrink-0">Date & Time:</span>
                <span className="font-mono text-muted-foreground text-[11px] text-right min-w-0 break-words">
                  {formattedDate}
                </span>
              </div>
            </div>

            {/* Footer notice */}
            <div className="border-t border-border pt-2 text-[10px] text-muted-foreground text-center font-sans">
              Thank you for trusting Best Auto Parts! For any fitment support, contact Saud Bhai at +91 96347 22174.
            </div>
          </div>
        </div>

        {/* Action Bar Footer */}
        <div className="shrink-0 border-t border-border p-3 sm:p-4 flex flex-wrap items-center justify-center gap-2 bg-card">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs gap-1.5 border-border cursor-pointer"
          >
            <Printer className="size-3.5" />
            <span>Print Receipt</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="text-xs gap-1.5 border-border cursor-pointer"
          >
            <Copy className="size-3.5" />
            <span>Copy Receipt Text</span>
          </Button>

          {/* Send via API WhatsApp */}
          <Button
            size="sm"
            onClick={handleSendApi}
            disabled={sendingApi || !cleanPhone}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs cursor-pointer"
            title="Send official payment receipt directly via WhatsApp Cloud API"
          >
            {sendingApi ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            <span>Send via API WhatsApp</span>
          </Button>

          {/* Secondary Web Fallback */}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'text-xs gap-1 text-muted-foreground hover:text-foreground h-8 px-2 cursor-pointer'
              )}
              title="Open in WhatsApp Web"
            >
              <ExternalLink className="size-3" />
              <span>WhatsApp Web</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
