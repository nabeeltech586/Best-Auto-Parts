'use client'

import { useRouter } from 'next/navigation'
import { Briefcase, ChevronDown, Plus, ShoppingBag, UserPlus, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  OVERVIEW_RANGES,
  minutesBetween,
  needsSetup,
  type DashboardOverview,
  type OverviewRange,
} from '@/lib/dashboard/overview'
import { Skeleton } from './skeleton'
import { useFormatDuration } from './use-format-duration'
import { WhatsAppHealthChip } from './whatsapp-health-chip'

const NEW_ITEMS = [
  { key: 'newContact', href: '/contacts', icon: UserPlus },
  { key: 'newDeal', href: '/pipelines', icon: Briefcase },
  { key: 'newOrder', href: '/orders', icon: ShoppingBag },
  { key: 'newAutomation', href: '/automations/new', icon: Zap },
] as const

function partOfDay(date: Date): 'morning' | 'afternoon' | 'evening' {
  const h = date.getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function OverviewHeader({
  data,
  now,
  name,
  range,
  onRangeChange,
}: {
  data: DashboardOverview | null
  now: number
  name: string | null
  range: OverviewRange
  onRangeChange: (range: OverviewRange) => void
}) {
  const t = useTranslations('Dashboard.overview.header')
  const router = useRouter()
  const formatDuration = useFormatDuration()
  const firstName = name?.trim().split(/\s+/)[0] || null

  let context: string | null = null
  if (data) {
    const a = data.attention
    if (needsSetup(data.setup)) context = t('contextSetup')
    else if (a.waiting > 0 && a.oldestWaitingSince)
      context = t('contextWaiting', {
        count: a.waiting,
        wait: formatDuration(minutesBetween(a.oldestWaitingSince, now)),
      })
    else context = t('contextClear')
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-blue-900 dark:via-indigo-900 dark:to-violet-950 p-6 shadow-md border border-blue-500/20 text-white">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {data ? (
            <>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 dark:bg-white/10 text-xs font-semibold tracking-wide text-blue-100 backdrop-blur-sm mb-2 border border-white/20">
                <span>🏍️ Best Auto Parts CRM</span>
                <span>•</span>
                <span>Kailashpur, Saharanpur</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">
                {firstName
                  ? t(`greeting.${partOfDay(new Date(now))}`, { name: firstName })
                  : t(`greetingNoName.${partOfDay(new Date(now))}`)}
              </h2>
              <p className="mt-1 text-sm text-blue-100/90 font-medium">{context}</p>
            </>
          ) : (
            <>
              <Skeleton className="h-6 w-56 bg-white/20" />
              <Skeleton className="mt-2 h-4 w-80 bg-white/20" />
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WhatsAppHealthChip />
          <Tabs value={String(range)} onValueChange={(v) => onRangeChange(Number(v) as OverviewRange)}>
            <TabsList aria-label={t('rangeLabel')} className="bg-white/15 dark:bg-black/30 border border-white/20 text-white backdrop-blur-sm">
              {OVERVIEW_RANGES.map((r) => (
                <TabsTrigger
                  key={r}
                  value={String(r)}
                  className="px-2.5 text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-blue-900 font-medium"
                >
                  {t(`range.${r}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ size: 'sm' }),
                "bg-white text-blue-900 hover:bg-white/90 shadow-sm font-semibold"
              )}
            >
              <Plus aria-hidden className="size-4" />
              {t('new')}
              <ChevronDown className="opacity-70 size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {NEW_ITEMS.map(({ key, href, icon: Icon }) => (
                <DropdownMenuItem key={key} onClick={() => router.push(href)}>
                  <Icon aria-hidden className="size-4" />
                  {t(key)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
