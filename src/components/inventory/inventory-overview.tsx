'use client';

import { Package, Boxes, AlertTriangle, XCircle, IndianRupee, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/inventory/parts';
import type { InventoryMetrics } from '@/types/inventory';

interface InventoryOverviewProps {
  metrics: InventoryMetrics | null;
  loading: boolean;
}

export function InventoryOverview({ metrics, loading }: InventoryOverviewProps) {
  const cards = [
    {
      title: 'Total Parts',
      value: loading ? '...' : (metrics?.total_products ?? 0).toLocaleString(),
      subtext: 'Catalog items',
      icon: Package,
      iconColor: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total Stock Units',
      value: loading ? '...' : (metrics?.total_stock_units ?? 0).toLocaleString(),
      subtext: 'Units in warehouse',
      icon: Boxes,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Low Stock Alert',
      value: loading ? '...' : (metrics?.low_stock_products ?? 0).toLocaleString(),
      subtext: 'Below reorder threshold',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      highlight: (metrics?.low_stock_products ?? 0) > 0,
    },
    {
      title: 'Out of Stock',
      value: loading ? '...' : (metrics?.out_of_stock_products ?? 0).toLocaleString(),
      subtext: 'Immediate restock needed',
      icon: XCircle,
      iconColor: 'text-red-400',
      bgColor: 'bg-red-500/10',
      highlight: (metrics?.out_of_stock_products ?? 0) > 0,
    },
    {
      title: 'Inventory Cost',
      value: loading ? '...' : formatCurrency(metrics?.total_cost_value ?? 0),
      subtext: 'Total cost basis',
      icon: IndianRupee,
      iconColor: 'text-zinc-400',
      bgColor: 'bg-zinc-500/10',
    },
    {
      title: 'Potential Retail Value',
      value: loading ? '...' : formatCurrency(metrics?.total_selling_value ?? 0),
      subtext: 'Estimated sales value',
      icon: TrendingUp,
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            className={`border-border bg-card/70 transition-all hover:border-border/80 ${
              card.highlight ? 'border-amber-500/30' : ''
            }`}
          >
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground line-clamp-1">
                  {card.title}
                </span>
                <div className={`rounded-lg p-1.5 ${card.bgColor} ${card.iconColor} shrink-0`}>
                  <Icon className="size-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                  {card.value}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {card.subtext}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
