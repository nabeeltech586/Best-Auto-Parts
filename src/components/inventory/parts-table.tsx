'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Sliders,
  Eye,
  Wrench,
  AlertTriangle,
  MapPin,
  Car,
  Check,
  Clock,
  X,
  Loader2,
  Plus,
  Minus,
  ShoppingCart,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, getStockStatus } from '@/lib/inventory/parts';
import { getMatchingPartImage, DEFAULT_PART_IMAGE } from '@/lib/partImages';
import type { PartCatalogItem, PurchaseOrderItem } from '@/types/inventory';

interface PartsTableProps {
  parts: PartCatalogItem[];
  loading: boolean;
  onEdit: (part: PartCatalogItem) => void;
  onDelete: (part: PartCatalogItem) => void;
  onAdjustStock: (part: PartCatalogItem) => void;
  canEdit: boolean;
  canDelete: boolean;
  selectedOrderItems?: Map<string, PurchaseOrderItem>;
  onToggleOrderItem?: (part: PartCatalogItem, quantity?: number) => void;
  onUpdateOrderQuantity?: (partId: string, quantity: number) => void;
  onSelectAllVisible?: (parts: PartCatalogItem[]) => void;
  onDeselectAllVisible?: (parts: PartCatalogItem[]) => void;
  onPartUpdated?: (updatedPart: PartCatalogItem) => void;
}

