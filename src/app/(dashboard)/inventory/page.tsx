'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Package,
  Plus,
  Upload,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Truck,
  ClipboardList,
  AlertTriangle,
  Loader2,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InventoryOverview } from '@/components/inventory/inventory-overview';
import { PartsFilters } from '@/components/inventory/parts-filters';
import { PartsTable } from '@/components/inventory/parts-table';
import { PartFormDialog } from '@/components/inventory/part-form-dialog';
import { StockAdjustmentModal } from '@/components/inventory/stock-adjustment-modal';
import { PartDeleteDialog } from '@/components/inventory/part-delete-dialog';
import { CsvImportModal } from '@/components/inventory/csv-import-modal';
import { SuppliersManagerDialog } from '@/components/inventory/suppliers-manager-dialog';
import { PoHistoryDialog } from '@/components/inventory/po-history-dialog';
import { PurchaseOrderDrawer } from '@/components/inventory/purchase-order-drawer';
import { useAuth } from '@/hooks/use-auth';
import type {
  InventoryFilterParams,
  InventoryMetrics,
  PartCatalogItem,
  PurchaseOrderItem,
} from '@/types/inventory';

const DEFAULT_METRICS: InventoryMetrics = {
  total_products: 0,
  total_stock_units: 0,
  low_stock_products: 0,
  out_of_stock_products: 0,
  total_cost_value: 0,
  total_selling_value: 0,
};

