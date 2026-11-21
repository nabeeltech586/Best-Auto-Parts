'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Package,
  Plus,
  Upload,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InventoryOverview } from '@/components/inventory/inventory-overview';
import { PartsFilters } from '@/components/inventory/parts-filters';
import { PartsTable } from '@/components/inventory/parts-table';
import { PartFormDialog } from '@/components/inventory/part-form-dialog';
import { StockAdjustmentModal } from '@/components/inventory/stock-adjustment-modal';
import { PartDeleteDialog } from '@/components/inventory/part-delete-dialog';
import { CsvImportModal } from '@/components/inventory/csv-import-modal';
import { useAuth } from '@/hooks/use-auth';
import type {
  InventoryFilterParams,
  InventoryMetrics,
  PartCatalogItem,
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

  const handleRefreshAll = () => {
    fetchMetrics();
    fetchParts();
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
    <div className="flex-1 space-y-6 p-6">
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
            OEM catalog, warehouse locations, stock thresholds, and vehicle fitment compatibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
      <InventoryOverview metrics={metrics} loading={metricsLoading} />

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
