'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileCheck2, Loader2 } from 'lucide-react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ServiceCase, ServiceStage } from '@/types/services';
import { Skeleton } from './skeleton';

export interface OnlineServicesCardProps {
  initialCases?: ServiceCase[];
}

interface StageConfig {
  id: ServiceStage;
  name: string;
  barColor: string;
  badgeClass: string;
}

const STAGES: StageConfig[] = [
  {
    id: 'NEW_INQUIRY',
    name: 'New Inquiry / Docs Pending',
    barColor: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    id: 'PORTAL_CHECK',
    name: 'Portal Check & Quote',
    barColor: 'bg-blue-500',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  {
    id: 'PAYMENT_PENDING',
    name: 'Payment Pending',
    barColor: 'bg-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  {
    id: 'PROCESSING',
    name: 'Processing / Filing',
    barColor: 'bg-indigo-500',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20',
  },
];

export function OnlineServicesCard({ initialCases }: OnlineServicesCardProps) {
  const [cases, setCases] = useState<ServiceCase[]>(initialCases || []);
  const [loading, setLoading] = useState<boolean>(!initialCases);

  useEffect(() => {
    if (initialCases) {
      setCases(initialCases);
      setLoading(false);
      return;
    }

    let isMounted = true;
    fetch('/api/services/cases')
      .then((res) => (res.ok ? res.json() : { cases: [] }))
      .then((data) => {
        if (!isMounted) return;
        setCases(data.cases || []);
      })
      .catch((err) => {
        console.warn('[OnlineServicesCard] Failed to fetch service cases:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialCases]);

  // Stage breakdown counts
  const stageStats = useMemo(() => {
    const counts: Record<string, number> = {
      NEW_INQUIRY: 0,
      PORTAL_CHECK: 0,
      PAYMENT_PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
    };

    cases.forEach((c) => {
      if (counts[c.stage] !== undefined) {
        counts[c.stage]++;
      }
    });

    const maxCount = Math.max(
      1,
      ...STAGES.map((s) => counts[s.id] || 0)
    );

    const activeCases = cases.filter((c) => c.stage !== 'COMPLETED').length;

    const serviceEarnings = cases
      .filter((c) => c.payment_status === 'PAID')
      .reduce((sum, c) => sum + Number(c.service_charge ?? 50), 0);

    return { counts, maxCount, activeCases, serviceEarnings };
  }, [cases]);

  return (
    <Card className="h-full flex flex-col justify-between border-border/80 shadow-xs" data-testid="online-services-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 shrink-0">
              <FileCheck2 className="size-4.5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-bold tracking-tight text-foreground truncate">
                Online Services — ITR, Insurance & RTO
              </CardTitle>
              <CardDescription className="text-xs truncate">
                Customer filings, tax & vehicle verification stages
              </CardDescription>
            </div>
          </div>
          <CardAction>
            <Link
              href="/pipelines"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 gap-1'
              )}
            >
              <span>Board</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <ul className="space-y-3 py-1">
            {STAGES.map((stage) => {
              const count = stageStats.counts[stage.id] || 0;
              const fillPct = Math.min(100, Math.round((count / stageStats.maxCount) * 100));

              return (
                <li
                  key={stage.id}
                  className="grid grid-cols-[minmax(0,1fr)_4rem_auto] sm:grid-cols-[10.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{stage.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {count} {count === 1 ? 'case' : 'cases'}
                    </p>
                  </div>
                  <div className="h-3 rounded-full bg-muted/80 overflow-hidden border border-border/40">
                    <div
                      className={cn('h-full rounded-full transition-all duration-300', stage.barColor)}
                      style={{ width: `${count > 0 ? Math.max(8, fillPct) : 0}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border tabular-nums text-right shrink-0',
                      count > 0 ? stage.badgeClass : 'bg-muted text-muted-foreground border-border/40'
                    )}
                  >
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Summary Footer */}
        <div className="mt-auto space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <span>Active Cases:</span>
              <span className="font-bold text-foreground tabular-nums">
                {stageStats.activeCases}
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <span>Service Earnings:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ₹{stageStats.serviceEarnings.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Link
              href="/pipelines"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'w-full sm:w-auto text-xs font-semibold gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 shadow-2xs'
              )}
            >
              <span>Open Online Services</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
