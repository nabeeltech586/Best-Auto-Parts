'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ShoppingBag,
  Truck,
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Receipt,
  MessageCircle,
  Copy,
  ExternalLink,
  PackageCheck,
  ArrowRight,
  TrendingUp,
  IndianRupee,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/currency';
import type { PurchaseOrder } from '@/types/inventory';
import type { PaymentLinkRecord } from '@/lib/payments/phonepe-link';

export default function OrderHistoryPage() {
  const [activeTab, setActiveTab] = useState<'distributor' | 'customer'>('customer');
  const [loading, setLoading] = useState(true);

  // Data states
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [customerOrders, setCustomerOrders] = useState<PaymentLinkRecord[]>([]);

  // Expanded PO row
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);

  // Digital Receipt Dialog State
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentLinkRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, custRes] = await Promise.all([
        fetch('/api/inventory/purchase-orders'),
        fetch('/api/payments/links'),
      ]);

      if (poRes.ok) {
        const poData = await poRes.json();
        setPurchaseOrders(poData.purchase_orders || []);
      }
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomerOrders(custData.links || []);
      }
    } catch {
      toast.error('Failed to load orders history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Mark Received on PO
  const handleMarkReceived = async (po: PurchaseOrder) => {
    setReceivingPoId(po.id);
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}/receive`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to receive purchase order');
      }

      toast.success(
        `PO #${po.po_number} marked as RECEIVED. Inventory stock incremented for ${po.total_units} units!`
      );
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error receiving order');
    } finally {
      setReceivingPoId(null);
    }
  };

  // Metrics
  const paidCustomerOrders = customerOrders.filter((o) => o.status === 'PAID');
  const pendingCustomerOrders = customerOrders.filter((o) => o.status === 'PENDING');
  const totalCustomerRevenue = paidCustomerOrders.reduce(
    (acc, curr) => acc + (Number(curr.amount) || 0),
    0
  );
  const activeDistributorPOs = purchaseOrders.filter((p) => p.status === 'SENT');

  // Customer Receipt Text Formatter
  const getReceiptText = (receipt: PaymentLinkRecord) => {
    const formattedDate = receipt.paid_at
      ? new Date(receipt.paid_at).toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : new Date().toLocaleDateString('en-IN');

    return (
      `🧾 *Digital Payment Receipt — Best Auto Parts* 🏍️\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• Order ID: #${receipt.order_id}\n` +
      `• Customer: ${receipt.customer_name || 'Customer'}\n` +
      `• Spare Part: ${receipt.part_details}\n` +
      `• Amount Paid: ${formatCurrency(receipt.amount)}\n` +
      `• Payment Status: PAID (Success) ✅\n` +
      `• Payment Mode: ${receipt.payment_mode || 'UPI / PhonePe'}\n` +
      `• PhonePe Ref ID: ${receipt.phonepe_transaction_id || 'VERIFIED'}\n` +
      `• Date & Time: ${formattedDate}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Thank you for your order! Your payment has been verified and our team is preparing your spare parts.\n\n` +
      `📍 Store: Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
      `📞 Helpline: Saud Bhai (+91 96347 22174)`
    );
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Order History & Restock
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Track customer orders, digital payment receipts, and distributor restock purchase orders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Link
            href="/inventory"
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
          >
            <Plus className="size-4" />
            New Restock Order
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Total Paid Revenue</span>
              <div className="rounded-lg p-1.5 bg-emerald-500/10 text-emerald-500">
                <IndianRupee className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {formatCurrency(totalCustomerRevenue)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {paidCustomerOrders.length} successful payments
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Pending Orders</span>
              <div className="rounded-lg p-1.5 bg-amber-500/10 text-amber-500">
                <Clock className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {pendingCustomerOrders.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting customer payment</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active Distributor POs</span>
              <div className="rounded-lg p-1.5 bg-blue-500/10 text-blue-500">
                <Truck className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {activeDistributorPOs.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Dispatched to wholesalers</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Total Orders Logged</span>
              <div className="rounded-lg p-1.5 bg-primary/10 text-primary">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {customerOrders.length + purchaseOrders.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Combined customer & PO logs</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Order Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'distributor' | 'customer')}
        className="space-y-4"
      >
        <TabsList className="bg-muted/70 p-1">
          <TabsTrigger value="customer" className="gap-2 text-xs">
            <CreditCard className="size-3.5 text-emerald-500" />
            Customer Orders & Payments ({customerOrders.length})
          </TabsTrigger>
          <TabsTrigger value="distributor" className="gap-2 text-xs">
            <Truck className="size-3.5 text-blue-500" />
            Distributor Orders / POs ({purchaseOrders.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Customer Orders & Payments */}
        <TabsContent value="customer" className="space-y-4 mt-0">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading customer payments...
              </div>
            ) : customerOrders.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
                <CreditCard className="size-8 mx-auto text-muted-foreground/50" />
                <p className="font-semibold text-foreground">No customer orders yet</p>
                <p>Generate payment links from the Inbox chat to see customer orders here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-semibold">Order ID</TableHead>
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="text-xs font-semibold">Spare Part Details</TableHead>
                    <TableHead className="text-xs font-semibold">Amount</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">PhonePe Ref</TableHead>
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerOrders.map((order) => {
                    const isPaid = order.status === 'PAID';
                    const isPending = order.status === 'PENDING';
                    const formattedDate = order.created_at
                      ? new Date(order.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—';

                    return (
                      <TableRow key={order.merchant_transaction_id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-mono font-medium text-foreground">
                          #{order.order_id}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-foreground">
                            {order.customer_name || 'Customer'}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {order.customer_phone}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground max-w-xs truncate">
                          {order.part_details}
                        </TableCell>
                        <TableCell className="text-xs font-bold font-mono text-foreground">
                          {formatCurrency(order.amount)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {isPaid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                              <CheckCircle2 className="size-3" /> PAID
                            </Badge>
                          ) : isPending ? (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-semibold">
                              <Clock className="size-3" /> PENDING
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] gap-1 font-semibold">
                              <XCircle className="size-3" /> FAILED
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {order.phonepe_transaction_id || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formattedDate}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReceipt(order)}
                            className="h-7 text-xs gap-1 border-border"
                          >
                            <Receipt className="size-3 text-primary" />
                            {isPaid ? 'View Receipt' : 'Order Details'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: Distributor Restock Orders (POs) */}
        <TabsContent value="distributor" className="space-y-4 mt-0">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading distributor purchase orders...
              </div>
            ) : purchaseOrders.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
                <Truck className="size-8 mx-auto text-muted-foreground/50" />
                <p className="font-semibold text-foreground">No purchase orders created yet</p>
                <p>Select parts from the Inventory table and create a restock PO to track it here.</p>
                <Link
                  href="/inventory"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-2 text-xs')}
                >
                  Go to Auto Parts Inventory
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {purchaseOrders.map((po) => {
                  const isReceived = po.status === 'RECEIVED';
                  const isExpanded = expandedPoId === po.id;
                  const formattedDate = po.created_at
                    ? new Date(po.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';

                  const cleanPhone = (po.supplier_phone || '').replace(/[^0-9]/g, '');
                  const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

                  return (
                    <div key={po.id} className="p-4 hover:bg-muted/20 transition-colors space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-foreground">
                              #{po.po_number}
                            </span>
                            {isReceived ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                <CheckCircle2 className="size-3" /> RECEIVED & STOCKED
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] gap-1 font-semibold">
                                <Clock className="size-3" /> SENT (In Transit)
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              To: {po.supplier_name}
                            </span>
                            {po.supplier_phone && (
                              <span>• WhatsApp: {po.supplier_phone}</span>
                            )}
                            <span>• Created: {formattedDate}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-right sm:mr-3">
                            <div className="text-sm font-bold font-mono text-foreground">
                              {formatCurrency(po.total_estimated_cost)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {po.total_items} items • {po.total_units} total units
                            </div>
                          </div>

                          {!isReceived && (
                            <Button
                              size="sm"
                              onClick={() => handleMarkReceived(po)}
                              disabled={receivingPoId === po.id}
                              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-8"
                            >
                              {receivingPoId === po.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <PackageCheck className="size-3.5" />
                              )}
                              Mark Received
                            </Button>
                          )}

                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs gap-1')}
                            >
                              <MessageCircle className="size-3 text-emerald-500" />
                              WhatsApp
                            </a>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                            className="h-8 text-xs gap-1"
                          >
                            {isExpanded ? (
                              <ChevronUp className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                            {isExpanded ? 'Hide Items' : 'View Items'}
                          </Button>
                        </div>
                      </div>

                      {/* Expandable Line Items Table */}
                      {isExpanded && (
                        <div className="mt-3 rounded-lg border border-border bg-card/80 p-3">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="text-[11px] h-7">Part Name</TableHead>
                                <TableHead className="text-[11px] h-7">OEM / Brand</TableHead>
                                <TableHead className="text-[11px] h-7 text-right">Order Qty</TableHead>
                                <TableHead className="text-[11px] h-7 text-right">Est. Unit Cost</TableHead>
                                <TableHead className="text-[11px] h-7 text-right">Line Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {po.items.map((item, idx) => (
                                <TableRow key={idx} className="hover:bg-muted/30">
                                  <TableCell className="text-xs font-medium text-foreground py-1.5">
                                    {item.part_name}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground py-1.5">
                                    {[item.oem_number, item.brand].filter(Boolean).join(' • ') || '—'}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-bold py-1.5">
                                    {item.quantity} pcs
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono py-1.5">
                                    {formatCurrency(item.cost_price || item.unit_cost || 0)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono font-semibold py-1.5">
                                    {formatCurrency(
                                      item.total_cost ||
                                        (item.quantity || 0) * (item.cost_price || item.unit_cost || 0)
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Customer Digital Receipt Dialog */}
      {selectedReceipt && (
        <Dialog open={Boolean(selectedReceipt)} onOpenChange={(v) => !v && setSelectedReceipt(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle>Customer Digital Receipt</DialogTitle>
                  <DialogDescription className="text-xs">
                    Verified PhonePe payment receipt for Best Auto Parts.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 font-mono text-xs">
              <div className="text-center border-b border-border pb-2 font-sans">
                <h4 className="font-bold text-foreground text-sm">Best Auto Parts</h4>
                <p className="text-[11px] text-muted-foreground">
                  Kailashpur, Saharanpur, UP 247001 | +91 96347 22174
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order ID:</span>
                  <span className="font-bold text-foreground">#{selectedReceipt.order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="text-foreground">{selectedReceipt.customer_name || 'Customer'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WhatsApp:</span>
                  <span className="text-foreground">{selectedReceipt.customer_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spare Part:</span>
                  <span className="text-foreground font-semibold text-right max-w-[200px] truncate">
                    {selectedReceipt.part_details}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <span className="font-bold text-foreground text-sm">
                    {formatCurrency(selectedReceipt.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                    {selectedReceipt.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PhonePe Ref ID:</span>
                  <span className="text-foreground">{selectedReceipt.phonepe_transaction_id || 'VERIFIED'}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(getReceiptText(selectedReceipt));
                  toast.success('Digital receipt text copied to clipboard!');
                }}
                className="text-xs gap-1.5"
              >
                <Copy className="size-3.5" />
                Copy Receipt Text
              </Button>

              <a
                href={`https://wa.me/${(selectedReceipt.customer_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  getReceiptText(selectedReceipt)
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: 'sm' }), 'text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white')}
              >
                <MessageCircle className="size-3.5" />
                Send via WhatsApp
              </a>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
