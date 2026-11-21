'use client';

import { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculateNewStock, STOCK_MOVEMENT_META } from '@/lib/inventory/stock';
import type { PartCatalogItem, StockMovementType } from '@/types/inventory';
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';

interface StockAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartCatalogItem | null;
  onSuccess: () => void;
}

export function StockAdjustmentModal({
  open,
  onOpenChange,
  part,
  onSuccess,
}: StockAdjustmentModalProps) {
  const [movementType, setMovementType] = useState<StockMovementType>('increase');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [newCountInput, setNewCountInput] = useState<string>('0');
  const [reason, setReason] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (part && open) {
      setMovementType('increase');
      setQuantityInput('1');
      setNewCountInput(String(part.quantity_in_stock));
      setReason('');
      setReferenceId('');
      setError(null);
    }
  }, [part, open]);

  if (!part) return null;

  const currentStock = part.quantity_in_stock;

  // Calculate delta based on operation mode
  let delta = 0;
  if (movementType === 'adjustment') {
    const targetCount = parseInt(newCountInput, 10);
    if (!isNaN(targetCount)) {
      delta = targetCount - currentStock;
    }
  } else {
    const qty = parseInt(quantityInput, 10);
    if (!isNaN(qty)) {
      if (movementType === 'increase' || movementType === 'return') {
        delta = Math.abs(qty);
      } else {
        delta = -Math.abs(qty);
      }
    }
  }

  const { valid, newStock, error: calcError } = calculateNewStock(currentStock, delta);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setError(calcError || 'Invalid stock calculation');
      return;
    }

    if (delta === 0) {
      setError('Adjustment delta cannot be 0 units');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/inventory/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_id: part.id,
          delta,
          movement_type: movementType,
          reason: reason.trim() || undefined,
          reference_id: referenceId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to adjust stock');
      }

      toast.success(
        `Stock updated: ${delta > 0 ? `+${delta}` : delta} units (${data.part?.quantity_in_stock ?? newStock} on hand)`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Stock adjustment failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const isLowStockWarning =
    newStock > 0 && newStock <= part.low_stock_threshold;
  const isOutOfStockWarning = newStock === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            Adjust Stock Quantity
          </DialogTitle>
          <DialogDescription>
            {part.part_name} <span className="font-mono text-xs font-semibold text-foreground">({part.sku})</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Operation selector */}
          <div className="space-y-1.5">
            <Label htmlFor="movement_type" className="text-xs font-semibold">
              Adjustment Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={movementType}
              onValueChange={(val) => {
                if (val !== null) {
                  setMovementType(val as StockMovementType);
                  setError(null);
                }
              }}
            >
              <SelectTrigger id="movement_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">
                  <span className="flex items-center gap-2">
                    <ArrowUpRight className="size-4 text-emerald-500" />
                    Restock / Received Parts
                  </span>
                </SelectItem>
                <SelectItem value="decrease">
                  <span className="flex items-center gap-2">
                    <ArrowDownRight className="size-4 text-red-500" />
                    Damaged / Scrapped / Disposed
                  </span>
                </SelectItem>
                <SelectItem value="sale">
                  <span className="flex items-center gap-2">
                    <ArrowDownRight className="size-4 text-blue-500" />
                    Manual Order Sale
                  </span>
                </SelectItem>
                <SelectItem value="return">
                  <span className="flex items-center gap-2">
                    <RotateCcw className="size-4 text-emerald-500" />
                    Customer Return
                  </span>
                </SelectItem>
                <SelectItem value="adjustment">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="size-4 text-purple-500" />
                    Physical Inventory Count Audit
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quantity or Target Count input */}
          {movementType === 'adjustment' ? (
            <div className="space-y-1.5">
              <Label htmlFor="new_count" className="text-xs font-semibold">
                Actual Physical Count on Shelf <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new_count"
                type="number"
                min="0"
                step="1"
                value={newCountInput}
                onChange={(e) => {
                  setNewCountInput(e.target.value);
                  setError(null);
                }}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Enter the verified count. The system will calculate the exact variance.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="qty_input" className="text-xs font-semibold">
                Quantity Units <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qty_input"
                type="number"
                min="1"
                step="1"
                value={quantityInput}
                onChange={(e) => {
                  setQuantityInput(e.target.value);
                  setError(null);
                }}
                required
              />
            </div>
          )}

          {/* Stock Calculation Preview Card */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground">Current</p>
                <p className="text-base font-bold text-foreground">{currentStock}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Delta</p>
                <p
                  className={`text-base font-bold ${
                    delta > 0
                      ? 'text-emerald-500'
                      : delta < 0
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">New Stock</p>
                <p
                  className={`text-base font-bold ${
                    newStock < 0
                      ? 'text-destructive'
                      : newStock <= part.low_stock_threshold
                      ? 'text-amber-500'
                      : 'text-foreground'
                  }`}
                >
                  {newStock}
                </p>
              </div>
            </div>

            {isOutOfStockWarning && (
              <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-red-500">
                <AlertTriangle className="size-3.5" />
                <span>Notice: Part will be marked Out of Stock (0 units).</span>
              </div>
            )}
            {isLowStockWarning && (
              <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-amber-500">
                <AlertTriangle className="size-3.5" />
                <span>
                  Notice: Stock will reach or fall below threshold ({part.low_stock_threshold} units).
                </span>
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="adj_reason" className="text-xs font-semibold">
              Reason / Notes
            </Label>
            <Textarea
              id="adj_reason"
              placeholder="e.g. Supplier PO received, damaged in shelf transit, monthly cycle count"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* Reference ID */}
          <div className="space-y-1.5">
            <Label htmlFor="adj_ref" className="text-xs font-semibold">
              Reference Document ID (Optional)
            </Label>
            <Input
              id="adj_ref"
              placeholder="e.g. PO-98421, INV-2024-04, AUD-09"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !valid || delta === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Adjustment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