export default function InventoryPage() {
  const { accountRole } = useAuth();
  const canEdit = accountRole === 'owner' || accountRole === 'admin' || accountRole === 'agent';
  const canDelete = accountRole === 'owner' || accountRole === 'admin';

  // Metrics state
  const [metrics, setMetrics] = useState<InventoryMetrics>(DEFAULT_METRICS);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Parts list state
  const [parts, setParts] = useState<PartCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters state
  const [filters, setFilters] = useState<InventoryFilterParams>({
    search: '',
    category: '',
    brand: '',
    condition: 'all',
    stockStatus: 'all',
    vehicleManufacturer: '',
    vehicleModel: '',
    sortBy: 'updated_at',
    sortOrder: 'desc',
    page: 1,
    pageSize: 20,
  });

  // Modal dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<PartCatalogItem | null>(null);
  const [adjustingPart, setAdjustingPart] = useState<PartCatalogItem | null>(null);
  const [deletingPart, setDeletingPart] = useState<PartCatalogItem | null>(null);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);
  const hasAutoSynced = useRef(false);

  // Distributor and Purchase Order states
  const [isSuppliersManagerOpen, setIsSuppliersManagerOpen] = useState(false);
  const [isPoHistoryOpen, setIsPoHistoryOpen] = useState(false);
  const [selectedOrderItems, setSelectedOrderItems] = useState<Map<string, PurchaseOrderItem>>(
    new Map()
  );
  const [isSelectingShortStock, setIsSelectingShortStock] = useState(false);

  // Fetch KPI Metrics
  const fetchMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      const res = await fetch('/api/inventory/metrics');
      if (res.ok) {
        const data = await res.json();
        const metricsData = data.metrics || data;
        setMetrics(metricsData || DEFAULT_METRICS);
      }
    } catch {
      // keep default metrics
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // Fetch Parts
  const fetchParts = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();

      if (filters.search) queryParams.set('search', filters.search);
      if (filters.category) queryParams.set('category', filters.category);
      if (filters.brand) queryParams.set('brand', filters.brand);
      if (filters.condition && filters.condition !== 'all')
        queryParams.set('condition', filters.condition);
      if (filters.stockStatus && filters.stockStatus !== 'all')
        queryParams.set('stockStatus', filters.stockStatus);
      if (filters.vehicleManufacturer)
        queryParams.set('vehicleManufacturer', filters.vehicleManufacturer);
      if (filters.vehicleModel)
        queryParams.set('vehicleModel', filters.vehicleModel);
      if (filters.sortBy) queryParams.set('sortBy', filters.sortBy);
      if (filters.sortOrder) queryParams.set('sortOrder', filters.sortOrder);
      if (filters.page) queryParams.set('page', String(filters.page));
      if (filters.pageSize) queryParams.set('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/inventory/parts?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to load parts');
      }
      const data = await res.json();
      const partsList = data.parts || data.items || [];
      setParts(partsList);
      setTotalCount(data.total ?? partsList.length);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch inventory';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  // Handle manual photo sync
  const handleSyncPhotos = async () => {
    try {
      setIsSyncingPhotos(true);
      const res = await fetch('/api/inventory/parts/sync-photos', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `Successfully synced ${data.updated} part photos!`);
        fetchParts();
      } else {
        throw new Error(data.error || 'Failed to sync photos');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error syncing part photos';
      toast.error(msg);
    } finally {
      setIsSyncingPhotos(false);
    }
  };

  // Auto-sync photos if any loaded parts have missing images
  useEffect(() => {
    if (!loading && parts.length > 0 && !hasAutoSynced.current) {
      const hasMissingImages = parts.some((p) => !p.image_url);
      if (hasMissingImages) {
        hasAutoSynced.current = true;
        fetch('/api/inventory/parts/sync-photos', { method: 'POST' })
          .then((res) => res.json())
          .then((data) => {
            if (data?.updated > 0) {
              fetchParts();
            }
          })
          .catch(() => {});
      }
    }
  }, [loading, parts, fetchParts]);

  interface StockReceiveResult {
    updated_parts?: Array<{
      id: string;
      part_name: string;
      sku: string;
      prev_stock: number;
      new_stock: number;
      quantity_added: number;
      last_restocked_at: string;
      last_po_number: string;
    }>;
    total_stock_added?: number;
    metrics?: InventoryMetrics;
  }

  const handleRefreshAll = (receiveResult?: StockReceiveResult | unknown) => {
    // Instantly reflect received stock in local React state without waiting for network
    const result = receiveResult as StockReceiveResult | undefined;
    if (result?.updated_parts && Array.isArray(result.updated_parts)) {
      const updatedMap = new Map<string, (typeof result.updated_parts)[number]>(
        result.updated_parts.map((p) => [p.id, p])
      );
      setParts((prev) =>
        prev.map((part) => {
          const match = updatedMap.get(part.id);
          if (match) {
            return {
              ...part,
              quantity_in_stock: match.new_stock,
              last_restocked_at: match.last_restocked_at,
              last_po_number: match.last_po_number,
              last_restocked_quantity: match.quantity_added,
              pending_po: null,
            };
          }
          return part;
        })
      );
    }

    // Instantly update KPI cards (Total Stock Units, Inventory Cost, Potential Retail Value)
    if (result?.metrics) {
      setMetrics(result.metrics);
    } else if (result?.total_stock_added) {
      setMetrics((prev) => ({
        ...prev,
        total_stock_units: prev.total_stock_units + Number(result.total_stock_added),
      }));
    }

    // Fetch from server for full database sync parity
    fetchMetrics();
    fetchParts();
  };

  // Order item handlers
  const handleToggleOrderItem = (part: PartCatalogItem, quantity = 10) => {
    setSelectedOrderItems((prev) => {
      const next = new Map(prev);
      if (next.has(part.id)) {
        next.delete(part.id);
        toast.info(`Removed "${part.part_name}" from PO`);
      } else {
        const unitCost = Number(part.cost_price || 0);
        next.set(part.id, {
          part_id: part.id,
          part_name: part.part_name,
          sku: part.sku,
          oem_number: part.oem_number || undefined,
          brand: part.brand || undefined,
          quantity,
          cost_price: unitCost,
          unit_cost: unitCost,
          total_cost: quantity * unitCost,
        });
        toast.success(`Added "${part.part_name}" (${quantity} pcs) to PO`);
      }
      return next;
    });
  };

  const handleUpdateOrderQuantity = (partId: string, quantity: number) => {
    setSelectedOrderItems((prev) => {
      const next = new Map(prev);
      const existing = next.get(partId);
      if (!existing) return prev;

      if (quantity <= 0) {
        next.delete(partId);
      } else {
        const cost = existing.cost_price ?? existing.unit_cost ?? 0;
        next.set(partId, {
          ...existing,
          quantity,
          cost_price: cost,
          unit_cost: cost,
          total_cost: quantity * cost,
        });
      }
      return next;
    });
  };

  const handleRemoveOrderItem = (partId: string) => {
    setSelectedOrderItems((prev) => {
      const next = new Map(prev);
      next.delete(partId);
      return next;
    });
  };

  const handleClearAllOrderItems = () => {
    setSelectedOrderItems(new Map());
  };

  const handleSelectAllVisible = (visibleParts: PartCatalogItem[]) => {
    setSelectedOrderItems((prev) => {
      const next = new Map(prev);
      for (const part of visibleParts) {
        if (!next.has(part.id)) {
          const unitCost = Number(part.cost_price || 0);
          next.set(part.id, {
            part_id: part.id,
            part_name: part.part_name,
            sku: part.sku,
            oem_number: part.oem_number || undefined,
            brand: part.brand || undefined,
            quantity: 10,
            cost_price: unitCost,
            unit_cost: unitCost,
            total_cost: 10 * unitCost,
          });
        }
      }
      toast.success(`Selected all ${visibleParts.length} visible parts for restock order`);
      return next;
    });
  };

  const handleDeselectAllVisible = (visibleParts: PartCatalogItem[]) => {
    setSelectedOrderItems((prev) => {
      const next = new Map(prev);
      for (const part of visibleParts) {
        next.delete(part.id);
      }
      return next;
    });
  };

  // Smart Select Short Stock
  const handleSelectShortStock = async () => {
    try {
      setIsSelectingShortStock(true);
      const [resLow, resOut] = await Promise.all([
        fetch('/api/inventory/parts?stockStatus=low_stock&pageSize=100'),
        fetch('/api/inventory/parts?stockStatus=out_of_stock&pageSize=100'),
      ]);

      let combined: PartCatalogItem[] = [];
      if (resLow.ok) {
        const d = await resLow.json();
        combined = combined.concat(d.parts || d.items || []);
      }
      if (resOut.ok) {
        const d = await resOut.json();
        combined = combined.concat(d.parts || d.items || []);
      }

      // Also include current parts on the page that meet the short-stock threshold
      for (const p of parts) {
        if ((p.quantity_in_stock ?? 0) <= (p.low_stock_threshold ?? 5)) {
          if (!combined.some((c) => c.id === p.id)) {
            combined.push(p);
          }
        }
      }

      if (combined.length === 0) {
        toast.info('No low-stock or out-of-stock parts found in inventory');
        return;
      }

      setSelectedOrderItems((prev) => {
        const next = new Map(prev);
        let addedCount = 0;
        for (const part of combined) {
          if (!next.has(part.id)) {
            const unitCost = Number(part.cost_price || 0);
            const deficit = (part.low_stock_threshold ?? 5) * 2 - (part.quantity_in_stock ?? 0);
            const defaultQty = Math.max(10, deficit);
            next.set(part.id, {
              part_id: part.id,
              part_name: part.part_name,
              sku: part.sku,
              oem_number: part.oem_number || undefined,
              brand: part.brand || undefined,
              quantity: defaultQty,
              cost_price: unitCost,
              unit_cost: unitCost,
              total_cost: defaultQty * unitCost,
            });
            addedCount++;
          }
        }
        toast.success(`Added ${addedCount} short-stock items to order (${next.size} total in order)`);
        return next;
      });
    } catch {
      toast.error('Failed to select short stock parts');
    } finally {
      setIsSelectingShortStock(false);
    }
  };

  // Immediate in-place update handler for quick edits
  const handlePartUpdated = (updatedPart: PartCatalogItem) => {
    setParts((prev) =>
      prev.map((p) => (p.id === updatedPart.id ? { ...p, ...updatedPart } : p))
    );
    fetchMetrics();
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.category) queryParams.set('category', filters.category);
      if (filters.condition && filters.condition !== 'all')
        queryParams.set('condition', filters.condition);
      if (filters.stockStatus && filters.stockStatus !== 'all')
        queryParams.set('stockStatus', filters.stockStatus);

      const url = `/api/inventory/csv/export?${queryParams.toString()}`;
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `parts_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Inventory CSV export initiated');
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const currentPage = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex-1 space-y-6 p-6 pb-24">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Package className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Auto Parts Inventory
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            OEM catalog, warehouse locations, stock thresholds, and distributor restock purchase orders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Smart Select Short Stock Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectShortStock}
            disabled={isSelectingShortStock}
            className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60"
            title="Auto-select all low stock and out-of-stock parts for restock PO"
          >
            {isSelectingShortStock ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="size-3.5" />
            )}
            Select Short Stock
          </Button>

          {/* Distributors Directory Modal Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSuppliersManagerOpen(true)}
            className="gap-1.5 border-border hover:border-foreground/20"
            title="Manage distributors and wholesalers directory"
          >
            <Truck className="size-3.5 text-blue-500" />
            Distributors
          </Button>

          {/* PO History Modal Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPoHistoryOpen(true)}
            className="gap-1.5 border-border hover:border-foreground/20"
            title="View Purchase Order history and receive stock"
          >
            <ClipboardList className="size-3.5 text-purple-500" />
            PO History
          </Button>

          {/* Sync Photos Utility */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncPhotos}
            disabled={isSyncingPhotos}
            className="gap-1.5 border-teal-500/40 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 hover:border-teal-500/60"
            title="Sync & backfill high-contrast product photos for all catalog parts"
          >
            {isSyncingPhotos ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImageIcon className="size-3.5" />
            )}
            Sync Photos
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            className="gap-1.5"
            title="Refresh inventory and KPIs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={exporting}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>

          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCsvImportOpen(true)}
                className="gap-1.5"
              >
                <Upload className="size-3.5" />
                Import CSV
              </Button>

              <Button
                size="sm"
                onClick={() => setIsAddOpen(true)}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Add Part
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <InventoryOverview
        metrics={metrics}
        loading={metricsLoading}
        activeStatusFilter={filters.stockStatus}
        onStatusClick={(status) => {
          setFilters((prev) => ({
            ...prev,
            stockStatus: status,
            page: 1,
          }));
        }}
      />

      {/* Advanced Filter and Search Bar */}
      <PartsFilters
        filters={filters}
        onChange={(next) => setFilters(next)}
        onReset={() =>
          setFilters({
            search: '',
            category: '',
            brand: '',
            condition: 'all',
            stockStatus: 'all',
            vehicleManufacturer: '',
            vehicleModel: '',
            sortBy: 'updated_at',
            sortOrder: 'desc',
            page: 1,
            pageSize: 20,
          })
        }
      />

      {/* Parts Table */}
      <div className="space-y-4">
        <PartsTable
          parts={parts}
          loading={loading}
          onEdit={(part) => setEditingPart(part)}
          onDelete={(part) => setDeletingPart(part)}
          onAdjustStock={(part) => setAdjustingPart(part)}
          canEdit={canEdit}
          canDelete={canDelete}
          selectedOrderItems={selectedOrderItems}
          onToggleOrderItem={handleToggleOrderItem}
          onUpdateOrderQuantity={handleUpdateOrderQuantity}
          onSelectAllVisible={handleSelectAllVisible}
          onDeselectAllVisible={handleDeselectAllVisible}
          onPartUpdated={handlePartUpdated}
        />

        {/* Pagination bar */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Showing{' '}
              <span className="font-semibold text-foreground">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-foreground">
                {Math.min(currentPage * pageSize, totalCount)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-foreground">{totalCount}</span> parts
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.max(1, currentPage - 1),
                  }))
                }
                className="gap-1 h-8 px-2 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>

              <span className="text-xs text-muted-foreground px-1 font-medium">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: currentPage + 1,
                  }))
                }
                className="gap-1 h-8 px-2 text-xs"
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Purchase Order Floating Bottom Bar & Review Drawer */}
      <PurchaseOrderDrawer
        selectedItems={selectedOrderItems}
        onUpdateQuantity={handleUpdateOrderQuantity}
        onRemoveItem={handleRemoveOrderItem}
        onClearAll={handleClearAllOrderItems}
        onOrderSaved={handleRefreshAll}
        onOpenSuppliersManager={() => setIsSuppliersManagerOpen(true)}
      />

      {/* Suppliers / Distributors Directory Dialog */}
      <SuppliersManagerDialog
        open={isSuppliersManagerOpen}
        onOpenChange={setIsSuppliersManagerOpen}
      />

      {/* Purchase Order History & Stock Receive Dialog */}
      <PoHistoryDialog
        open={isPoHistoryOpen}
        onOpenChange={setIsPoHistoryOpen}
        onStockUpdated={handleRefreshAll}
      />

      {/* Add Part Modal */}
      <PartFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSuccess={handleRefreshAll}
      />

      {/* Edit Part Modal */}
      <PartFormDialog
        open={Boolean(editingPart)}
        onOpenChange={(open) => !open && setEditingPart(null)}
        initialData={editingPart}
        onSuccess={handleRefreshAll}
      />

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        open={Boolean(adjustingPart)}
        onOpenChange={(open) => !open && setAdjustingPart(null)}
        part={adjustingPart}
        onSuccess={handleRefreshAll}
      />

      {/* Part Delete Confirmation Modal */}
      <PartDeleteDialog
        open={Boolean(deletingPart)}
        onOpenChange={(open) => !open && setDeletingPart(null)}
        part={deletingPart}
        onSuccess={handleRefreshAll}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        open={isCsvImportOpen}
        onOpenChange={setIsCsvImportOpen}
        onSuccess={handleRefreshAll}
      />
    </div>
  );
}
