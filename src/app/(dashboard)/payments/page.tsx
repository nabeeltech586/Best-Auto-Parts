'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Check,
  Loader2,
  Receipt,
  Wrench,
  User,
  AlertCircle,
  Wallet,
  Phone,
  Bike,
  Package,
  Calendar,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SendPaymentLinkDialog } from '@/components/inbox/send-payment-link-dialog';
import { CustomerReceiptDialog } from '@/components/payments/customer-receipt-dialog';
import { RecordCustomerPaymentDialog } from '@/components/payments/record-customer-payment-dialog';
import { LocalDeliveryDialog } from '@/components/orders/local-delivery-dialog';
import { formatCurrency } from '@/lib/currency';
import { stripPartialMetadataTag } from '@/lib/payments/partial-metadata';
import {
  isRazorpayOnlinePayment,
  isRazorpayTransaction,
  getIstDateString,
  getTodayIstDateString,
  getYesterdayIstDateString,
  formatIstDisplayDate,
  PaymentFilterTab,
} from '@/lib/payments/filters';
import { cn } from '@/lib/utils';

export interface PaymentLinkItem {
  id?: string;
  order_id: string;
  merchant_transaction_id: string;
  customer_name?: string;
  customer_phone: string;
  part_details: string;
  amount: number;
  paid_amount?: number;
  remaining_amount?: number;
  status: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED';
  delivery_status?: 'Confirmed' | 'Packed / Ready' | 'Out for Delivery (Local Rider)' | 'Delivered' | string;
  rider_name?: string | null;
  rider_phone?: string | null;
  delivered_at?: string | null;
  delivery_notes?: string | null;
  razorpay_payment_link_url?: string;
  razorpay_payment_link_id?: string;
  razorpay_payment_id?: string;
  gateway?: string | null;
  phonepe_redirect_url?: string;
  phonepe_transaction_id?: string;
  payment_mode?: string;
  paid_at?: string;
  created_at: string;
  contact_category?: 'Mechanic' | 'Customer';
}

export interface PaymentMetrics {
  totalCollected: number;
  pendingAmount: number;
  paidCount: number;
  pendingCount: number;
  totalCount: number;
  mechanicCount?: number;
  customerCount?: number;
  razorpayCollected?: number;
  razorpayCount?: number;
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          Loading collections & customer ledger...
        </div>
      }
    >
      <PaymentsPageInner />
    </Suspense>
  );
}

