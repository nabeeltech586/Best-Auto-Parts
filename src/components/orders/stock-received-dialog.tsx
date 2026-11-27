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
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  PackageCheck,
  Send,
  Loader2,
  ExternalLink,
  MessageCircle,
  CheckCircle2,
  Sparkles,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseOrder } from '@/types/inventory';

interface StockReceivedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PurchaseOrder | null;
  onSentSuccess?: () => void;
}

const SALUTATION_OPTIONS = [
  { value: 'Sir Ji', label: 'Sir Ji' },
  { value: 'Assalamu Alaikum', label: 'Assalamu Alaikum' },
  { value: 'Aadab', label: 'Aadab' },
];

export function StockReceivedDialog({
  open,
  onOpenChange,
  order,
  onSentSuccess,
}: StockReceivedDialogProps) {
  const [salutation, setSalutation] = useState<'Sir Ji' | 'Assalamu Alaikum' | 'Aadab' | string>('Sir Ji');
  const [sending, setSending] = useState(false);

  if (!order) return null;

  const cleanPhone = (order.supplier_phone || '').replace(/[^0-9]/g, '');
  const phone10 = cleanPhone.slice(-10);
  const unitsCount =
    order.total_units ||
    order.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) ||
    0;

  const previewMessage =
    `✅ *${salutation} ${order.supplier_name}!* 📦\n\n` +
    `We have successfully received, counted, and verified the stock for *#${order.po_number}* at our shop.` +
    (unitsCount ? ` (Total Units: *${unitsCount} pcs*)` : '') +
    `\n\nAll items have been inspected and taken into inventory. Thank you for the prompt dispatch and cooperation!` +
    `\n\n📍 *Best Auto Parts*, Kailashpur, Saharanpur, UP 247001\n` +
    `📞 Saud Khan • +91 96347 22174`;

  const waWebLink = phone10
    ? `https://wa.me/91${phone10}?text=${encodeURIComponent(previewMessage)}`
    : null;

  const handleSendViaApi = async () => {
    if (!phone10 || phone10.length !== 10) {
      toast.error('Wholesaler has an invalid or missing 10-digit mobile number');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send-stock-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: order.id,
          poNumber: order.po_number,
          supplierName: order.supplier_name,
          supplierPhone: order.supplier_phone,
          salutation,
          totalUnits: unitsCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send stock received confirmation');
      }

      toast.success(
        `Stock Received confirmation sent to ${order.supplier_name}! Logged in CRM Inbox.`,
        {
          description: 'Delivered via direct WhatsApp confirmation message',
        }
      );

      onOpenChange(false);
      onSentSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error sending stock received notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-card border-border">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600/15 via-teal-600/10 to-transparent p-5 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <PackageCheck className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                Send Stock Received Thank You
                <Badge variant="outline" className="text-[11px] font-mono border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  #{order.po_number}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Confirm inventory receipt to wholesaler via WhatsApp Cloud API
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Supplier Info */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 className="size-4 text-primary" />
              <div>
                <div className="font-semibold text-foreground">{order.supplier_name}</div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {order.supplier_phone || 'No phone'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                +{unitsCount} pcs Received
              </Badge>
            </div>
          </div>

          {/* Salutation Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Salutation Preset (Meta Template Parameter {'{{1}}'}):</Label>
            <div className="grid grid-cols-3 gap-2">
              {SALUTATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSalutation(opt.value)}
                  className={cn(
                    'py-2 px-3 rounded-lg border text-xs font-medium transition-colors text-center',
                    salutation === opt.value
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">Message Preview:</span>
              <span className="text-[10px] text-muted-foreground">Direct WhatsApp Message</span>
            </div>
            <div className="p-3 rounded-lg bg-background border border-border/80 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {previewMessage}
            </div>
          </div>

          {/* CRM Note */}
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-2 text-blue-600 dark:text-blue-400 text-[11px]">
            <Sparkles className="size-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Instant CRM Inbox Sync:</span> This confirmation will appear in {order.supplier_name}&apos;s thread inside <span className="font-semibold">/inbox</span> immediately.
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 bg-muted/20 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2">
          {waWebLink && (
            <a
              href={waWebLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs gap-1 border-border w-full sm:w-auto')}
            >
              <ExternalLink className="size-3.5 text-muted-foreground" />
              <span>Open in WhatsApp Web</span>
            </a>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSendViaApi}
              disabled={sending}
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              <span>Send via WhatsApp API</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
