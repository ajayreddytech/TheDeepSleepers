// Sleep duration helpers.
//
// A night is keyed by the evening date it starts on. Its bedtime comes from this app's log for
// that evening; its wake-up time is the wake-up app's log for the following calendar date.
// When no wake-up time has been logged yet, the night has no hours and stays empty.

export const TARGET_SLEEP_HOURS = 8
export const MIN_SLEEP_HOURS = 7

const MINUTES_PER_DAY = 24 * 60
// Bedtimes before noon belong to the previous evening (same rule as the rest of the app).
const EVENING_CUTOFF_MINUTES = 12 * 60
// Anything longer than this is treated as a logging mistake rather than a real night.
const MAX_PLAUSIBLE_HOURS = 16

export type SleepNight = {
  date: string
  bedtime: string
  wakeTime: string | null
  hours: number | null
}

export type SleepStats = {
  loggedNights: number
  measuredNights: number
  averageHours: number | null
  spreadHours: number | null
  shareAtMinimum: number | null
  balanceHours: number | null
  longest: SleepNight | null
  shortest: SleepNight | null
  weekendAverage: number | null
  weekdayAverage: number | null
  averageWakeMinutes: number | null
  wakeSpreadMinutes: number | null
}

function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

// Date-key arithmetic happens in UTC so it never depends on the viewer's timezone or DST.
export function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

function weekdayOfKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function computeSleepHours(bedtime: string, wakeTime: string | null): number | null {
  if (!wakeTime) return null
  const bed = clockToMinutes(bedtime)
  const wake = clockToMinutes(wakeTime)
  if (bed === null || wake === null) return null

  // Measure from midnight of the evening date. Wake-up is always on the following date.
  const bedAbsolute = bed < EVENING_CUTOFF_MINUTES ? bed + MINUTES_PER_DAY : bed
  const wakeAbsolute = wake + MINUTES_PER_DAY
  const hours = (wakeAbsolute - bedAbsolute) / 60
  if (hours <= 0 || hours > MAX_PLAUSIBLE_HOURS) return null
  return Math.round(hours * 100) / 100
}

export function buildSleepNights(
  bedtimes: { date: string; bedtime: string }[],
  wakeTimes: Record<string, string>,
): Record<string, SleepNight> {
  const nights: Record<string, SleepNight> = {}
  for (const { date, bedtime } of bedtimes) {
    const wakeTime = wakeTimes[nextDateKey(date)] ?? null
    nights[date] = { date, bedtime, wakeTime, hours: computeSleepHours(bedtime, wakeTime) }
  }
  return nights
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number | null {
  const average = mean(values)
  if (average === null) return null
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)) ?? 0)
}

export function computeSleepStats(nights: SleepNight[]): SleepStats {
  const measured = nights.filter((night): night is SleepNight & { hours: number } => night.hours !== null)
  const hours = measured.map((night) => night.hours)
  const weekend = measured.filter((night) => [5, 6].includes(weekdayOfKey(night.date))).map((night) => night.hours)
  const weekday = measured.filter((night) => ![5, 6].includes(weekdayOfKey(night.date))).map((night) => night.hours)
  const wakeMinutes = nights
    .map((night) => (night.wakeTime ? clockToMinutes(night.wakeTime) : null))
    .filter((value): value is number => value !== null)

  type MeasuredNight = SleepNight & { hours: number }
  const longest = measured.reduce<MeasuredNight | null>((best, night) => (!best || night.hours > best.hours ? night : best), null)
  const shortest = measured.reduce<MeasuredNight | null>((best, night) => (!best || night.hours < best.hours ? night : best), null)
  const atMinimum = measured.filter((night) => night.hours >= MIN_SLEEP_HOURS).length

  return {
    loggedNights: nights.length,
    measuredNights: measured.length,
    averageHours: mean(hours),
    spreadHours: standardDeviation(hours),
    shareAtMinimum: measured.length ? Math.round((atMinimum / measured.length) * 100) : null,
    balanceHours: hours.length ? hours.reduce((sum, value) => sum + (value - TARGET_SLEEP_HOURS), 0) : null,
    longest,
    shortest,
    weekendAverage: mean(weekend),
    weekdayAverage: mean(weekday),
    averageWakeMinutes: mean(wakeMinutes),
    wakeSpreadMinutes: standardDeviation(wakeMinutes),
  }
}

export function formatHoursLong(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const sign = totalMinutes < 0 ? '-' : ''
  const absolute = Math.abs(totalMinutes)
  return `${sign}${Math.floor(absolute / 60)}h ${String(absolute % 60).padStart(2, '0')}m`
}

export function formatHoursShort(hours: number): string {
  return `${(Math.round(hours * 10) / 10).toFixed(1)}h`
}

export function formatMinutesOfClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  const date = new Date()
  date.setHours(hours, minutes)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}
