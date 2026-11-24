'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { SendPaymentLinkDialog } from '@/components/inbox/send-payment-link-dialog';
import { CustomerReceiptDialog } from '@/components/payments/customer-receipt-dialog';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface PaymentLinkItem {
  id?: string;
  order_id: string;
  merchant_transaction_id: string;
  customer_name?: string;
  customer_phone: string;
  part_details: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  phonepe_redirect_url?: string;
  phonepe_transaction_id?: string;
  payment_mode?: string;
  paid_at?: string;
  created_at: string;
}

interface PaymentMetrics {
  totalCollected: number;
  pendingAmount: number;
  paidCount: number;
  pendingCount: number;
  totalCount: number;
}

export default function PaymentsPage() {
  const [links, setLinks] = useState<PaymentLinkItem[]>([]);
  const [metrics, setMetrics] = useState<PaymentMetrics>({
    totalCollected: 0,
    pendingAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    totalCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PAID' | 'PENDING' | 'FAILED'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [verifyingTxnId, setVerifyingTxnId] = useState<string | null>(null);
  const [updatingStatusTxnId, setUpdatingStatusTxnId] = useState<string | null>(null);
  const [copiedTxnId, setCopiedTxnId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentLinkItem | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch payment links & metrics
  const fetchLinks = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const params = new URLSearchParams();
      if (activeTab !== 'ALL') params.set('status', activeTab);
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
        toast.info('Payment is still pending on PhonePe.');
      } else {
        toast.error(`Payment marked as ${data.status || 'FAILED'}`);
      }

      // Refresh list to update UI
      fetchLinks(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to verify status';
      toast.error(msg);
    } finally {
      setVerifyingTxnId(null);
    }
  };

  // Generate customer payment URL
  const getPayUrl = (item: PaymentLinkItem) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      order: item.order_id,
      name: item.customer_name || 'Customer',
      phone: item.customer_phone || '',
      item: item.part_details || 'Auto Parts Order',
      amount: item.amount.toString(),
    });
    return `${origin}/pay?${params.toString()}`;
  };

  // Handle manual status change (PENDING / PAID / FAILED)
  const handleStatusChange = async (item: PaymentLinkItem, newStatus: 'PENDING' | 'PAID' | 'FAILED') => {
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
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              PhonePe Payments & Ledger
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              UPI & PG V1
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate short payment links for WhatsApp, track real-time UPI collections, and verify transactions.
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
            Create Payment Link
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              {formatCurrency(metrics.totalCollected)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.paidCount} successful {metrics.paidCount === 1 ? 'payment' : 'payments'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending Amount
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl">
              {formatCurrency(metrics.pendingAmount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.pendingCount} awaiting customer payment
            </p>
          </CardContent>
        </Card>

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
              {metrics.totalCount > 0
                ? `${Math.round((metrics.paidCount / metrics.totalCount) * 100)}%`
                : '100%'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.paidCount} of {metrics.totalCount} completed
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Links Created
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground sm:text-2xl">
              {metrics.totalCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Active ledger entries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'ALL' | 'PAID' | 'PENDING' | 'FAILED')}
          className="w-full sm:w-auto"
        >
          <TabsList className="bg-muted">
            <TabsTrigger value="ALL">All ({metrics.totalCount})</TabsTrigger>
            <TabsTrigger value="PAID">Paid ({metrics.paidCount})</TabsTrigger>
            <TabsTrigger value="PENDING">Pending ({metrics.pendingCount})</TabsTrigger>
            <TabsTrigger value="FAILED">Failed</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer, phone, order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">Customer & Contact</TableHead>
              <TableHead className="font-semibold">Order / Item</TableHead>
              <TableHead className="font-semibold">Amount</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Payment Details</TableHead>
              <TableHead className="font-semibold">Created Date</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Loading payment records...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CreditCard className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No payment links found</p>
                    <p className="text-xs text-muted-foreground">
                      {search ? 'Try clearing your search query.' : 'Create a payment link to get started.'}
                    </p>
                    {!search && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreateOpen(true)}
                        className="mt-2"
                      >
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Create First Link
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              links.map((item) => (
                <TableRow key={item.merchant_transaction_id} className="border-b border-border hover:bg-muted/30">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {item.customer_name || 'Customer'}
                      </span>
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
                      <span className="text-xs text-muted-foreground truncate" title={item.part_details}>
                        {item.part_details}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.amount)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="relative inline-flex items-center">
                      <select
                        value={item.status}
                        disabled={updatingStatusTxnId === item.merchant_transaction_id}
                        onChange={(e) =>
                          handleStatusChange(
                            item,
                            e.target.value as 'PENDING' | 'PAID' | 'FAILED'
                          )
                        }
                        className={cn(
                          'appearance-none text-xs font-semibold px-2.5 py-1 pr-6 rounded-md border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary disabled:opacity-50',
                          item.status === 'PAID' &&
                            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          item.status === 'PENDING' &&
                            'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          item.status === 'FAILED' &&
                            'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30'
                        )}
                        aria-label={`Update payment status for order ${item.order_id}`}
                      >
                        <option value="PENDING" className="bg-background text-foreground">
                          ⏳ PENDING
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
                            {item.payment_mode || 'UPI'}
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px]" title={item.phonepe_transaction_id}>
                            Ref: {item.phonepe_transaction_id || 'VERIFIED'}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Awaiting Payment</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)}
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.status === 'PAID' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedReceipt(item)}
                          className="h-8 px-2.5 text-xs gap-1 border-border text-foreground hover:bg-muted"
                          title="View / Print Digital Receipt"
                        >
                          <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Receipt</span>
                        </Button>
                      )}

                      {item.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheckStatus(item.merchant_transaction_id)}
                          disabled={verifyingTxnId === item.merchant_transaction_id}
                          className="h-8 px-2.5 text-xs text-amber-600 hover:text-amber-700 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          {verifyingTxnId === item.merchant_transaction_id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                          )}
                          Check Status
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyLink(item)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Copy payment link"
                      >
                        {copiedTxnId === item.merchant_transaction_id ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(getPayUrl(item), '_blank')}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Open Pay Page"
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
    </div>
  );
}
