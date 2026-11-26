'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Package,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Clock,
  Sparkles,
  Info,
  Loader2,
} from 'lucide-react';

interface WhatsAppCatalogSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface CatalogSyncStatus {
  feedUrl: string;
  catalogId: string | null;
  totalProducts: number;
  inStockCount: number;
  outOfStockCount: number;
  directSyncEnabled: boolean;
  store: string;
  phone: string;
  location: string;
}

export function WhatsAppCatalogSyncDialog({
  open,
  onOpenChange,
  onSuccess,
}: WhatsAppCatalogSyncDialogProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<CatalogSyncStatus | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    syncedDirectly: boolean;
    message: string;
    timestamp: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/catalog/sync');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open, fetchStatus]);

  const handleCopyUrl = async () => {
    const url = status?.feedUrl || 'https://best-auto-parts-one.vercel.app/api/catalog/feed.csv';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Meta Catalog Feed URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      const res = await fetch('/api/catalog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setLastSyncResult({
          syncedDirectly: Boolean(data.syncedDirectly),
          message: data.message || 'Catalog synchronized successfully',
          timestamp: new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        });

        toast.success(
          data.syncedDirectly
            ? `Pushed ${data.totalProducts} products directly to Meta WhatsApp Catalog!`
            : 'Catalog Feed refreshed & verified for Meta Commerce Manager!'
        );

        if (onSuccess) onSuccess();
        fetchStatus();
      } else {
        throw new Error(data.error || data.message || 'Sync failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error syncing catalog';
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const feedUrl = status?.feedUrl || 'https://best-auto-parts-one.vercel.app/api/catalog/feed.csv';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl bg-background border-border">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShoppingBag className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                WhatsApp & Meta Commerce Catalog Synchronization
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Best Auto Parts • Kailashpur, Saharanpur, UP 247001 (+91 96347 22174)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Live Catalog Metric Badges */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Catalog Parts</span>
                <Package className="size-3.5 text-primary" />
              </div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                {loading ? <Loader2 className="size-5 animate-spin" /> : status?.totalProducts ?? '...'}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Active inventory items</p>
            </div>

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-sm">
              <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                <span>In Stock (Ready to Sell)</span>
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {loading ? <Loader2 className="size-5 animate-spin" /> : status?.inStockCount ?? '...'}
              </div>
              <p className="mt-0.5 text-[10px] text-emerald-600/80">Available in WhatsApp store</p>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 shadow-sm">
              <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 font-medium">
                <span>Out of Stock</span>
                <AlertCircle className="size-3.5 text-amber-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
                {loading ? <Loader2 className="size-5 animate-spin" /> : status?.outOfStockCount ?? '...'}
              </div>
              <p className="mt-0.5 text-[10px] text-amber-600/80">Auto-flagged &quot;out of stock&quot;</p>
            </div>
          </div>

          {/* Sync Status Banner */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {status?.directSyncEnabled
                    ? `Direct Meta Graph API Connected (Catalog #${status.catalogId})`
                    : 'Scheduled Meta Commerce Data Feed Active'}
                </span>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live 2-Way Sync
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Inventory stock deductions on customer sales, purchase order inward restocks, and part edits automatically update your WhatsApp Catalog.
            </p>
          </div>

          {/* Meta Commerce Feed URL Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <span>Meta Commerce Manager Data Feed URL</span>
                <span className="text-[10px] text-muted-foreground font-normal">(Auto-updating CSV)</span>
              </label>
              <a
                href={feedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>View Raw CSV</span>
                <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  value={feedUrl}
                  className="w-full text-xs font-mono bg-muted/60 border border-input rounded-md px-3 py-2 text-foreground focus:outline-none select-all"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyUrl}
                className="gap-1.5 shrink-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy Feed URL'}
              </Button>
            </div>
          </div>

          {/* Setup Instructions for Meta Commerce Manager */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Info className="size-3.5 text-blue-500" />
              <span>How to connect this Feed in Meta Commerce Manager:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[11px] leading-relaxed pl-1">
              <li>
                Open{' '}
                <a
                  href="https://business.facebook.com/commerce"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline inline-flex items-center gap-0.5"
                >
                  business.facebook.com/commerce <ExternalLink className="size-2.5" />
                </a>{' '}
                and select your Best Auto Parts Catalog.
              </li>
              <li>
                Navigate to <strong>Data Sources</strong> → Click <strong>Add Products</strong> → Select <strong>Use Data Feed</strong>.
              </li>
              <li>
                Choose <strong>Set a schedule</strong> (select <em>Hourly</em> for fastest sync) and paste the Feed URL copied above.
              </li>
              <li>
                Click <strong>Save & Upload</strong>. Meta Commerce will automatically sync all 72+ parts with photos, prices, and live stock.
              </li>
            </ol>
          </div>

          {/* Last sync message if triggered */}
          {lastSyncResult && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <Sparkles className="size-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">{lastSyncResult.message}</p>
                <p className="text-[10px] text-emerald-600/80">
                  Last verified at {lastSyncResult.timestamp}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between border-t border-border pt-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" />
            <span>Real-time webhook sync on WhatsApp orders active</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSyncNow}
              disabled={syncing}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {syncing ? 'Syncing Catalog...' : '🔄 Sync Now'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