function PaymentsPageInner() {
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search');
  const urlTab = searchParams.get('tab');

  const [links, setLinks] = useState<PaymentLinkItem[]>([]);
  const [metrics, setMetrics] = useState<PaymentMetrics>({
    totalCollected: 0,
    pendingAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    totalCount: 0,
    mechanicCount: 0,
    customerCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<PaymentFilterTab>(() => {
    if (urlTab === 'razorpay' || urlTab === 'online') return 'RAZORPAY';
    if (urlTab === 'udhaar' || urlTab === 'pending') return 'PENDING';
    if (urlTab === 'paid') return 'PAID';
    if (urlTab === 'mechanic') return 'MECHANIC';
    if (urlTab === 'customer') return 'CUSTOMER';
    if (urlTab === 'failed') return 'FAILED';
    return 'ALL';
  });

  const [search, setSearch] = useState(() => urlSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => urlSearch || '');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [quickDateFilter, setQuickDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM'>('ALL');
  const [deletingItem, setDeletingItem] = useState<PaymentLinkItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [verifyingTxnId, setVerifyingTxnId] = useState<string | null>(null);
  const [updatingStatusTxnId, setUpdatingStatusTxnId] = useState<string | null>(null);
  const [copiedTxnId, setCopiedTxnId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentLinkItem | null>(null);
  const [payingRecord, setPayingRecord] = useState<PaymentLinkItem | null>(null);
  const [selectedDeliveryOrder, setSelectedDeliveryOrder] = useState<PaymentLinkItem | null>(null);

  // Sync state if URL search params change
  useEffect(() => {
    if (urlSearch !== null && urlSearch !== undefined) {
      setSearch(urlSearch);
      setDebouncedSearch(urlSearch);
    }
    if (urlTab) {
      if (urlTab === 'razorpay' || urlTab === 'online') {
        setActiveTab('RAZORPAY');
      } else if (urlTab === 'udhaar' || urlTab === 'pending') {
        setActiveTab('PENDING');
      } else if (urlTab === 'paid') {
        setActiveTab('PAID');
      } else if (urlTab === 'mechanic') {
        setActiveTab('MECHANIC');
      } else if (urlTab === 'customer') {
        setActiveTab('CUSTOMER');
      } else if (urlTab === 'failed') {
        setActiveTab('FAILED');
      } else if (urlTab === 'all') {
        setActiveTab('ALL');
      }
    }
  }, [urlSearch, urlTab]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch payment links & metrics
  const fetchLinks = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const params = new URLSearchParams();
      if (activeTab === 'RAZORPAY') params.set('status', 'RAZORPAY');
      else if (activeTab === 'PAID') params.set('status', 'PAID');
      else if (activeTab === 'PENDING') params.set('status', 'PENDING');
      else if (activeTab === 'FAILED') params.set('status', 'FAILED');
      else if (activeTab === 'MECHANIC') params.set('category', 'Mechanic');
      else if (activeTab === 'CUSTOMER') params.set('category', 'Customer');

      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/payments/links?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payment links');

      const data = await res.json();
      setLinks(data.links || []);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Fetch payment links error:', err);
      toast.error('Unable to load payment records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // Check payment status manually
  const handleCheckStatus = async (txnId: string) => {
    setVerifyingTxnId(txnId);
    try {
      const res = await fetch(`/api/payments/verify?txnId=${encodeURIComponent(txnId)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Status verification failed');
      }

      if (data.status === 'PAID') {
        toast.success(`Payment verified! Received ₹${data.amount || ''} via ${data.paymentMode || 'UPI'}`);
      } else if (data.status === 'PENDING') {
        toast.info('Payment is still pending on UPI / BestPay.');
      } else {
        toast.error(`Payment marked as ${data.status || 'FAILED'}`);
      }

      fetchLinks(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to verify status';
      toast.error(msg);
    } finally {
      setVerifyingTxnId(null);
    }
  };

  // Generate customer payment URL (live Razorpay Payment Link or checkout page)
  const getPayUrl = (item: PaymentLinkItem) => {
    if (item.status !== 'PARTIAL' && item.razorpay_payment_link_url) {
      return item.razorpay_payment_link_url;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const payableAmount =
      item.status === 'PARTIAL' && item.remaining_amount !== undefined
        ? item.remaining_amount
        : item.amount;
    const params = new URLSearchParams({
      order: item.order_id,
      name: item.customer_name || 'Customer',
      phone: item.customer_phone || '',
      item: item.part_details || 'Auto Parts Order',
      amount: payableAmount.toString(),
    });
    return `${origin}/pay?${params.toString()}`;
  };

  // Handle manual status change (PENDING / PAID / PARTIAL / FAILED)
  const handleStatusChange = async (item: PaymentLinkItem, newStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED') => {
    if (item.status === newStatus) return;
    const oldStatus = item.status;
    setUpdatingStatusTxnId(item.merchant_transaction_id);

    // Optimistic UI update
    setLinks((prev) =>
      prev.map((l) =>
        l.merchant_transaction_id === item.merchant_transaction_id
          ? {
              ...l,
              status: newStatus,
              paid_at: newStatus === 'PAID' ? new Date().toISOString() : l.paid_at,
            }
          : l
      )
    );

    try {
      const res = await fetch('/api/payments/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_transaction_id: item.merchant_transaction_id,
          status: newStatus,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update payment status');
      }

      if (data.metrics) {
        setMetrics(data.metrics);
      }

      toast.success(`Order #${item.order_id} marked as ${newStatus}!`);
    } catch (err) {
      // Rollback on error
      setLinks((prev) =>
        prev.map((l) =>
          l.merchant_transaction_id === item.merchant_transaction_id
            ? { ...l, status: oldStatus }
            : l
        )
      );
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(msg);
    } finally {
      setUpdatingStatusTxnId(null);
    }
  };

  // Copy payment URL
  const handleCopyLink = async (item: PaymentLinkItem) => {
    const payUrl = getPayUrl(item);
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopiedTxnId(item.merchant_transaction_id);
      toast.success('Payment link copied to clipboard!');
      setTimeout(() => setCopiedTxnId(null), 2500);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateString;
    }
  };

  const cleanPartDetails = (details?: string) => {
    if (!details) return 'Motorcycle Spare Parts Order';
    return stripPartialMetadataTag(details)
      .replace(/Monthly\s+Khata\s+Ledger\s+Clearance/gi, 'Monthly Partner Ledger Clearance')
      .replace(/Khata\s+Statement/gi, 'Partner Ledger Statement')
      .replace(/Mechanic\s+Khata/gi, 'Partner Ledger')
      .replace(/Khata/gi, 'Partner Ledger');
  };

  // Client-side quick filter safety check & IST date filtering
  const filteredLinks = useMemo(() => {
    return links.filter((item) => {
      if (activeTab === 'RAZORPAY' && !isRazorpayOnlinePayment(item)) return false;
      if (activeTab === 'PAID' && item.status !== 'PAID') return false;
      if (activeTab === 'PENDING' && item.status !== 'PENDING' && item.status !== 'PARTIAL') return false;
      if (activeTab === 'FAILED' && item.status !== 'FAILED') return false;
      if (activeTab === 'MECHANIC' && item.contact_category !== 'Mechanic') return false;
      if (activeTab === 'CUSTOMER' && item.contact_category !== 'Customer') return false;

      // Filter by IST Date (YYYY-MM-DD)
      if (selectedDate) {
        const itemDateStr = getIstDateString(item.paid_at || item.created_at);
        if (itemDateStr !== selectedDate) return false;
      }

      return true;
    });
  }, [links, activeTab, selectedDate]);

  // Local Razorpay totals across all loaded links (fallback or complementary to server metrics)
  const razorpayStats = useMemo(() => {
    let count = 0;
    let collected = 0;
    for (const item of links) {
      if (isRazorpayOnlinePayment(item)) {
        collected += item.paid_amount || item.amount || 0;
        count++;
      }
    }
    return { count, collected };
  }, [links]);

  // Dynamically compute the filtered date's collected total
  const dateFilteredStats = useMemo(() => {
    if (!selectedDate) {
      return { total: 0, count: 0 };
    }
    let total = 0;
    let count = 0;
    for (const item of filteredLinks) {
      if (item.status === 'PAID') {
        total += item.paid_amount || item.amount || 0;
        count++;
      }
    }
    return { total, count };
  }, [filteredLinks, selectedDate]);

  const handleSelectAllDates = () => {
    setSelectedDate('');
    setQuickDateFilter('ALL');
  };

  const handleSelectToday = () => {
    const today = getTodayIstDateString();
    setSelectedDate(today);
    setQuickDateFilter('TODAY');
  };

  const handleSelectYesterday = () => {
    const yesterday = getYesterdayIstDateString();
    setSelectedDate(yesterday);
    setQuickDateFilter('YESTERDAY');
  };

  const handleCustomDateChange = (dateVal: string) => {
    setSelectedDate(dateVal);
    if (!dateVal) {
      setQuickDateFilter('ALL');
    } else if (dateVal === getTodayIstDateString()) {
      setQuickDateFilter('TODAY');
    } else if (dateVal === getYesterdayIstDateString()) {
      setQuickDateFilter('YESTERDAY');
    } else {
      setQuickDateFilter('CUSTOM');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const targetId = deletingItem.id || deletingItem.merchant_transaction_id || deletingItem.order_id;
    setIsDeleting(true);

    // Optimistic UI update
    setLinks((prev) =>
      prev.filter((l) => l.merchant_transaction_id !== deletingItem.merchant_transaction_id)
    );

    try {
      const res = await fetch(`/api/payments/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete payment entry');
      }
      toast.success(`Payment entry #${deletingItem.order_id} deleted from BestPay Ledger`);
      fetchLinks(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting payment entry';
      toast.error(msg);
      fetchLinks(true); // Rollback from server
    } finally {
      setIsDeleting(false);
      setDeletingItem(null);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              BestPay Collections & Customer Ledger
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              UPI • QR • CASH
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage customer and mechanic UPI, QR code, and cash collections with real-time ledger sync and instant receipts (Bikri).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLinks(true)}
            disabled={loading || refreshing}
            className="h-9"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-9 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            BestPay Instant Checkout
          </Button>
        </div>
      </div>

      {/* KPI Cards — Customer & Mechanic Collections + Razorpay Online */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Collected */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Collected
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl">
              {loading && !links.length ? (
                <div className="h-7 w-24 bg-muted/60 rounded animate-pulse" />
              ) : (
                formatCurrency(metrics.totalCollected)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.paidCount} successful {metrics.paidCount === 1 ? 'payment' : 'payments'}
            </p>
          </CardContent>
        </Card>

        {/* Dedicated Clickable Razorpay Online KPI Card */}
        <Card
          onClick={() => setActiveTab((prev) => (prev === 'RAZORPAY' ? 'ALL' : 'RAZORPAY'))}
          className={cn(
            "border-indigo-500/30 bg-card hover:border-indigo-500/60 hover:shadow-sm cursor-pointer transition-all relative overflow-hidden select-none",
            activeTab === 'RAZORPAY' && "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-500/10 dark:bg-indigo-950/30 shadow-md"
          )}
          title="Click to filter ledger by Razorpay Online payments"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
              <span>Razorpay Online</span>
              {activeTab === 'RAZORPAY' && (
                <Badge className="bg-indigo-600 text-white text-[9px] px-1 py-0 font-bold uppercase">
                  Filtered
                </Badge>
              )}
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl font-mono">
              {loading && !links.length ? (
                <div className="h-7 w-24 bg-muted/60 rounded animate-pulse" />
              ) : (
                formatCurrency(metrics.razorpayCollected ?? razorpayStats.collected)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {(metrics.razorpayCount !== undefined ? metrics.razorpayCount : razorpayStats.count)} online{' '}
                {(metrics.razorpayCount === 1 || razorpayStats.count === 1) ? 'payment' : 'payments'}
              </span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                {activeTab === 'RAZORPAY' ? 'Reset ✕' : 'Filter →'}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Pending Amount */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending Amount (Udhaar)
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl">
              {loading && !links.length ? (
                <div className="h-7 w-24 bg-muted/60 rounded animate-pulse" />
              ) : (
                formatCurrency(metrics.pendingAmount)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.pendingCount} awaiting customer / partner settlement
            </p>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl">
              {loading && !links.length ? (
                <div className="h-7 w-16 bg-muted/60 rounded animate-pulse" />
              ) : metrics.totalCount > 0 ? (
                `${Math.round((metrics.paidCount / metrics.totalCount) * 100)}%`
              ) : (
                '100%'
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.paidCount} of {metrics.totalCount} completed
            </p>
          </CardContent>
        </Card>

        {/* Total Collections Active */}
        <Card className="border-border bg-card col-span-2 sm:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Customer Orders
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl">
              {loading && !links.length ? (
                <div className="h-7 w-16 bg-muted/60 rounded animate-pulse" />
              ) : (
                metrics.totalCount
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Active collection records
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs, Search Bar, and Date Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as PaymentFilterTab)}
            className="w-full sm:w-auto"
          >
            <TabsList className="bg-muted flex-wrap h-auto p-1">
              <TabsTrigger value="ALL" className="text-xs">
                All ({metrics.totalCount})
              </TabsTrigger>
              <TabsTrigger
                value="RAZORPAY"
                className={cn(
                  "text-xs gap-1 transition-colors",
                  activeTab === 'RAZORPAY' && "bg-indigo-600 text-white font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
                )}
              >
                <CreditCard className="size-3 text-indigo-500" />
                Razorpay Online ({metrics.razorpayCount !== undefined ? metrics.razorpayCount : razorpayStats.count})
              </TabsTrigger>
              <TabsTrigger value="PAID" className="text-xs gap-1">
                <CheckCircle2 className="size-3 text-emerald-500" />
                Paid ({metrics.paidCount})
              </TabsTrigger>
              <TabsTrigger value="PENDING" className="text-xs gap-1">
                <Clock className="size-3 text-amber-500" />
                Pending / Udhaar ({metrics.pendingCount})
              </TabsTrigger>
              <TabsTrigger value="MECHANIC" className="text-xs gap-1">
                <Wrench className="size-3 text-amber-500" />
                Mechanic ({metrics.mechanicCount !== undefined ? metrics.mechanicCount : links.filter(l => l.contact_category === 'Mechanic').length})
              </TabsTrigger>
              <TabsTrigger value="CUSTOMER" className="text-xs gap-1">
                <User className="size-3 text-emerald-500" />
                Customer ({metrics.customerCount !== undefined ? metrics.customerCount : links.filter(l => l.contact_category === 'Customer').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, phone, order, code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* Date Filter Bar ("View Entries by Any Date") */}
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-border bg-card text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium mr-1">
            <Calendar className="size-3.5 text-primary" />
            <span className="text-xs text-foreground font-semibold">View Date:</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={quickDateFilter === 'ALL' ? 'default' : 'outline'}
              size="sm"
              onClick={handleSelectAllDates}
              className={cn(
                "h-7 px-2.5 text-xs rounded-md",
                quickDateFilter === 'ALL' && "bg-primary text-primary-foreground font-semibold"
              )}
            >
              All Dates
            </Button>

            <Button
              type="button"
              variant={quickDateFilter === 'TODAY' ? 'default' : 'outline'}
              size="sm"
              onClick={handleSelectToday}
              className={cn(
                "h-7 px-2.5 text-xs rounded-md",
                quickDateFilter === 'TODAY' && "bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
              )}
            >
              Today
            </Button>

            <Button
              type="button"
              variant={quickDateFilter === 'YESTERDAY' ? 'default' : 'outline'}
              size="sm"
              onClick={handleSelectYesterday}
              className={cn(
                "h-7 px-2.5 text-xs rounded-md",
                quickDateFilter === 'YESTERDAY' && "bg-indigo-600 text-white hover:bg-indigo-700 font-semibold"
              )}
            >
              Yesterday
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              aria-label="Select date in IST"
              className="h-7 w-36 text-xs px-2 py-0.5 bg-background border-border font-mono cursor-pointer"
            />

            {selectedDate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAllDates}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                title="Clear date filter"
              >
                <X className="size-3" />
                <span>Clear Date</span>
              </Button>
            )}
          </div>

          {/* Dynamic IST Date Collection Total Banner */}
          {selectedDate && (
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-medium text-xs">
              <CheckCircle2 className="size-3.5" />
              <span>
                <strong>{formatIstDisplayDate(selectedDate)}</strong> Collected:{' '}
                <strong className="font-mono text-sm">{formatCurrency(dateFilteredStats.total)}</strong>{' '}
                ({dateFilteredStats.count} {dateFilteredStats.count === 1 ? 'paid entry' : 'paid entries'})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-xs">Customer & Role</TableHead>
              <TableHead className="font-semibold text-xs">Order / Part Details</TableHead>
              <TableHead className="font-semibold text-xs">Amount</TableHead>
              <TableHead className="font-semibold text-xs">Status</TableHead>
              <TableHead className="font-semibold text-xs">Payment Details</TableHead>
              <TableHead className="font-semibold text-xs">Payment Date & Time (IST)</TableHead>
              <TableHead className="text-right font-semibold text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`skeleton-row-${idx}`} className="border-b border-border animate-pulse">
                  <TableCell>
                    <div className="h-4 bg-muted/60 rounded w-28 mb-1" />
                    <div className="h-3 bg-muted/40 rounded w-20" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-muted/60 rounded w-36 mb-1" />
                    <div className="h-3 bg-muted/40 rounded w-24" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-muted/60 rounded w-16" />
                  </TableCell>
                  <TableCell>
                    <div className="h-6 bg-muted/50 rounded-full w-20" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-muted/60 rounded w-20 mb-1" />
                    <div className="h-3 bg-muted/40 rounded w-24" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-muted/50 rounded w-24" />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="h-8 bg-muted/50 rounded-md w-24 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredLinks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CreditCard className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                      {search ? 'No collection records match your search' : 'No payment records found'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {search
                        ? 'Try clearing your search query or selecting another filter pill.'
                        : 'Create a payment link from the Inbox or BestPay Instant Checkout to get started.'}
                    </p>
                    {!search && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreateOpen(true)}
                        className="mt-2 text-xs"
                      >
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Create First Link
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredLinks.map((item) => (
                <TableRow key={item.merchant_transaction_id} className="border-b border-border hover:bg-muted/30">
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground text-xs sm:text-sm">
                          {item.customer_name || 'Customer'}
                        </span>
                        {item.contact_category === 'Mechanic' ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 px-1.5 py-0 font-medium"
                          >
                            <Wrench className="size-2.5" /> Mechanic
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 px-1.5 py-0 font-medium"
                          >
                            <User className="size-2.5" /> Customer
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {item.customer_phone}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col max-w-[220px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground truncate">
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-mono">
                          #{item.order_id}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground truncate" title={cleanPartDetails(item.part_details)}>
                        {cleanPartDetails(item.part_details)}
                      </span>
                      {item.delivery_status && item.delivery_status !== 'Confirmed' ? (
                        <div className="mt-1 flex items-center gap-1">
                          {item.delivery_status === 'Delivered' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 gap-1 font-medium">
                              <CheckCircle2 className="size-2.5" /> Delivered
                            </Badge>
                          ) : item.delivery_status === 'Out for Delivery (Local Rider)' ? (
                            <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0 gap-1 font-medium">
                              <Bike className="size-2.5" /> Out for Delivery
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 gap-1 font-medium">
                              <Package className="size-2.5" /> {item.delivery_status}
                            </Badge>
                          )}
                          {item.rider_name && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[90px]" title={`Rider: ${item.rider_name}`}>
                              • {item.rider_name}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      {item.status === 'PARTIAL' ? (
                        <>
                          <span className="font-semibold text-xs sm:text-sm text-foreground">
                            Total: {formatCurrency(item.amount)}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                              Paid: {formatCurrency(item.paid_amount || 0)}
                            </span>
                            <span className="text-muted-foreground/40 text-[10px]">•</span>
                            <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                              Due:{' '}
                              {formatCurrency(
                                item.remaining_amount !== undefined
                                  ? item.remaining_amount
                                  : Math.max(0, item.amount - (item.paid_amount || 0))
                              )}
                            </span>
                          </div>
                        </>
                      ) : (
                        <span
                          className={cn(
                            'font-semibold text-xs sm:text-sm',
                            item.status === 'PAID'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-foreground'
                          )}
                        >
                          {formatCurrency(item.amount)}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="relative inline-flex items-center">
                      <select
                        value={item.status}
                        disabled={updatingStatusTxnId === item.merchant_transaction_id}
                        onChange={(e) => {
                          const nextVal = e.target.value as 'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED';
                          if (nextVal === 'PARTIAL') {
                            setPayingRecord(item);
                          } else {
                            handleStatusChange(item, nextVal);
                          }
                        }}
                        className={cn(
                          'appearance-none text-xs font-semibold px-2.5 py-1 pr-6 rounded-md border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary disabled:opacity-50',
                          item.status === 'PAID' &&
                            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          item.status === 'PARTIAL' &&
                            'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          item.status === 'PENDING' &&
                            'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
                          item.status === 'FAILED' &&
                            'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30'
                        )}
                        aria-label={`Update payment status for order ${item.order_id}`}
                      >
                        <option value="PENDING" className="bg-background text-foreground">
                          ⏳ PENDING
                        </option>
                        <option value="PARTIAL" className="bg-background text-foreground">
                          ⚡ PARTIAL
                        </option>
                        <option value="PAID" className="bg-background text-foreground">
                          ✓ PAID
                        </option>
                        <option value="FAILED" className="bg-background text-foreground">
                          ✕ FAILED
                        </option>
                      </select>
                      {updatingStatusTxnId === item.merchant_transaction_id ? (
                        <Loader2 className="pointer-events-none absolute right-2 h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (
                        <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">
                          ▼
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col text-xs">
                      {item.status === 'PAID' ? (
                        <>
                          <span className="font-medium text-foreground">
                            {item.payment_mode
                              ? item.payment_mode.toLowerCase() === 'cash'
                                ? 'Cash'
                                : 'UPI / QR'
                              : 'UPI / QR'}
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px]" title={item.razorpay_payment_id || item.phonepe_transaction_id}>
                            Ref: {item.razorpay_payment_id || item.phonepe_transaction_id || 'VERIFIED'}
                          </span>
                        </>
                      ) : item.status === 'PARTIAL' ? (
                        <>
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            Paid: {formatCurrency(item.paid_amount || 0)}
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            Awaiting Balance
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Awaiting Payment</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {formatDate(item.paid_at || item.created_at)}
                      </span>
                      {item.paid_at && item.paid_at !== item.created_at && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Created: {formatDate(item.created_at)}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-right whitespace-nowrap py-2.5 px-3">
                    <div className="flex items-center justify-end gap-1 shrink-0">
                      {/* Prominent Record Payment button for every non-PAID customer or mechanic order */}
                      {item.status !== 'PAID' && (
                        <Button
                          size="sm"
                          onClick={() => setPayingRecord(item)}
                          className="h-8 px-2 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-xs cursor-pointer shrink-0"
                          title="Record Customer or Mechanic Payment (Full or Partial)"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Record</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedReceipt(item)}
                        className="h-8 px-2 text-xs gap-1 border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
                        title="View & Send Digital Receipt / Cash Memo"
                      >
                        <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="hidden sm:inline">Receipt</span>
                      </Button>

                      {/* Local Rider Delivery Assignment Action */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedDeliveryOrder(item)}
                        className={cn(
                          "h-8 px-2 text-xs gap-1 border-border text-foreground hover:bg-muted cursor-pointer shrink-0",
                          item.delivery_status === 'Out for Delivery (Local Rider)' && "border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
                          item.delivery_status === 'Delivered' && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                        )}
                        title="Assign Local Rider & Update Delivery Status"
                      >
                        <Bike className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span className="hidden sm:inline">Delivery</span>
                      </Button>

                      {/* Delete Payment Entry Action */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingItem(item)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer shrink-0"
                        title="Delete payment entry from BestPay Ledger"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500 hover:text-rose-600" />
                      </Button>

                      {/* For PENDING & PARTIAL rows: Show Send Payment Link via WhatsApp & Check Status */}
                      {item.status !== 'PAID' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const remaining =
                                item.remaining_amount !== undefined
                                  ? item.remaining_amount
                                  : Math.max(0, item.amount - (item.paid_amount || 0));
                              const payUrl = getPayUrl(item);
                              const msg =
                                item.status === 'PARTIAL'
                                  ? `⚡ *Payment Reminder / Balance Due — Best Auto Parts*\n\n• *Order ID:* #${item.order_id}\n• *Total Bill:* ${formatCurrency(item.amount)}\n• *Already Paid:* ${formatCurrency(item.paid_amount || 0)}\n• *Remaining Balance Due:* *${formatCurrency(remaining)}*\n\n👉 *Pay remaining balance securely via Razorpay:* ${payUrl}\n\n📍 Kailashpur, Saharanpur • +91 96347 22174`
                                  : `⚡ *Razorpay Payment Link — Best Auto Parts*\n\n• *Order ID:* #${item.order_id}\n• *Amount Due:* *${formatCurrency(item.amount)}*\n\n👉 *Pay securely here via Razorpay (UPI, GPay, Cards):* ${payUrl}\n\n📍 Kailashpur, Saharanpur • +91 96347 22174`;
                              const cleanDigits = item.customer_phone.replace(/[^0-9]/g, '');
                              const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(msg)}`;
                              window.open(waUrl, '_blank');
                            }}
                            className="h-8 px-2 text-xs gap-1 text-emerald-600 hover:text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/10 shrink-0"
                            title={item.status === 'PARTIAL' ? 'Send Remaining Balance Link via WhatsApp' : 'Send Payment Link via WhatsApp'}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">
                              {item.status === 'PARTIAL' ? 'Send Balance' : 'Send Link'}
                            </span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCheckStatus(item.merchant_transaction_id)}
                            disabled={verifyingTxnId === item.merchant_transaction_id}
                            className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 border-amber-500/30 hover:bg-amber-500/10 shrink-0"
                            title="Verify payment with gateway"
                          >
                            {verifyingTxnId === item.merchant_transaction_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyLink(item)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                            title={item.status === 'PARTIAL' ? 'Copy remaining balance link' : 'Copy payment link'}
                          >
                            {copiedTxnId === item.merchant_transaction_id ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(getPayUrl(item), '_blank')}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                        title={item.status === 'PAID' ? 'View Completed Receipt' : 'Open Pay Page'}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Payment Link Dialog */}
      <SendPaymentLinkDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSendPaymentMessage={() => {
          fetchLinks(true);
        }}
      />

      {/* Customer Digital Receipt Dialog */}
      <CustomerReceiptDialog
        open={Boolean(selectedReceipt)}
        onOpenChange={(v) => !v && setSelectedReceipt(null)}
        order={selectedReceipt}
      />

      {/* Record Customer / Mechanic Payment Dialog */}
      <RecordCustomerPaymentDialog
        open={Boolean(payingRecord)}
        onOpenChange={(v) => !v && setPayingRecord(null)}
        order={payingRecord}
        onSuccess={() => fetchLinks(true)}
      />

      {/* Local Rider Delivery Assignment Modal */}
      <LocalDeliveryDialog
        open={Boolean(selectedDeliveryOrder)}
        onOpenChange={(v) => !v && setSelectedDeliveryOrder(null)}
        order={selectedDeliveryOrder}
        onSuccess={(updated) => {
          setLinks((prev) =>
            prev.map((l) =>
              l.order_id === updated.orderId || l.merchant_transaction_id === updated.orderId
                ? {
                    ...l,
                    delivery_status: updated.deliveryStatus,
                    rider_name: updated.riderName,
                    rider_phone: updated.riderPhone,
                    delivery_notes: updated.deliveryNotes,
                  }
                : l
            )
          );
          fetchLinks(true);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deletingItem)} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-base font-bold">
              <Trash2 className="size-5" />
              Delete Payment Entry
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Delete this payment entry? This will remove the record from BestPay Ledger.
            </DialogDescription>
          </DialogHeader>
          {deletingItem && (
            <div className="bg-muted/40 p-3.5 rounded-lg border border-border text-xs space-y-1.5 font-sans">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Order ID:</span>
                <span className="font-mono font-bold text-foreground">#{deletingItem.order_id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium text-foreground">{deletingItem.customer_name || 'Customer'} ({deletingItem.customer_phone})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(deletingItem.amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">{deletingItem.status}</Badge>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingItem(null)} disabled={isDeleting} className="text-xs">
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmDelete} disabled={isDeleting} className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white">
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              <span>Confirm Delete</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
