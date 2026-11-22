export const LEGACY_CONDITION_TIMEZONE = 'UTC'

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export function minutesInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

export function dayOfWeekInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  })
    .format(now)
    .toLowerCase()
}

function parseClock(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const FULL_TO_SHORT: Record<string, string> = {
  sunday: 'sun',
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
}

function normalizeDay(d: string): string | null {
  const clean = d.trim().toLowerCase()
  if (SHORT_DAYS.includes(clean as (typeof SHORT_DAYS)[number])) return clean
  return FULL_TO_SHORT[clean] ?? null
}

function matchesDaySpec(spec: string, currentDay: string): boolean {
  const rangeParts = spec.split('-')
  if (rangeParts.length === 2) {
    const start = normalizeDay(rangeParts[0])
    const end = normalizeDay(rangeParts[1])
    if (!start || !end) return false
    const startIndex = SHORT_DAYS.indexOf(start as (typeof SHORT_DAYS)[number])
    const endIndex = SHORT_DAYS.indexOf(end as (typeof SHORT_DAYS)[number])
    const currentIndex = SHORT_DAYS.indexOf(currentDay as (typeof SHORT_DAYS)[number])
    if (startIndex <= endIndex) {
      return currentIndex >= startIndex && currentIndex <= endIndex
    } else {
      return currentIndex >= startIndex || currentIndex <= endIndex
    }
  }
  const single = normalizeDay(spec)
  return single ? single === currentDay : false
}

export function isWithinTimeWindow(
  window: string | undefined,
  now: Date,
  timeZone: string | undefined,
): boolean {
  if (!window || !window.trim()) return false
  const zone = timeZone ?? LEGACY_CONDITION_TIMEZONE
  if (!isValidTimeZone(zone)) return false

  const currentMins = minutesInTimeZone(now, zone)
  const currentDay = dayOfWeekInTimeZone(now, zone)

  const segments = window
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length === 0) return false

  for (const segment of segments) {
    let timeRange = segment
    let dayConstraint: string | null = null

    const colonMatch = segment.match(/^([a-zA-Z\-]+)[:\s]+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})$/)
    if (colonMatch) {
      dayConstraint = colonMatch[1]
      timeRange = colonMatch[2]
    }

    if (dayConstraint && !matchesDaySpec(dayConstraint, currentDay)) {
      continue
    }

    const [from, to] = timeRange.split('-').map((s) => s.trim())
    if (!from || !to) continue

    const f = parseClock(from)
    const t = parseClock(to)
    const inRange = f <= t ? currentMins >= f && currentMins < t : currentMins >= f || currentMins < t
    if (inRange) return true
  }

  return false
}

export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(zone) ? zone : LEGACY_CONDITION_TIMEZONE
  } catch {
    return LEGACY_CONDITION_TIMEZONE
  }
}

export function listTimeZones(current?: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const zones = new Set<string>([LEGACY_CONDITION_TIMEZONE, ...supported])
  if (current && isValidTimeZone(current)) zones.add(current)
  return [...zones]
}

export function withConditionTimezone(
  stepConfig: Record<string, unknown>,
  timeZone: string,
): Record<string, unknown> {
  if (stepConfig.subject !== 'time_of_day' || stepConfig.timezone) return stepConfig
  return { ...stepConfig, timezone: timeZone }
}

export function editConditionConfig(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  timeZone: string,
): Record<string, unknown> {
  return withConditionTimezone({ ...current, ...patch }, timeZone)
}
