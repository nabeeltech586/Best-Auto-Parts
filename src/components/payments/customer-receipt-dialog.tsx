'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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

  if (!order) return null;

  const isPaid = order.status === 'PAID';
  const rawDate = order.paid_at || order.created_at;
  const formattedDate = rawDate
    ? new Date(rawDate).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const receiptText =
    `🧾 *Digital Payment Receipt — Best Auto Parts* 🏍️\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Order ID: #${order.order_id}\n` +
    `• Customer: ${order.customer_name || 'Customer'}\n` +
    `• Phone: ${order.customer_phone}\n` +
    `• Spare Part: ${order.part_details}\n` +
    `• Amount Paid: ${formatCurrency(order.amount)}\n` +
    `• Status: ${isPaid ? 'PAID (Success) ✅' : order.status}\n` +
    `• Payment Mode: ${order.payment_mode || 'UPI / QR'}\n` +
    `• Transaction Ref / UTR: ${order.phonepe_transaction_id || 'VERIFIED'}\n` +
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

      toast.success('✓ Receipt Sent via WhatsApp API!', {
        description: `Delivered to +${data.recipientPhone} via ${
          data.method === 'template' ? 'payment_receipt_voucher template' : 'WhatsApp direct message'
        }. Logged in Inbox.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending receipt';
      toast.error(msg);
    } finally {
      setSendingApi(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        {/* Print-specific style */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-customer-receipt, #printable-customer-receipt * {
              visibility: visible;
            }
            #printable-customer-receipt {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 24px;
              color: #000;
              background: #fff !important;
            }
          }
        `,
          }}
        />

        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Customer Digital Receipt
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Official payment receipt & order confirmation for Best Auto Parts.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Printable Receipt Card */}
        <div
          id="printable-customer-receipt"
          className="rounded-lg border border-border bg-muted/30 p-5 space-y-4 font-mono text-xs text-foreground"
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
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-muted-foreground text-xs">Order ID:</span>
              <span className="font-mono font-bold text-foreground text-xs">
                #{order.order_id}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Customer Name:</span>
              <span className="font-semibold text-foreground text-xs">
                {order.customer_name || 'Customer'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Customer WhatsApp:</span>
              <span className="font-mono text-foreground text-xs">
                {order.customer_phone}
              </span>
            </div>

            <div className="flex justify-between items-start pt-2">
              <span className="text-muted-foreground text-xs">Spare Part Details:</span>
              <span className="font-semibold text-foreground text-xs text-right max-w-[220px]">
                {order.part_details}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Amount Paid:</span>
              <span className="font-mono font-extrabold text-foreground text-base text-emerald-600 dark:text-emerald-400">
                {formatCurrency(order.amount)}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Payment Status:</span>
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

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Stock Inventory:</span>
              <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] gap-1 font-semibold">
                <PackageCheck className="size-3" /> Auto-Deducted (-1 Unit)
              </Badge>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Payment Mode:</span>
              <span className="font-medium text-foreground text-xs">
                {order.payment_mode || 'BestPay Instant (UPI / QR)'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Transaction Ref / UTR:</span>
              <span className="font-mono text-muted-foreground text-[11px] truncate max-w-[200px]">
                {order.phonepe_transaction_id || 'VERIFIED'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground text-xs">Date & Time:</span>
              <span className="font-mono text-muted-foreground text-[11px]">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Footer notice */}
          <div className="border-t border-border pt-2 text-[10px] text-muted-foreground text-center font-sans">
            Thank you for trusting Best Auto Parts! For any fitment support, contact Saud Bhai at +91 96347 22174.
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs gap-1.5 border-border"
          >
            <Printer className="size-3.5" />
            Print Receipt
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="text-xs gap-1.5 border-border"
          >
            <Copy className="size-3.5" />
            Copy Receipt Text
          </Button>

          {/* Send via API WhatsApp */}
          <Button
            size="sm"
            onClick={handleSendApi}
            disabled={sendingApi || !cleanPhone}
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
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
                'text-xs gap-1 text-muted-foreground hover:text-foreground h-8 px-2'
              )}
              title="Open in WhatsApp Web"
            >
              <ExternalLink className="size-3" />
              <span>WhatsApp Web</span>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
