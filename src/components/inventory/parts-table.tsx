'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Sliders,
  Eye,
  Package,
  Wrench,
  AlertTriangle,
  MapPin,
  Car,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, getStockStatus } from '@/lib/inventory/parts';
import type { PartCatalogItem } from '@/types/inventory';

interface PartsTableProps {
  parts: PartCatalogItem[];
  loading: boolean;
  onEdit: (part: PartCatalogItem) => void;
  onDelete: (part: PartCatalogItem) => void;
  onAdjustStock: (part: PartCatalogItem) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export function PartsTable({
  parts,
  loading,
  onEdit,
  onDelete,
  onAdjustStock,
  canEdit,
  canDelete,
}: PartsTableProps) {
  const router = useRouter();
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

  return (
    <div className="rounded-lg border border-border bg-card/70 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-[260px] text-xs font-semibold text-muted-foreground">
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
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                Selling Price
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-center">
                Stock Level
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">
                Location
              </TableHead>
              <TableHead className="w-[60px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts.map((part) => {
              const stock = getStockStatus(part);
              const fitmentCount = part.fitments?.length ?? 0;

              return (
                <TableRow
                  key={part.id}
                  className="border-border hover:bg-muted/40 transition-colors"
                >
                  {/* Part Name & SKU */}
                  <TableCell className="py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="size-9 rounded-md bg-muted/80 border border-border flex items-center justify-center shrink-0 mt-0.5 text-muted-foreground">
                        <Package className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/inventory/${part.id}`}
                          className="font-medium text-sm text-foreground hover:text-primary transition-colors line-clamp-1"
                        >
                          {part.part_name}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className="font-mono bg-muted/80 px-1 rounded text-[11px] text-foreground/80">
                            {part.sku}
                          </span>
                          {fitmentCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={`${fitmentCount} compatible vehicles`}>
                              <Car className="size-3 text-muted-foreground/70" />
                              {fitmentCount} {fitmentCount === 1 ? 'fitment' : 'fitments'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* OEM & Alternate OEMs */}
                  <TableCell className="py-3 text-xs">
                    {part.oem_number ? (
                      <div className="font-mono text-foreground/90 font-medium truncate max-w-[150px]">
                        {part.oem_number}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                    {part.alternate_oem_numbers && part.alternate_oem_numbers.length > 0 && (
                      <div
                        className="text-[11px] font-mono text-muted-foreground truncate max-w-[150px] mt-0.5"
                        title={part.alternate_oem_numbers.join(', ')}
                      >
                        +{part.alternate_oem_numbers.length} alt OEM
                      </div>
                    )}
                  </TableCell>

                  {/* Category & Brand */}
                  <TableCell className="py-3 text-xs">
                    <div className="font-medium text-foreground/90 truncate max-w-[140px]">
                      {part.category || 'Uncategorized'}
                    </div>
                    {part.brand && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
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

                  {/* Selling Price */}
                  <TableCell className="py-3 text-right">
                    <div className="font-medium text-sm text-foreground">
                      {formatCurrency(part.selling_price)}
                    </div>
                    {part.cost_price > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Cost: {formatCurrency(part.cost_price)}
                      </div>
                    )}
                  </TableCell>

                  {/* Stock Level with Indicator */}
                  <TableCell className="py-3 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className="font-semibold text-sm text-foreground">
                        {part.quantity_in_stock}
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
                  </TableCell>

                  {/* Location */}
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    {part.location ? (
                      <div className="inline-flex items-center gap-1">
                        <MapPin className="size-3 text-muted-foreground/60 shrink-0" />
                        <span className="truncate max-w-[100px]">{part.location}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>

                  {/* Actions Dropdown */}
                  <TableCell className="py-3 text-right">
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