export function PartsTable({
  parts,
  loading,
  onEdit,
  onDelete,
  onAdjustStock,
  canEdit,
  canDelete,
  selectedOrderItems,
  onToggleOrderItem,
  onUpdateOrderQuantity,
  onSelectAllVisible,
  onDeselectAllVisible,
  onPartUpdated,
}: PartsTableProps) {
  const router = useRouter();

  // Inline Quick Edit state
  const [inlinePriceId, setInlinePriceId] = useState<string | null>(null);
  const [inlinePriceVal, setInlinePriceVal] = useState<string>('');
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  const [inlineStockId, setInlineStockId] = useState<string | null>(null);
  const [inlineStockVal, setInlineStockVal] = useState<string>('');
  const [savingStockId, setSavingStockId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card/60 p-8 text-center">
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading parts catalog...</p>
        </div>
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-card/40 p-12 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <Wrench className="size-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No auto parts found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          No inventory parts matched your search or filters. Try adjusting your search criteria or add a new part to your catalog.
        </p>
      </div>
    );
  }

  const getConditionColor = (cond: string) => {
    switch (cond) {
      case 'Genuine':
        return 'border-purple-500/30 bg-purple-500/10 text-purple-400';
      case 'OEM':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
      case 'Aftermarket':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
      case 'Used':
        return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400';
      default:
        return 'border-border bg-muted text-muted-foreground';
    }
  };

  const formatDeliveryDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = d.toLocaleDateString('en-GB', { month: 'short' });
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  };

  // Check if all visible parts are selected
  const allVisibleSelected =
    parts.length > 0 &&
    Boolean(selectedOrderItems) &&
    parts.every((p) => selectedOrderItems?.has(p.id));

  const handleHeaderCheckboxChange = () => {
    if (allVisibleSelected) {
      onDeselectAllVisible?.(parts);
    } else {
      onSelectAllVisible?.(parts);
    }
  };

  // Save inline selling price edit
  const handleSavePrice = async (part: PartCatalogItem) => {
    const num = parseFloat(inlinePriceVal);
    if (isNaN(num) || num < 0) {
      toast.error('Invalid price amount');
      return;
    }

    setSavingPriceId(part.id);
    try {
      const res = await fetch(`/api/inventory/parts/${part.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selling_price: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update price');

      toast.success(`Updated ${part.part_name} price to ${formatCurrency(num)}`);
      setInlinePriceId(null);
      if (onPartUpdated && data.part) {
        onPartUpdated(data.part);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error updating price');
    } finally {
      setSavingPriceId(null);
    }
  };

  // Save inline stock edit
  const handleSaveStock = async (part: PartCatalogItem) => {
    const num = parseInt(inlineStockVal, 10);
    if (isNaN(num) || num < 0) {
      toast.error('Invalid stock quantity');
      return;
    }

    setSavingStockId(part.id);
    try {
      const res = await fetch(`/api/inventory/parts/${part.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity_in_stock: num,
          stock_edit_reason: 'Quick inline stock update',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update stock');

      toast.success(`Updated ${part.part_name} stock to ${num} units`);
      setInlineStockId(null);
      if (onPartUpdated && data.part) {
        onPartUpdated(data.part);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error updating stock');
    } finally {
      setSavingStockId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/70 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {/* PO Selection Checkbox */}
              {onToggleOrderItem && (
                <TableHead className="w-10 text-center py-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleHeaderCheckboxChange}
                    className="size-4 rounded border-border accent-primary cursor-pointer align-middle"
                    title={allVisibleSelected ? 'Deselect all visible' : 'Select all visible for Purchase Order'}
                  />
                </TableHead>
              )}

              <TableHead className="w-[250px] text-xs font-semibold text-muted-foreground">
                Part Details
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">
                OEM / Numbers
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">
                Category &amp; Brand
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">
                Condition
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right w-[140px]">
                Selling Price
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-center w-[130px]">
                Stock Level
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">
                Location
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-center w-[130px]">
                Distributor PO
              </TableHead>
              <TableHead className="w-[90px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts.map((part) => {
              const stock = getStockStatus(part);
              const fitmentCount = part.fitments?.length ?? 0;
              const isSelected = selectedOrderItems?.has(part.id) ?? false;
              const orderItem = selectedOrderItems?.get(part.id);

              const isEditingPrice = inlinePriceId === part.id;
              const isSavingPrice = savingPriceId === part.id;

              const isEditingStock = inlineStockId === part.id;
              const isSavingStock = savingStockId === part.id;

              return (
                <TableRow
                  key={part.id}
                  className={`border-border hover:bg-muted/40 transition-colors ${
                    isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                  }`}
                >
                  {/* PO Row Checkbox */}
                  {onToggleOrderItem && (
                    <TableCell className="py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleOrderItem(part)}
                        className="size-4 rounded border-border accent-primary cursor-pointer align-middle"
                        title={isSelected ? 'Remove from Purchase Order' : 'Add to Purchase Order'}
                      />
                    </TableCell>
                  )}

                  {/* Part Name & SKU */}
                  <TableCell className="py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="size-11 shrink-0 mt-0.5 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={part.image_url || (part.image_urls && part.image_urls[0]) || getMatchingPartImage(part)}
                          alt={part.part_name}
                          width={44}
                          height={44}
                          className="size-11 object-contain bg-white border border-slate-200 rounded-lg p-1 shadow-xs transition-transform hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            const fallback = getMatchingPartImage(part);
                            if (e.currentTarget.src !== fallback && !e.currentTarget.src.endsWith(fallback)) {
                              e.currentTarget.src = fallback;
                            } else {
                              e.currentTarget.src = DEFAULT_PART_IMAGE;
                            }
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/inventory/${part.id}`}
                          className="font-medium text-sm text-foreground hover:text-primary transition-colors line-clamp-1"
                        >
                          {part.part_name}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="font-mono bg-muted/80 px-1 rounded text-[11px] text-foreground/80">
                            {part.sku}
                          </span>
                          {fitmentCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                              title={`${fitmentCount} compatible vehicles`}
                            >
                              <Car className="size-3 text-muted-foreground/70" />
                              {fitmentCount} {fitmentCount === 1 ? 'fitment' : 'fitments'}
                            </span>
                          )}
                        </div>

                        {/* Pending PO Delivery Badge */}
                        {part.pending_po && (
                          <div className="mt-1">
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium gap-1 px-1.5 py-0"
                            >
                              <Clock className="size-2.5" />
                              Ordered: {new Date(part.pending_po.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} (Pending Delivery)
                            </Badge>
                          </div>
                        )}

                        {/* Confirmed Restock & Delivery Inward Badge */}
                        {part.last_restocked_at && (
                          <div className="mt-1">
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-medium gap-1 px-1.5 py-0"
                              title={
                                part.last_po_number
                                  ? `Purchase Order ${part.last_po_number.startsWith('#') ? part.last_po_number : `#${part.last_po_number}`}`
                                  : 'Stock Inward Restock Verified'
                              }
                            >
                              <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                              ✓ Delivered: {formatDeliveryDate(part.last_restocked_at)}
                              {part.last_restocked_quantity !== undefined &&
                              part.last_restocked_quantity !== null &&
                              Number(part.last_restocked_quantity) > 0
                                ? ` (+${part.last_restocked_quantity} Added)`
                                : ''}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* OEM & Alternate OEMs */}
                  <TableCell className="py-3 text-xs">
                    {part.oem_number ? (
                      <div className="font-mono text-foreground/90 font-medium truncate max-w-[130px]">
                        {part.oem_number}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                    {part.alternate_oem_numbers && part.alternate_oem_numbers.length > 0 && (
                      <div
                        className="text-[11px] font-mono text-muted-foreground truncate max-w-[130px] mt-0.5"
                        title={part.alternate_oem_numbers.join(', ')}
                      >
                        +{part.alternate_oem_numbers.length} alt OEM
                      </div>
                    )}
                  </TableCell>

                  {/* Category & Brand */}
                  <TableCell className="py-3 text-xs">
                    <div className="font-medium text-foreground/90 truncate max-w-[130px]">
                      {part.category || 'Uncategorized'}
                    </div>
                    {part.brand && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[130px]">
                        {part.brand}
                      </div>
                    )}
                  </TableCell>

                  {/* Condition Badge */}
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${getConditionColor(
                        part.condition,
                      )}`}
                    >
                      {part.condition}
                    </Badge>
                  </TableCell>

                  {/* Selling Price (with Inline Edit) */}
                  <TableCell className="py-3 text-right">
                    {isEditingPrice ? (
                      <div className="flex items-center justify-end gap-1">
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            ₹
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            autoFocus
                            value={inlinePriceVal}
                            onChange={(e) => setInlinePriceVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePrice(part);
                              if (e.key === 'Escape') setInlinePriceId(null);
                            }}
                            className="h-7 w-20 pl-4 pr-1 text-right font-mono text-xs bg-card"
                            disabled={isSavingPrice}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSavePrice(part)}
                          disabled={isSavingPrice}
                          className="size-7 p-0 text-emerald-500 hover:text-emerald-400"
                        >
                          {isSavingPrice ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setInlinePriceId(null)}
                          disabled={isSavingPrice}
                          className="size-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          if (canEdit) {
                            setInlinePriceId(part.id);
                            setInlinePriceVal(String(part.selling_price));
                          }
                        }}
                        className={`group inline-flex flex-col items-end ${
                          canEdit ? 'cursor-pointer' : ''
                        }`}
                        title={canEdit ? 'Click to quick-edit selling price' : undefined}
                      >
                        <div className="font-semibold text-sm text-foreground flex items-center gap-1">
                          {formatCurrency(part.selling_price)}
                          {canEdit && (
                            <Pencil className="size-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                        {part.cost_price > 0 && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            Cost: {formatCurrency(part.cost_price)}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Stock Level (with Inline Edit) */}
                  <TableCell className="py-3 text-center">
                    {isEditingStock ? (
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          autoFocus
                          value={inlineStockVal}
                          onChange={(e) => setInlineStockVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveStock(part);
                            if (e.key === 'Escape') setInlineStockId(null);
                          }}
                          className="h-7 w-16 text-center font-mono text-xs bg-card p-1"
                          disabled={isSavingStock}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveStock(part)}
                          disabled={isSavingStock}
                          className="size-7 p-0 text-emerald-500 hover:text-emerald-400"
                        >
                          {isSavingStock ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setInlineStockId(null)}
                          disabled={isSavingStock}
                          className="size-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          if (canEdit) {
                            setInlineStockId(part.id);
                            setInlineStockVal(String(part.quantity_in_stock));
                          }
                        }}
                        className={`group inline-flex flex-col items-center ${
                          canEdit ? 'cursor-pointer' : ''
                        }`}
                        title={canEdit ? 'Click to quick-edit stock count' : undefined}
                      >
                        <span className="font-semibold text-sm text-foreground flex items-center gap-1 font-mono">
                          {part.quantity_in_stock}
                          {canEdit && (
                            <Pencil className="size-2.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border mt-0.5 ${stock.badgeClass}`}
                        >
                          {stock.status === 'low_stock' && (
                            <AlertTriangle className="size-2.5" />
                          )}
                          {stock.label}
                        </span>
                      </div>
                    )}
                  </TableCell>

                  {/* Location */}
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    {part.location ? (
                      <div className="inline-flex items-center gap-1">
                        <MapPin className="size-3 text-muted-foreground/60 shrink-0" />
                        <span className="truncate max-w-[90px]">{part.location}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>

                  {/* Distributor PO Quick Stepper */}
                  <TableCell className="py-3 text-center">
                    {onToggleOrderItem && (
                      <div className="inline-flex items-center justify-center">
                        {isSelected ? (
                          <div className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateOrderQuantity?.(
                                  part.id,
                                  Math.max(1, (orderItem?.quantity || 10) - 5),
                                )
                              }
                              className="size-5 flex items-center justify-center rounded hover:bg-primary/20 text-primary"
                              title="Decrease order qty by 5"
                            >
                              <Minus className="size-3" />
                            </button>
                            <span className="font-mono text-xs font-bold text-primary min-w-[32px] text-center">
                              {orderItem?.quantity || 10}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateOrderQuantity?.(
                                  part.id,
                                  (orderItem?.quantity || 10) + 5,
                                )
                              }
                              className="size-5 flex items-center justify-center rounded hover:bg-primary/20 text-primary"
                              title="Increase order qty by 5"
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onToggleOrderItem(part, 10)}
                            className="h-6 px-2 text-[11px] gap-1 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                            title="Add 10 pcs to Purchase Order"
                          >
                            <ShoppingCart className="size-3" />
                            + Order (10)
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Action Buttons: Direct Edit Button + More Menu */}
                  <TableCell className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(part)}
                          className="size-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Quick Edit Part Details & Rates"
                        >
                          <Pencil className="size-3.5 text-primary" />
                          <span className="sr-only">Quick Edit</span>
                        </Button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => router.push(`/inventory/${part.id}`)}
                            className="cursor-pointer"
                          >
                            <Eye className="mr-2 size-4 text-muted-foreground" />
                            View Details
                          </DropdownMenuItem>

                          {canEdit && (
                            <>
                              <DropdownMenuItem
                                onClick={() => onAdjustStock(part)}
                                className="cursor-pointer"
                              >
                                <Sliders className="mr-2 size-4 text-muted-foreground" />
                                Adjust Stock
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onEdit(part)}
                                className="cursor-pointer"
                              >
                                <Pencil className="mr-2 size-4 text-muted-foreground" />
                                Edit Part
                              </DropdownMenuItem>
                            </>
                          )}

                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => onDelete(part)}
                                className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10"
                              >
                                <Trash2 className="mr-2 size-4" />
                                Delete Part
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
