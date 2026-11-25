'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet,
  IndianRupee,
  CheckCircle2,
  MessageCircle,
  Copy,
  Loader2,
  User,
  Wrench,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { PaymentLinkItem } from '@/app/(dashboard)/payments/page';

interface RecordCustomerPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PaymentLinkItem | null;
  onSuccess: () => void;
}

interface PaymentRecordedState {
  orderId: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  mode: string;
  status: 'PAID' | 'PARTIAL';
  remaining: number;
  utr?: string;
}

export function RecordCustomerPaymentDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
}: RecordCustomerPaymentDialogProps) {
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<string>('UPI / QR');
  const [payRefId, setPayRefId] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<PaymentRecordedState | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Compute amounts based on the selected order
  const totalAmount = order ? Number(order.amount) || 0 : 0;
  const currentPaid = order
    ? order.status === 'PAID'
      ? totalAmount
      : Number(order.paid_amount) || 0
    : 0;
  const remainingAmount = order
    ? order.remaining_amount !== undefined && order.remaining_amount !== null
      ? Number(order.remaining_amount)
      : Math.max(0, totalAmount - currentPaid)
    : 0;

  // Reset and pre-populate when order changes
  useEffect(() => {
    if (order && open) {
      setSuccessData(null);
      const initialAmount = remainingAmount > 0 ? remainingAmount.toString() : totalAmount.toString();
      setPayAmount(initialAmount);
      setPayMode('UPI / QR');
      setPayRefId('');
      setPayNotes('');

      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }, 100);
    }
  }, [order, open, remainingAmount, totalAmount]);

  if (!order) return null;

  const role = order.contact_category || 'Customer';
  const customerName = order.customer_name || 'Valued Customer';

  const handleConfirmPayment = async () => {
    const enteredAmt = Number(payAmount);
    if (isNaN(enteredAmt) || enteredAmt <= 0) {
      toast.error('Please enter a valid payment amount greater than ₹0');
      return;
    }

    if (enteredAmt > remainingAmount && remainingAmount > 0) {
      toast.error(
        `Payment amount (₹${enteredAmt.toFixed(2)}) cannot exceed the remaining balance of ₹${remainingAmount.toFixed(2)}`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.order_id,
          merchant_transaction_id: order.merchant_transaction_id,
          amount: enteredAmt,
          customer_name: customerName,
          customer_phone: order.customer_phone,
          item_description: order.part_details,
          payment_mode: payMode,
          utr: payRefId || undefined,
          notes: payNotes || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record payment');
      }

      const newRemaining = Math.max(0, remainingAmount - enteredAmt);
      const newStatus = newRemaining <= 0 ? 'PAID' : 'PARTIAL';

      setSuccessData({
        orderId: order.order_id,
        customerName,
        customerPhone: order.customer_phone,
        amount: enteredAmt,
        mode: payMode,
        status: newStatus,
        remaining: newRemaining,
        utr: payRefId || data.utr,
      });

      toast.success(
        `Payment of ${formatCurrency(enteredAmt)} recorded! Order #${order.order_id} is now ${newStatus}.`
      );

      // Refresh parent ledger records and KPIs
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error recording payment';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const getReceiptWhatsAppText = (data: PaymentRecordedState) => {
    const isPaid = data.status === 'PAID';
    const lines = [
      `🧾 *PAYMENT RECEIPT — BEST AUTO PARTS*`,
      `📍 *Kailashpur, Saharanpur, UP 247001*`,
      `📞 +91 96347 22174 | UPI: \`9761224004-2@ybl\``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Customer / Partner:* ${data.customerName}`,
      `🔖 *Order ID:* #${data.orderId}`,
      `💰 *Amount Received:* *${formatCurrency(data.amount)}*`,
      `💳 *Payment Mode:* ${data.mode}`,
    ];

    if (data.utr) {
      lines.push(`🔢 *Ref / UTR:* \`${data.utr}\``);
    }

    if (isPaid) {
      lines.push(`✅ *Status:* FULLY PAID & SETTLED`);
    } else {
      lines.push(`⚡ *Status:* PARTIAL PAYMENT`);
      lines.push(`⏳ *Remaining Balance Due:* *${formatCurrency(data.remaining)}*`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🙏 Thank you for your business with *Best Auto Parts*!`);

    return lines.join('\n');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Record Customer / Mechanic Payment
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Record full or partial payment from {customerName} ({role}) for #{order.order_id}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {successData ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-center">
              <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h4 className="font-bold text-foreground text-sm">Payment Recorded Successfully</h4>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(successData.amount)} logged via {successData.mode}.
              </p>
              <div className="pt-1">
                {successData.status === 'PAID' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    ✓ Order Fully Settled (PAID)
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    ⚡ Balance Due: {formatCurrency(successData.remaining)}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <a
                href={`https://wa.me/${successData.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  getReceiptWhatsAppText(successData)
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants(),
                  'w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium'
                )}
              >
                <MessageCircle className="size-3.5" />
                Send Payment Receipt on WhatsApp
              </a>

              <Button
                variant="outline"
                className="w-full text-xs gap-1.5 border-border"
                onClick={() => {
                  navigator.clipboard.writeText(getReceiptWhatsAppText(successData));
                  toast.success('Receipt copied to clipboard!');
                }}
              >
                <Copy className="size-3.5" />
                Copy Receipt Text
              </Button>

              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Customer & Order Balance Context Card */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  {role === 'Mechanic' ? <Wrench className="size-3 text-amber-500" /> : <User className="size-3 text-emerald-500" />}
                  {role}:
                </span>
                <span className="font-semibold text-foreground">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID:</span>
                <span className="font-mono font-medium text-foreground">#{order.order_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Order Value:</span>
                <span className="font-mono font-medium text-foreground">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Paid:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  {formatCurrency(currentPaid)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="font-semibold text-foreground">Remaining Balance:</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
                  {formatCurrency(remainingAmount)}
                </span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pay-amt" className="text-xs">
                    Payment Amount (₹) *
                  </Label>
                  {remainingAmount > 0 && Number(payAmount) !== remainingAmount && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(remainingAmount.toString())}
                      className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                    >
                      Pay Full ({formatCurrency(remainingAmount)})
                    </button>
                  )}
                </div>
                <div className="relative mt-1">
                  <IndianRupee className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="pay-amt"
                    ref={amountInputRef}
                    type="number"
                    min="1"
                    max={remainingAmount > 0 ? remainingAmount : undefined}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="e.g. 1500"
                    className="pl-8 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pay-mode" className="text-xs">
                  Payment Mode
                </Label>
                <select
                  id="pay-mode"
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground cursor-pointer"
                >
                  <option value="UPI / QR">UPI / QR (GooglePay, PhonePe, Paytm)</option>
                  <option value="Cash in Hand">Cash in Hand</option>
                  <option value="Bank Transfer / IMPS">Bank Transfer / IMPS / NEFT</option>
                  <option value="Card">Debit / Credit Card</option>
                </select>
              </div>

              <div>
                <Label htmlFor="pay-ref" className="text-xs">
                  Reference ID / UTR / Txn Number
                </Label>
                <Input
                  id="pay-ref"
                  value={payRefId}
                  onChange={(e) => setPayRefId(e.target.value)}
                  placeholder="e.g. UPI Ref 4123891024 / UTR12345"
                  className="mt-1 text-xs font-mono"
                />
              </div>

              <div>
                <Label htmlFor="pay-notes" className="text-xs">
                  Notes (Optional)
                </Label>
                <Input
                  id="pay-notes"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Part payment received at counter"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                variant="outline"
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmPayment}
                disabled={submitting}
                className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Recording...
                  </>
                ) : (
                  '✓ Confirm Payment'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
