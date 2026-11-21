'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Package,
  Wrench,
  Pencil,
  Trash2,
  SlidersHorizontal,
  MapPin,
  Tag,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Layers,
  History,
  Car,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VehicleFitmentSection } from '@/components/inventory/vehicle-fitment-section';
import { StockHistoryTable } from '@/components/inventory/stock-history-table';
import { StockAdjustmentModal } from '@/components/inventory/stock-adjustment-modal';
import { PartFormDialog } from '@/components/inventory/part-form-dialog';
import { PartDeleteDialog } from '@/components/inventory/part-delete-dialog';
import { formatCurrency, getStockStatus } from '@/lib/inventory/parts';
import { useAuth } from '@/hooks/use-auth';
import type {
  PartCatalogItem,
  VehicleFitment,
  StockMovement,
} from '@/types/inventory';

export default function PartDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partId = params?.id as string;

  const { accountRole } = useAuth();
  const canEdit =
    accountRole === 'owner' || accountRole === 'admin' || accountRole === 'agent';
  const canDelete = accountRole === 'owner' || accountRole === 'admin';

  const [part, setPart] = useState<PartCatalogItem | null>(null);
  const [fitments, setFitments] = useState<VehicleFitment[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const fetchPartData = useCallback(async () => {
    if (!partId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/inventory/parts/${partId}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Part not found');
          router.push('/inventory');
          return;
        }
        throw new Error('Failed to load part details');
      }
      const data = await res.json();
      setPart(data.part);
      setFitments(data.fitments || []);
      setMovements(data.movements || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching part';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [partId, router]);

  useEffect(() => {
    fetchPartData();
  }, [fetchPartData]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" />
          <span>Back to Inventory</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading part specifications...</p>
        </div>
      </div>
    );
  }

  if (!part) {
    return (
      <div className="flex-1 p-6 space-y-6">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Inventory
        </Link>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <AlertTriangle className="size-8 text-amber-500 mx-auto mb-2" />
          <h3 className="text-base font-semibold">Part Not Found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This part may have been removed or does not belong to your account.
          </p>
        </div>
      </div>
    );
  }

  const stockStatus = getStockStatus(part);
  const marginDollar = part.selling_price - part.cost_price;
  const marginPct =
    part.selling_price > 0 ? (marginDollar / part.selling_price) * 100 : 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Top breadcrumb & actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Inventory
        </Link>

        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdjustOpen(true)}
                className="gap-1.5"
              >
                <SlidersHorizontal className="size-3.5" />
                Adjust Stock
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(true)}
                className="gap-1.5"
              >
                <Pencil className="size-3.5" />
                Edit Part
              </Button>
            </>
          )}

          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge
                variant="outline"
                className="font-mono text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
              >
                SKU: {part.sku}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border-border bg-muted text-foreground"
              >
                {part.condition} Condition
              </Badge>
              {part.brand && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0.5 border-border bg-muted/60 text-muted-foreground"
                >
                  Brand: {part.brand}
                </Badge>
              )}
              {part.category && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0.5 border-border bg-muted/60 text-muted-foreground"
                >
                  {part.category}
                  {part.subcategory ? ` • ${part.subcategory}` : ''}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {part.part_name}
            </h1>

            {part.description && (
              <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
                {part.description}
              </p>
            )}
          </div>

          {/* Stock KPI summary card */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 min-w-[220px] text-center md:text-right space-y-2 shrink-0">
            <div className="flex items-center justify-center md:justify-end gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stockStatus.badgeClass}`}
              >
                {stockStatus.label}
              </span>
            </div>

            <div>
              <p className="text-3xl font-extrabold text-foreground">
                {part.quantity_in_stock}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  units
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Threshold: {part.low_stock_threshold} units
              </p>
            </div>

            {part.location && (
              <div className="flex items-center justify-center md:justify-end gap-1 text-xs text-muted-foreground pt-1 border-t border-border/60">
                <MapPin className="size-3 text-primary" />
                <span>Bin / Location: {part.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* OEM Numbers & Pricing Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
          {/* OEM Number Info */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Primary OEM Part Number
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-foreground">
                {part.oem_number || 'N/A'}
              </span>
              {part.oem_number && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(part.oem_number!, 'OEM Number')}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="Copy OEM Number"
                >
                  <Copy className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Alternate OEMs */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Alternate / Superseded OEMs
            </span>
            {part.alternate_oem_numbers && part.alternate_oem_numbers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {part.alternate_oem_numbers.map((alt, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="font-mono text-[11px] px-1.5 py-0 bg-muted/40"
                  >
                    {alt}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">None registered</p>
            )}
          </div>

          {/* Pricing & Profit Margin */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Pricing & Margin
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground">
                {formatCurrency(part.selling_price)}
              </span>
              <span className="text-xs text-muted-foreground">
                Cost: {formatCurrency(part.cost_price)}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-semibold"
              >
                +{marginPct.toFixed(1)}% margin
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs / Sections: Vehicle Fitment Compatibility */}
      <div className="space-y-4">
        <VehicleFitmentSection
          partId={part.id}
          fitments={fitments}
          onRefresh={fetchPartData}
          canEdit={canEdit}
        />
      </div>

      {/* Stock Movement History Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="size-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">
            Stock Movement Audit Trail ({movements.length})
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Immutable history of all inventory received, sold, scrapped, and audited.
        </p>

        <StockHistoryTable movements={movements} />
      </div>

      {/* Modals */}
      <PartFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        initialData={part}
        onSuccess={fetchPartData}
      />

      <StockAdjustmentModal
        open={isAdjustOpen}
        onOpenChange={setIsAdjustOpen}
        part={part}
        onSuccess={fetchPartData}
      />

      <PartDeleteDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        part={part}
        onSuccess={() => {
          router.push('/inventory');
        }}
      />
    </div>
  );
}
