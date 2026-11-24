'use client';

import { Search, X, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  COMMON_PART_CATEGORIES,
  COMMON_VEHICLE_MAKES,
  BIKE_MODELS_BY_MAKE,
  ALL_POPULAR_BIKE_MODELS,
  type BikeMake,
} from '@/lib/inventory/fitment';
import { PART_CONDITIONS, type PartCondition, type InventoryFilterParams } from '@/types/inventory';

export interface PartsFiltersProps {
  filters: InventoryFilterParams;
  onChange: (next: InventoryFilterParams) => void;
  onReset: () => void;
}

export function PartsFilters({
  filters,
  onChange,
  onReset,
}: PartsFiltersProps) {
  const search = filters.search || '';
  const category = filters.category || '';
  const condition = filters.condition || 'all';
  const stockStatus = filters.stockStatus || 'all';
  const vehicleMake = filters.vehicleManufacturer || '';
  const vehicleModel = filters.vehicleModel || '';
  const sortBy = filters.sortBy || 'updated_at';
  const sortOrder = filters.sortOrder || 'desc';

  const availableModels =
    vehicleMake && vehicleMake in BIKE_MODELS_BY_MAKE
      ? BIKE_MODELS_BY_MAKE[vehicleMake as BikeMake]
      : ALL_POPULAR_BIKE_MODELS;

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(category && category !== 'all') ||
    Boolean(condition && condition !== 'all') ||
    Boolean(stockStatus && stockStatus !== 'all') ||
    Boolean(vehicleMake && vehicleMake !== 'all') ||
    Boolean(vehicleModel && vehicleModel !== 'all');

  const update = (patch: Partial<InventoryFilterParams>) => {
    onChange({
      ...filters,
      ...patch,
      page: 1, // reset to page 1 on filter change
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {/* Main Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search part name, SKU, OEM #, brand, or category..."
            value={search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9 pr-8 bg-muted/60 border-border text-foreground placeholder:text-muted-foreground h-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => update({ search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Quick Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <Select
            value={category || 'all'}
            onValueChange={(val) => {
              if (val !== null) {
                update({ category: val === 'all' ? '' : val });
              }
            }}
          >
            <SelectTrigger className="h-9 w-[150px] bg-muted/60 border-border text-xs text-foreground">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {COMMON_PART_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Condition Filter */}
          <Select
            value={condition || 'all'}
            onValueChange={(val) => {
              if (val !== null) {
                update({ condition: val as PartCondition | 'all' });
              }
            }}
          >
            <SelectTrigger className="h-9 w-[130px] bg-muted/60 border-border text-xs text-foreground">
              <SelectValue placeholder="All Conditions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              {PART_CONDITIONS.map((cond) => (
                <SelectItem key={cond} value={cond}>
                  {cond}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stock Level Filter */}
          <Select
            value={stockStatus || 'all'}
            onValueChange={(val) => {
              if (val !== null) {
                update({
                  stockStatus: val as 'all' | 'in_stock' | 'low_stock' | 'out_of_stock',
                });
              }
            }}
          >
            <SelectTrigger className="h-9 w-[130px] bg-muted/60 border-border text-xs text-foreground">
              <SelectValue placeholder="All Stock Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="in_stock">In Stock (&gt;0)</SelectItem>
              <SelectItem value="low_stock">Low Stock (≤ min)</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock (0)</SelectItem>
            </SelectContent>
          </Select>

          {/* Bike Make Filter (Bajaj • Hero • Honda) */}
          <Select
            value={vehicleMake || 'all'}
            onValueChange={(val) => {
              if (val !== null) {
                const nextMake = val === 'all' ? '' : val;
                // If switching make and model is no longer in make's list, reset model
                const modelValid =
                  nextMake && nextMake in BIKE_MODELS_BY_MAKE
                    ? (BIKE_MODELS_BY_MAKE[nextMake as BikeMake] as readonly string[]).includes(vehicleModel)
                    : true;
                update({
                  vehicleManufacturer: nextMake,
                  vehicleModel: modelValid ? vehicleModel : '',
                });
              }
            }}
          >
            <SelectTrigger className="h-9 w-[145px] bg-muted/60 border-border text-xs text-foreground">
              <SelectValue placeholder="All Bike Makes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bike Makes</SelectItem>
              {COMMON_VEHICLE_MAKES.map((make) => (
                <SelectItem key={make} value={make}>
                  {make}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Optional Bike Model Filter */}
          <Select
            value={vehicleModel || 'all'}
            onValueChange={(val) => {
              if (val !== null) {
                update({ vehicleModel: val === 'all' ? '' : val });
              }
            }}
          >
            <SelectTrigger className="h-9 w-[145px] bg-muted/60 border-border text-xs text-foreground">
              <SelectValue placeholder="All Bike Models" />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              <SelectItem value="all">
                {vehicleMake ? `All ${vehicleMake} Models` : 'All Bike Models'}
              </SelectItem>
              {availableModels.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort By Dropdown */}
          <Select
            value={sortBy}
            onValueChange={(val) => {
              if (val !== null) {
                update({
                  sortBy: val as 'name' | 'sku' | 'price' | 'stock' | 'updated_at',
                });
              }
            }}
          >
            <SelectTrigger className="h-9 w-[130px] bg-muted/60 border-border text-xs text-foreground">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">Recently Updated</SelectItem>
              <SelectItem value="name">Part Name</SelectItem>
              <SelectItem value="sku">SKU Code</SelectItem>
              <SelectItem value="price">Selling Price</SelectItem>
              <SelectItem value="stock">Stock Quantity</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Direction Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })
            }
            className="h-9 px-2.5 border-border bg-muted/60 text-muted-foreground hover:text-foreground"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            <ArrowUpDown className="size-3.5" />
          </Button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
