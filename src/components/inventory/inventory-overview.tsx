'use client';

import { Package, Boxes, AlertTriangle, XCircle, IndianRupee, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/inventory/parts';
import type { InventoryMetrics } from '@/types/inventory';

interface InventoryOverviewProps {
  metrics: InventoryMetrics | null;
  loading: boolean;
  onStatusClick?: (status: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock') => void;
  activeStatusFilter?: string;
}

export function InventoryOverview({
  metrics,
  loading,
  onStatusClick,
  activeStatusFilter,
}: InventoryOverviewProps) {
  const cards = [
    {
      id: 'all',
      title: 'Total Parts',
      value: loading ? '...' : (metrics?.total_products ?? 0).toLocaleString(),
      subtext: 'Catalog items • Click to view all',
      icon: Package,
      iconColor: 'text-primary',
      bgColor: 'bg-primary/10',
      clickable: Boolean(onStatusClick),
      isActive: activeStatusFilter === 'all',
    },
    {
      id: 'stock_units',
      title: 'Total Stock Units',
      value: loading ? '...' : (metrics?.total_stock_units ?? 0).toLocaleString(),
      subtext: 'Units in warehouse',
      icon: Boxes,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      clickable: false,
    },
    {
      id: 'low_stock',
      title: 'Low Stock Alert',
      value: loading ? '...' : (metrics?.low_stock_products ?? 0).toLocaleString(),
      subtext: 'Below threshold • Click to filter',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      highlight: (metrics?.low_stock_products ?? 0) > 0,
      clickable: Boolean(onStatusClick),
      isActive: activeStatusFilter === 'low_stock',
    },
    {
      id: 'out_of_stock',
      title: 'Out of Stock',
      value: loading ? '...' : (metrics?.out_of_stock_products ?? 0).toLocaleString(),
      subtext: 'Restock needed • Click to filter',
      icon: XCircle,
      iconColor: 'text-red-400',
      bgColor: 'bg-red-500/10',
      highlight: (metrics?.out_of_stock_products ?? 0) > 0,
      clickable: Boolean(onStatusClick),
      isActive: activeStatusFilter === 'out_of_stock',
    },
    {
      id: 'cost_value',
      title: 'Inventory Cost',
      value: loading ? '...' : formatCurrency(metrics?.total_cost_value ?? 0),
      subtext: 'Total cost basis',
      icon: IndianRupee,
      iconColor: 'text-zinc-400',
      bgColor: 'bg-zinc-500/10',
      clickable: false,
    },
    {
      id: 'retail_value',
      title: 'Potential Retail Value',
      value: loading ? '...' : formatCurrency(metrics?.total_selling_value ?? 0),
      subtext: 'Estimated sales value',
      icon: TrendingUp,
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      clickable: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const isClickable = card.clickable;
        return (
          <Card
            key={idx}
            onClick={() => {
              if (isClickable && onStatusClick) {
                if (card.id === 'low_stock') onStatusClick('low_stock');
                else if (card.id === 'out_of_stock') onStatusClick('out_of_stock');
                else if (card.id === 'all') onStatusClick('all');
              }
            }}
            className={`border-border bg-card/70 transition-all ${
              card.highlight ? 'border-amber-500/30' : ''
            } ${
              card.isActive
                ? 'ring-2 ring-primary border-primary bg-primary/5'
                : isClickable
                ? 'cursor-pointer hover:border-primary/50 hover:shadow-sm active:scale-[0.99]'
                : ''
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
