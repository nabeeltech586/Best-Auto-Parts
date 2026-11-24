'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  PackageCheck,
  IndianRupee,
  Check,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currency';
import type { PurchaseOrder, PurchaseOrderPaymentStatus } from '@/types/inventory';
import type { PaymentLinkRecord } from '@/lib/payments/phonepe-link';
import { CustomerReceiptDialog } from '@/components/payments/customer-receipt-dialog';

export default function OrderHistoryPage() {
  const [activeTab, setActiveTab] = useState<'distributor' | 'customer'>('customer');
  const [loading, setLoading] = useState(true);

  // Data states
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [customerOrders, setCustomerOrders] = useState<PaymentLinkRecord[]>([]);

  // Expanded PO row
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const [updatingStatusPoId, setUpdatingStatusPoId] = useState<string | null>(null);

  // Digital Receipt Dialog State
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentLinkRecord | null>(null);

  // Record Payment Dialog State for Purchase Orders
  const [payingPo, setPayingPo] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<string>('Cash');
  const [payRefId, setPayRefId] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    poNumber: string;
    supplierName: string;
    supplierPhone: string;
    amount: number;
    mode: string;
    refId: string;
  } | null>(null);

  // Input ref to focus on partial amount entry
  const amountInputRef = useRef<HTMLInputElement>(null);

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

  // Open Record Payment Modal
  const handleOpenRecordPayment = (po: PurchaseOrder, focusInput = false) => {
    const totalCost = Number(po.total_estimated_cost) || 0;
    const paidSoFar = Number(po.amount_paid) || 0;
    const remaining = Math.max(0, totalCost - paidSoFar);
    setPayingPo(po);
    setPayAmount(remaining > 0 ? String(remaining) : '');
    setPayMode('Cash');
    setPayRefId('');
    setPayNotes('');
    setPaymentSuccessData(null);

    if (focusInput) {
      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }, 150);
    }
  };

  // Quick Status Dropdown Handler on PO Card
  const handleQuickUpdateStatus = async (
    po: PurchaseOrder,
    targetStatus: PurchaseOrderPaymentStatus
  ) => {
    // If PARTIAL selected, open modal focused on amount
    if (targetStatus === 'PARTIAL') {
      handleOpenRecordPayment(po, true);
      return;
    }

    setUpdatingStatusPoId(po.id);

    const totalCost = Number(po.total_estimated_cost) || 0;
    const currentPaid = Number(po.amount_paid) || 0;
    const newAmountPaid = targetStatus === 'PAID' ? totalCost : 0;

    // 1. Immediate optimistic update on PO list and KPIs
    setPurchaseOrders((prev) =>
      prev.map((p) => {
        if (p.id === po.id) {
          return {
            ...p,
            payment_status: targetStatus,
            amount_paid: newAmountPaid,
          };
        }
        return p;
      })
    );

    // 2. Persist to API
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: targetStatus,
          amount_paid: newAmountPaid,
          payment_mode: 'Cash / Quick Settle',
          notes: targetStatus === 'PAID' ? 'Quick Settle from Orders Dashboard' : 'Reset to Unpaid',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update payment status');
      }

      if (targetStatus === 'PAID') {
        const remainingSettled = Math.max(0, totalCost - currentPaid);
        toast.success(
          `PO #${po.po_number} marked as PAID. ${
            remainingSettled > 0 ? `Logged ${formatCurrency(remainingSettled)} settlement entry.` : ''
          }`
        );
      } else {
        toast.success(`PO #${po.po_number} payment status reset to UNPAID.`);
      }

      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error updating payment status');
      fetchData(); // Rollback on failure
    } finally {
      setUpdatingStatusPoId(null);
    }
  };

  // Submit Supplier Payment from Modal
  const handleSubmitPayment = async () => {
    if (!payingPo) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid payment amount greater than ₹0');
      return;
    }

    setRecordingPayment(true);
    try {
      const res = await fetch('/api/inventory/suppliers/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: payingPo.supplier_id || null,
          supplier_name: payingPo.supplier_name,
          purchase_order_id: payingPo.id,
          amount: amt,
          payment_mode: payMode,
          reference_id: payRefId || null,
          notes: payNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record wholesaler payment');
      }

      // Immediate optimistic update of purchase order row
      const currentPaid = Number(payingPo.amount_paid) || 0;
      const totalCost = Number(payingPo.total_estimated_cost) || 0;
      const newPaid = Math.max(0, currentPaid + amt);
      const newStatus: PurchaseOrderPaymentStatus =
        newPaid >= totalCost && totalCost > 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.id === payingPo.id
            ? { ...p, amount_paid: newPaid, payment_status: newStatus }
            : p
        )
      );

      toast.success(`Payment of ${formatCurrency(amt)} recorded for PO #${payingPo.po_number}!`);
      setPaymentSuccessData({
        poNumber: payingPo.po_number,
        supplierName: payingPo.supplier_name,
        supplierPhone: payingPo.supplier_phone,
        amount: amt,
        mode: payMode,
        refId: payRefId,
      });

      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error recording payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  // Voucher Text Generator for Supplier
  const getSupplierVoucherText = (data: {
    poNumber: string;
    supplierName: string;
    amount: number;
    mode: string;
    refId: string;
  }) => {
    return (
      `🧾 *PAYMENT CONFIRMATION VOUCHER — BEST AUTO PARTS* 🏍️\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• Wholesaler / Firm: ${data.supplierName}\n` +
      `• Purchase Order: #${data.poNumber}\n` +
      `• Amount Paid: ${formatCurrency(data.amount)}\n` +
      `• Payment Mode: ${data.mode}\n` +
      `• Ref / UTR / Txn: ${data.refId || 'N/A'}\n` +
      `• Date: ${new Date().toLocaleDateString('en-IN')}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `We have credited ${formatCurrency(data.amount)} toward PO #${data.poNumber}. Please acknowledge receipt and share LR / dispatch details.\n\n` +
      `📍 Store: Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
      `📞 Saud Bhai: +91 96347 22174`
    );
  };

  // Customer Metrics
  const paidCustomerOrders = customerOrders.filter((o) => o.status === 'PAID');
  const pendingCustomerOrders = customerOrders.filter((o) => o.status === 'PENDING');
  const totalCustomerRevenue = paidCustomerOrders.reduce(
    (acc, curr) => acc + (Number(curr.amount) || 0),
    0
  );
  const activeDistributorPOs = purchaseOrders.filter((p) => p.status === 'SENT');

  // Distributor Ledger Metrics (instantly reflected from state)
  const totalDistributorBilled = purchaseOrders.reduce(
    (acc, po) => acc + (Number(po.total_estimated_cost) || 0),
    0
  );
  const totalDistributorPaid = purchaseOrders.reduce(
    (acc, po) => acc + (Number(po.amount_paid) || 0),
    0
  );
  const netDistributorBalanceDue = Math.max(0, totalDistributorBilled - totalDistributorPaid);

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Order History & Wholesaler Ledger
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Track customer orders, digital payment receipts, and distributor restock ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="gap-1.5 border-border"
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

      {/* Global KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card className="border-border bg-card/70 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Total Customer Revenue</span>
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

        <Card className="border-border bg-card/70 shadow-sm">
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

        <Card className="border-border bg-card/70 shadow-sm">
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

        <Card className="border-border bg-card/70 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Distributor Due</span>
              <div className="rounded-lg p-1.5 bg-rose-500/10 text-rose-500">
                <Wallet className="size-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 truncate">
              {formatCurrency(netDistributorBalanceDue)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Pending to wholesalers</p>
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
            Distributor Ledger & POs ({purchaseOrders.length})
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
                    <TableHead className="text-xs font-semibold">Payment Status</TableHead>
                    <TableHead className="text-xs font-semibold">PhonePe Ref</TableHead>
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerOrders.map((order) => {
                    const isPaid = order.status === 'PAID';
                    const isPending = order.status === 'PENDING';
                    const rawDate = order.paid_at || order.created_at;
                    const formattedDate = rawDate
                      ? new Date(rawDate).toLocaleDateString('en-IN', {
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
                          <div className="flex flex-col gap-1 items-start">
                            {isPaid ? (
                              <>
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                  <CheckCircle2 className="size-3" /> PAID
                                </Badge>
                                <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                                  <PackageCheck className="size-2.5" /> Deducted (-1)
                                </span>
                              </>
                            ) : isPending ? (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-semibold">
                                <Clock className="size-3" /> PENDING
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] gap-1 font-semibold">
                                <XCircle className="size-3" /> FAILED
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {order.phonepe_transaction_id || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
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
                            {isPaid ? 'View / Print Receipt' : 'Order Details'}
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

        {/* TAB 2: Distributor Restock Orders & Wholesaler Ledger */}
        <TabsContent value="distributor" className="space-y-4 mt-0">
          {/* Distributor Ledger Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-border bg-card/60 shadow-sm">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium">Total Billed from Wholesalers</span>
                  <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {formatCurrency(totalDistributorBilled)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Truck className="size-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/60 shadow-sm">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium">Total Paid to Wholesalers</span>
                  <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(totalDistributorPaid)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/60 shadow-sm">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium">Net Distributor Balance Due</span>
                  <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                    {formatCurrency(netDistributorBalanceDue)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="size-4" />
                </div>
              </CardContent>
            </Card>
          </div>

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

                  const confirmedDateStr = po.confirmed_at
                    ? new Date(po.confirmed_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : null;

                  const cleanPhone = (po.supplier_phone || '').replace(/[^0-9]/g, '');
                  const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

                  const amountPaid = Number(po.amount_paid) || 0;
                  const totalCost = Number(po.total_estimated_cost) || 0;
                  const paymentStatus: PurchaseOrderPaymentStatus =
                    po.payment_status ||
                    (amountPaid >= totalCost && totalCost > 0
                      ? 'PAID'
                      : amountPaid > 0
                      ? 'PARTIAL'
                      : 'UNPAID');

                  return (
                    <div key={po.id} className="p-4 hover:bg-muted/20 transition-colors space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-foreground">
                              #{po.po_number}
                            </span>

                            {/* Status Badge */}
                            {isReceived ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                <CheckCircle2 className="size-3" /> RECEIVED & STOCKED
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] gap-1 font-semibold">
                                <Clock className="size-3" /> SENT (In Transit)
                              </Badge>
                            )}

                            {/* Interactive Payment Status Dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                disabled={updatingStatusPoId === po.id}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-all hover:opacity-85 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer select-none',
                                  paymentStatus === 'PAID'
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                    : paymentStatus === 'PARTIAL'
                                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                )}
                                title="Click to change payment status"
                              >
                                {updatingStatusPoId === po.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : paymentStatus === 'PAID' ? (
                                  <Check className="size-3" />
                                ) : paymentStatus === 'PARTIAL' ? (
                                  <Wallet className="size-3" />
                                ) : (
                                  <Clock className="size-3" />
                                )}
                                <span>{paymentStatus === 'PARTIAL' ? 'PARTIAL PAYMENT' : paymentStatus}</span>
                                <ChevronDown className="size-2.5 opacity-70 ml-0.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-60 bg-popover border-border text-popover-foreground shadow-md">
                                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Quick Payment Status
                                </div>
                                <DropdownMenuItem
                                  onClick={() => handleQuickUpdateStatus(po, 'PAID')}
                                  className="text-xs flex items-center justify-between cursor-pointer text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 focus:bg-emerald-500/10"
                                >
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="size-3.5" />
                                    <span>Mark as PAID (Full Settle)</span>
                                  </div>
                                  {paymentStatus === 'PAID' && <Check className="size-3" />}
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => handleQuickUpdateStatus(po, 'PARTIAL')}
                                  className="text-xs flex items-center justify-between cursor-pointer text-blue-600 dark:text-blue-400 focus:text-blue-600 focus:bg-blue-500/10"
                                >
                                  <div className="flex items-center gap-2">
                                    <Wallet className="size-3.5" />
                                    <span>Record PARTIAL Payment...</span>
                                  </div>
                                  {paymentStatus === 'PARTIAL' && <Check className="size-3" />}
                                </DropdownMenuItem>

                                <DropdownMenuSeparator className="bg-border" />

                                <DropdownMenuItem
                                  onClick={() => handleQuickUpdateStatus(po, 'UNPAID')}
                                  className="text-xs flex items-center justify-between cursor-pointer text-amber-600 dark:text-amber-400 focus:text-amber-600 focus:bg-amber-500/10"
                                >
                                  <div className="flex items-center gap-2">
                                    <Clock className="size-3.5" />
                                    <span>Reset to UNPAID</span>
                                  </div>
                                  {(paymentStatus === 'UNPAID' || paymentStatus === 'PENDING') && <Check className="size-3" />}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            {confirmedDateStr && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                                Confirmed: {confirmedDateStr}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              Wholesaler: {po.supplier_name}
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
                              {formatCurrency(totalCost)}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              Paid: <span className={amountPaid >= totalCost ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>{formatCurrency(amountPaid)}</span> • {po.total_items} items ({po.total_units} pcs)
                            </div>
                          </div>

                          {/* Record Payment Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenRecordPayment(po)}
                            className="text-xs gap-1 h-8 border-border hover:bg-muted"
                          >
                            <Wallet className="size-3.5 text-primary" />
                            Record Payment
                          </Button>

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
                              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 text-xs gap-1 border-border')}
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
      <CustomerReceiptDialog
        open={Boolean(selectedReceipt)}
        onOpenChange={(v) => !v && setSelectedReceipt(null)}
        order={selectedReceipt}
      />

      {/* Record Supplier Payment Dialog */}
      {payingPo && (
        <Dialog open={Boolean(payingPo)} onOpenChange={(v) => !v && setPayingPo(null)}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Record Wholesaler Payment
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Credit payment to {payingPo.supplier_name} for PO #{payingPo.po_number}.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {paymentSuccessData ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-center">
                  <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <h4 className="font-bold text-foreground text-sm">Payment Recorded Successfully</h4>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(paymentSuccessData.amount)} logged via {paymentSuccessData.mode}.
                  </p>
                </div>

                <div className="space-y-2">
                  <a
                    href={`https://wa.me/${paymentSuccessData.supplierPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      getSupplierVoucherText(paymentSuccessData)
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants(), 'w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium')}
                  >
                    <MessageCircle className="size-3.5" />
                    Send Payment Voucher on WhatsApp
                  </a>

                  <Button
                    variant="outline"
                    className="w-full text-xs gap-1.5 border-border"
                    onClick={() => {
                      navigator.clipboard.writeText(getSupplierVoucherText(paymentSuccessData));
                      toast.success('Voucher copied to clipboard!');
                    }}
                  >
                    <Copy className="size-3.5" />
                    Copy Voucher Text
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* PO Balance Context */}
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Wholesaler:</span>
                    <span className="font-semibold text-foreground">{payingPo.supplier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total PO Value:</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatCurrency(payingPo.total_estimated_cost)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Already Paid:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(payingPo.amount_paid || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1">
                    <span className="font-semibold text-foreground">Remaining Balance:</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      {formatCurrency(
                        Math.max(0, (payingPo.total_estimated_cost || 0) - (payingPo.amount_paid || 0))
                      )}
                    </span>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Payment Amount (₹) *</Label>
                    <div className="relative mt-1">
                      <IndianRupee className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        ref={amountInputRef}
                        type="number"
                        min="1"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="e.g. 5000"
                        className="pl-8 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Payment Mode</Label>
                    <select
                      value={payMode}
                      onChange={(e) => setPayMode(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                    >
                      <option value="Cash">Cash in Hand</option>
                      <option value="UPI">UPI (GooglePay / PhonePe / Paytm)</option>
                      <option value="PhonePe">PhonePe Direct / PG</option>
                      <option value="Bank Transfer">Bank Transfer (IMPS / NEFT / RTGS)</option>
                      <option value="Cheque">Bank Cheque</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Reference ID / UTR / Txn Number</Label>
                    <Input
                      value={payRefId}
                      onChange={(e) => setPayRefId(e.target.value)}
                      placeholder="e.g. UPI Ref 4123891024 / UTR12345"
                      className="mt-1 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Notes (Optional)</Label>
                    <Input
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="e.g. Dispatched via Jain Transport LR #481"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayingPo(null)}
                className="text-xs"
              >
                {paymentSuccessData ? 'Close' : 'Cancel'}
              </Button>

              {!paymentSuccessData && (
                <Button
                  size="sm"
                  onClick={handleSubmitPayment}
                  disabled={recordingPayment || !payAmount || Number(payAmount) <= 0}
                  className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {recordingPayment ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Confirm Payment
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
