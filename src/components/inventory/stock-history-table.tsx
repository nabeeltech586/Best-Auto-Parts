'use client';

import {
  History,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { STOCK_MOVEMENT_META } from '@/lib/inventory/stock';
import type { StockMovement } from '@/types/inventory';

interface StockHistoryTableProps {
  movements: StockMovement[];
  loading?: boolean;
}

export function StockHistoryTable({ movements, loading }: StockHistoryTableProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-xs text-muted-foreground">Loading movement history...</p>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-8 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
          <History className="size-5" />
        </div>
        <h4 className="text-sm font-semibold text-foreground">No stock history yet</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Stock movements, restocks, sales deductions, and physical count audits will appear here.
        </p>
      </div>
    );
  }

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="text-xs font-semibold">Date & Time</TableHead>
            <TableHead className="text-xs font-semibold">Activity Type</TableHead>
            <TableHead className="text-xs font-semibold">Quantity Delta</TableHead>
            <TableHead className="text-xs font-semibold">Stock Balance</TableHead>
            <TableHead className="text-xs font-semibold">Reason & Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => {
            const meta = STOCK_MOVEMENT_META[movement.movement_type] || {
              label: movement.movement_type,
              badgeClass: 'bg-muted text-foreground',
              isAddition: movement.quantity_delta > 0,
            };

            const isPositive = movement.quantity_delta > 0;

            return (
              <TableRow key={movement.id}>
                <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {formatDateTime(movement.created_at)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="size-3" />
                    ) : (
                      <ArrowDownRight className="size-3" />
                    )}
                    {meta.label}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`font-mono text-xs font-bold ${
                      isPositive
                        ? 'text-emerald-500'
                        : movement.quantity_delta < 0
                        ? 'text-red-500'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isPositive ? `+${movement.quantity_delta}` : movement.quantity_delta}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-muted-foreground">
                      {movement.quantity_before}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold text-foreground">
                      {movement.quantity_after}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5 text-xs">
                    {movement.reason ? (
                      <p className="text-foreground">{movement.reason}</p>
                    ) : (
                      <span className="text-muted-foreground italic">No reason provided</span>
                    )}
                    {movement.reference_id && (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                        <FileText className="size-3" />
                        <span>Ref: {movement.reference_id}</span>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
