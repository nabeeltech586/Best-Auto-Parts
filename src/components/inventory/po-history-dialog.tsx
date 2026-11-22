'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Copy,
  PackageCheck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { PurchaseOrder } from '@/types/inventory';

interface PoHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStockUpdated?: () => void;
}

export function PoHistoryDialog({
  open,
  onOpenChange,
  onStockUpdated,
}: PoHistoryDialogProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/purchase-orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.purchase_orders || []);
      }
    } catch {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchOrders();
    }
  }, [open, fetchOrders]);

  const handleMarkReceived = async (po: PurchaseOrder) => {
    if (
      !confirm(
        `Mark Purchase Order #${po.po_number} as RECEIVED?\n\nThis will automatically add ${po.total_units} units into your live inventory stock and log the audit movement.`,
      )
    ) {
      return;
    }

    setReceivingId(po.id);
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}/receive`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to receive purchase order');
      }

      toast.success(
        `PO #${po.po_number} Received! Added ${data.total_stock_added} units to inventory.`,
      );
      fetchOrders();
      onStockUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error receiving PO');
    } finally {
      setReceivingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return (
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] gap-1">
            <CheckCircle2 className="size-3" />
            Received
          </Badge>
        );
      case 'SENT':
        return (
          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] gap-1">
            <Clock className="size-3" />
            Sent to Distributor
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="text-zinc-400 text-[10px]">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {status}
          </Badge>
        );
    }
  };

  const copyPoSummary = (po: PurchaseOrder) => {
    const today = new Date(po.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const lines = [
      `*PURCHASE ORDER - BEST AUTO PARTS*`,
      `*PO No:* #${po.po_number} | *Date:* ${today}`,
      `*To:* ${po.supplier_name}`,
      '',
    ];

    po.items.forEach((item, idx) => {
      const oem = item.oem_number ? `OEM: ${item.oem_number}` : '';
      const brand = item.brand ? `${item.brand}` : '';
      const spec = [oem, brand].filter(Boolean).join(' | ');
      const specStr = spec ? ` (${spec})` : '';
      lines.push(`${idx + 1}. ${item.part_name}${specStr} — *Qty: ${item.quantity} pcs*`);
    });

    lines.push('');
    lines.push(`*Total Items:* ${po.total_items} | *Total Units:* ${po.total_units}`);
    lines.push(`*Est. Value:* ${formatCurrency(po.total_estimated_cost)}`);
    if (po.notes) lines.push(`*Notes:* ${po.notes}`);
    lines.push('');
    lines.push('Please confirm availability & dispatch time.');
    lines.push('- Best Auto Parts, Saharanpur (+91 96347 22174)');

    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('PO message copied to clipboard');
  };

  const openWhatsApp = (po: PurchaseOrder) => {
    const clean = po.supplier_phone.replace(/[^0-9]/g, '');
    const today = new Date(po.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const lines = [
      `*PURCHASE ORDER - BEST AUTO PARTS*`,
      `*PO No:* #${po.po_number} | *Date:* ${today}`,
      `*To:* ${po.supplier_name}`,
      '',
    ];

    po.items.forEach((item, idx) => {
      const oem = item.oem_number ? `OEM: ${item.oem_number}` : '';
      const brand = item.brand ? `${item.brand}` : '';
      const spec = [oem, brand].filter(Boolean).join(' | ');
      const specStr = spec ? ` (${spec})` : '';
      lines.push(`${idx + 1}. ${item.part_name}${specStr} — *Qty: ${item.quantity} pcs*`);
    });

    lines.push('');
    lines.push(`*Total Items:* ${po.total_items} | *Total Units:* ${po.total_units}`);
    lines.push(`*Est. Value:* ${formatCurrency(po.total_estimated_cost)}`);
    if (po.notes) lines.push(`*Notes:* ${po.notes}`);
    lines.push('');
    lines.push('Please confirm availability & dispatch time.');
    lines.push('- Best Auto Parts, Saharanpur (+91 96347 22174)');

    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ClipboardList className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-foreground">
                Purchase Order (PO) History &amp; Restock
              </DialogTitle>
              <DialogDescription className="text-xs">
                Track sent distributor orders, view line items, and mark received orders to auto-increment live inventory stock.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {loading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading purchase order history...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
              No purchase orders created yet. Select parts on the inventory table and click &quot;Review &amp; Send Order&quot; to build a distributor purchase order.
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="text-xs">PO Number</TableHead>
                    <TableHead className="text-xs">Distributor</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-center">Items / Units</TableHead>
                    <TableHead className="text-xs text-right">Est. Cost</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="w-[140px] text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((po) => {
                    const isExpanded = expandedPoId === po.id;
                    const isReceiving = receivingId === po.id;
                    const dateFormatted = new Date(po.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });

                    return (
                      <>
                        <TableRow key={po.id} className="hover:bg-muted/20">
                          <TableCell className="py-2.5">
                            <button
                              type="button"
                              onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                              className="size-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                              title="Toggle details"
                            >
                              {isExpanded ? (
                                <ChevronUp className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </button>
                          </TableCell>

                          <TableCell className="py-2.5 font-mono text-xs font-bold text-foreground">
                            #{po.po_number}
                          </TableCell>

                          <TableCell className="py-2.5 text-xs">
                            <div className="font-semibold text-foreground">{po.supplier_name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              {po.supplier_phone}
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5 text-xs text-muted-foreground">
                            {dateFormatted}
                          </TableCell>

                          <TableCell className="py-2.5 text-center text-xs">
                            <span className="font-medium text-foreground">{po.total_items}</span> parts{' '}
                            <span className="text-muted-foreground font-mono">
                              ({po.total_units} pcs)
                            </span>
                          </TableCell>

                          <TableCell className="py-2.5 text-right font-mono text-xs font-semibold text-foreground">
                            {formatCurrency(po.total_estimated_cost)}
                          </TableCell>

                          <TableCell className="py-2.5 text-center">
                            {getStatusBadge(po.status)}
                          </TableCell>

                          <TableCell className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {po.status === 'SENT' ? (
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkReceived(po)}
                                  disabled={isReceiving}
                                  className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                                  title="Add ordered quantities to live stock"
                                >
                                  {isReceiving ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <PackageCheck className="size-3.5" />
                                  )}
                                  Receive
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openWhatsApp(po)}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-emerald-500 gap-1"
                                  title="Chat on WhatsApp"
                                >
                                  <MessageCircle className="size-3.5" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyPoSummary(po)}
                                className="size-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Copy PO text"
                              >
                                <Copy className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expandable Line Items Details */}
                        {isExpanded && (
                          <TableRow key={`${po.id}-expanded`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={8} className="p-3">
                              <div className="rounded-md border border-border/80 bg-card p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-foreground">
                                    Line Items in PO #{po.po_number}:
                                  </span>
                                  {po.received_at && (
                                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                                      <CheckCircle2 className="size-3" />
                                      Stock received on{' '}
                                      {new Date(po.received_at).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  )}
                                </div>

                                <Table>
                                  <TableHeader className="bg-muted/60">
                                    <TableRow className="h-7">
                                      <TableHead className="text-[11px] py-1">Part Name &amp; SKU</TableHead>
                                      <TableHead className="text-[11px] py-1">OEM / Brand</TableHead>
                                      <TableHead className="text-[11px] text-right py-1">Cost Price</TableHead>
                                      <TableHead className="text-[11px] text-center py-1">Order Qty</TableHead>
                                      <TableHead className="text-[11px] text-right py-1">Est. Line Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(po.items || []).map((item, idx) => (
                                      <TableRow key={idx} className="h-8">
                                        <TableCell className="py-1 text-xs">
                                          <span className="font-medium text-foreground">{item.part_name}</span>
                                          <span className="ml-2 font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">
                                            {item.sku}
                                          </span>
                                        </TableCell>
                                        <TableCell className="py-1 text-xs text-muted-foreground font-mono">
                                          {item.oem_number || item.brand || '—'}
                                        </TableCell>
                                        <TableCell className="py-1 text-xs text-right font-mono">
                                          {formatCurrency(item.cost_price)}
                                        </TableCell>
                                        <TableCell className="py-1 text-xs text-center font-mono font-bold text-foreground">
                                          {item.quantity} pcs
                                        </TableCell>
                                        <TableCell className="py-1 text-xs text-right font-mono font-medium text-foreground">
                                          {formatCurrency(item.total_cost || item.cost_price * item.quantity)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>

                                {po.notes && (
                                  <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded border border-border/50">
                                    <span className="font-semibold text-foreground">Order Notes: </span>
                                    {po.notes}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
