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
  MessageCircle,
  Send,
  Loader2,
  ExternalLink,
  Package,
  CheckCircle2,
  AlertCircle,
  Truck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseOrder } from '@/types/inventory';

interface SendPoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PurchaseOrder | null;
  onSentSuccess?: () => void;
}

export function SendPoDialog({
  open,
  onOpenChange,
  order,
  onSentSuccess,
}: SendPoDialogProps) {
  const [sending, setSending] = useState(false);

  if (!order) return null;

  const totalCost = Number(order.total_estimated_cost) || 0;
  const itemsCount = order.items?.length || order.total_items || 0;
  const unitsCount =
    order.total_units ||
    order.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) ||
    0;

  const cleanPhone = (order.supplier_phone || '').replace(/[^0-9]/g, '');
  const phone10 = cleanPhone.slice(-10);

  // Format the complete PO message for free wa.me dispatch
  const cleanPo = (order.po_number || '').replace(/^#/, '').trim();
  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const poLines = [
    `*PURCHASE ORDER — BEST AUTO PARTS* 🏍️`,
    `*PO No:* #${cleanPo} | *Date:* ${today}`,
    `*Wholesaler / Distributor:* ${order.supplier_name || ''}`,
    '',
  ];
  if (order.items && order.items.length > 0) {
    poLines.push('*Ordered Parts List:*');
    order.items.forEach((item, idx) => {
      const oem = item.oem_number ? `OEM: ${item.oem_number}` : '';
      const brand = item.brand ? `${item.brand}` : '';
      const spec = [oem, brand].filter(Boolean).join(' | ');
      const specStr = spec ? ` (${spec})` : '';
      poLines.push(`  ${idx + 1}. *${item.part_name}*${specStr} — *Qty: ${item.quantity} pcs*`);
    });
    poLines.push('');
  }
  poLines.push(`• Total Items: *${itemsCount}* | Total Units: *${unitsCount} pcs*`);
  if (totalCost > 0) {
    poLines.push(`• Est. Order Total: *₹${totalCost.toLocaleString('en-IN')}*`);
  }
  if (order.notes) {
    poLines.push(`• Notes: ${order.notes.trim()}`);
  }
  poLines.push('');
  poLines.push('Please confirm stock availability and dispatch schedule.');
  poLines.push('📍 *Delivery Address:* Best Auto Parts, Kailashpur, Dehradun Road, Saharanpur, UP 247001 | +91 96347 22174');
  poLines.push('📞 Saud Khan: +91 96347 22174');
  const poMessageText = poLines.join('\n');

  const waWebLink = phone10
    ? `https://wa.me/91${phone10}?text=${encodeURIComponent(poMessageText)}`
    : null;

  const handleSendViaApi = async () => {
    if (!phone10 || phone10.length !== 10) {
      toast.error('Wholesaler has an invalid or missing 10-digit mobile number');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: order.id,
          poNumber: order.po_number,
          supplierName: order.supplier_name,
          supplierPhone: order.supplier_phone,
          items: order.items,
          totalItems: itemsCount,
          totalUnits: unitsCount,
          totalEstimatedCost: totalCost,
          notes: order.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch purchase order');
      }

      toast.success(
        `PO #${order.po_number} marked as ORDERED! Outgoing text logged in CRM Inbox.`,
        {
          description: 'Free wa.me purchase order generated with Kailashpur delivery address.',
        }
      );

      const targetUrl = data.waLink || waWebLink;
      if (targetUrl) {
        window.open(targetUrl, '_blank');
      }

      onOpenChange(false);
      onSentSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error sending purchase order via WhatsApp');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600/15 via-teal-600/10 to-transparent p-5 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                Send Purchase Order via WhatsApp
                <Badge variant="outline" className="text-[11px] font-mono border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  #{order.po_number}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Dispatch official parts order to wholesaler with CRM Inbox thread logging
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Wholesaler Details */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                Wholesaler / Supplier
              </div>
              <div className="font-semibold text-foreground text-sm mt-0.5">
                {order.supplier_name}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                WhatsApp Contact
              </div>
              <div className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                {order.supplier_phone || 'No phone set'}
              </div>
            </div>
          </div>

          {/* PO Summary Metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-lg border border-border bg-card text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Items</div>
              <div className="font-bold text-sm text-foreground mt-0.5">{itemsCount} parts</div>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-card text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Total Units</div>
              <div className="font-bold text-sm text-foreground mt-0.5">{unitsCount} pcs</div>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-card text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Estimated Cost</div>
              <div className="font-bold text-sm font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatCurrency(totalCost)}
              </div>
            </div>
          </div>

          {/* Parts preview list */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Package className="size-3.5 text-primary" />
              <span>Parts to be ordered ({order.items?.length || 0}):</span>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/80 bg-background/50 divide-y divide-border/50 text-[11px]">
              {order.items && order.items.length > 0 ? (
                order.items.map((item, idx) => (
                  <div key={idx} className="p-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{item.part_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {[item.oem_number, item.brand].filter(Boolean).join(' • ') || 'Standard Specification'}
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold">
                      +{item.quantity} pcs
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-muted-foreground">No parts listed in PO</div>
              )}
            </div>
          </div>

          {order.notes && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px]">
              <span className="font-semibold">Notes:</span> {order.notes}
            </div>
          )}

          {/* CRM Notification Banner */}
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-2 text-blue-600 dark:text-blue-400 text-[11px]">
            <Sparkles className="size-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">CRM Auto-Sync:</span> Sending this PO will automatically create or update {order.supplier_name}&apos;s thread in <span className="font-semibold">/inbox</span> with the full itemized breakdown.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
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
              <span>Send via WhatsApp (wa.me)</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
