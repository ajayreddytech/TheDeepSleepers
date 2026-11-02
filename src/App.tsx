import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Reorder, motion, useDragControls } from 'framer-motion'
import {
  BarChart3,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Coffee,
  Cloud,
  ExternalLink,
  GripVertical,
  History,
  Home,
  ListTodo,
  LogOut,
  Mail,
  PencilLine,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  SunMoon,
  Trash2,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { User } from '@supabase/supabase-js'
import { HeatmapGrid, type HeatmapCell } from './components/HeatmapGrid'
import { PeriodStrip } from './components/PeriodStrip'
import {
  MIN_SLEEP_HOURS,
  TARGET_SLEEP_HOURS,
  buildSleepNights,
  computeSleepStats,
  formatHoursLong,
  formatHoursShort,
  formatMinutesOfClock,
  type SleepNight,
  type SleepStats,
} from './lib/sleep'
import { supabase, supabaseConfigured } from './lib/supabase'
import { wakeSupabase, wakeSupabaseConfigured } from './lib/wakeSupabase'
import './App.css'

type NavTab = 'daily' | 'history' | 'insights' | 'sleep' | 'routine' | 'settings'
type RangeKind = 'day' | 'week' | 'month' | 'year'
type ThemeMode = 'light' | 'dark' | 'system'

type EveningEntry = {
  id: string
  date: string
  bedtime: string
  routineCompleted: boolean
  createdAt: string
  updatedAt: string
}

type RoutineStep = {
  id: string
  label: string
  order: number
  createdAt: string
}

type DailyChecklist = Record<string, Record<string, boolean>>
type LocalSnapshot = {
  entries: EveningEntry[]
  routineSteps: RoutineStep[]
  dailyChecklist: DailyChecklist
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

const STORAGE_KEYS = {
  entries: 'the-evening-club.entries',
  routine: 'the-evening-club.routine',
  checklist: 'the-evening-club.checklist',
  theme: 'the-evening-club.theme',
  localBackup: 'the-deep-sleepers.local-backup',
  activeCloudUser: 'the-deep-sleepers.active-cloud-user',
}

const SUPPORT_URL = 'https://ko-fi.com/ajayreddytech'

const navItems: { id: NavTab; label: string; icon: typeof Home }[] = [
  { id: 'daily', label: 'Good evening', icon: Home },
  { id: 'history', label: 'History', icon: History },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'routine', label: 'My routine', icon: ListTodo },
  { id: 'sleep', label: 'Sleep', icon: BedDouble },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function safeParse<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toDateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function getTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function getCurrentTimeInputValue(): string {
  return getTimeInputValue(new Date())
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1)
}

function addYears(date: Date, count: number): Date {
  return new Date(date.getFullYear() + count, date.getMonth(), 1)
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(toDateFromKey(dateKey))
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function formatTimeAsClock(value: string | undefined): string {
  if (!value) return 'No time logged'
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function timeToMinutes(value: string): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function normalizeBedtime(value: string): number | null {
  const minutes = timeToMinutes(value)
  return minutes === null ? null : minutes < 12 * 60 ? minutes + 1440 : minutes
}

function formatMinutesAsTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  const date = new Date()
  date.setHours(hours, minutes)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function computeAverageBedtime(entries: EveningEntry[]): string {
  const valid = entries
    .map((entry) => normalizeBedtime(entry.bedtime))
    .filter((value): value is number => value !== null)

  if (!valid.length) return 'No bedtime data'
  const averageMinutes = valid.reduce((sum, value) => sum + value, 0) / valid.length
  return formatMinutesAsTime(averageMinutes)
}

function computeCompletionRate(entries: EveningEntry[]): number {
  if (!entries.length) return 0
  const complete = entries.filter((entry) => entry.routineCompleted).length
  return Math.round((complete / entries.length) * 100)
}

function listDatesBetween(start: Date, end: Date): string[] {
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(getLocalDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function getRangeDates(range: RangeKind, anchor: Date): { start: Date; end: Date; dates: string[] } {
  const dateOnly = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())

  switch (range) {
    case 'day': {
      const start = new Date(dateOnly)
      const end = new Date(dateOnly)
      return { start, end, dates: listDatesBetween(start, end) }
    }
    case 'week': {
      const start = new Date(dateOnly)
      const dayOfWeek = start.getDay()
      start.setDate(start.getDate() - dayOfWeek)
      const end = addDays(start, 6)
      return { start, end, dates: listDatesBetween(start, end) }
    }
    case 'month': {
      const start = new Date(dateOnly.getFullYear(), dateOnly.getMonth(), 1)
      const end = new Date(dateOnly.getFullYear(), dateOnly.getMonth() + 1, 0)
      return { start, end, dates: listDatesBetween(start, end) }
    }
    case 'year': {
      const start = new Date(dateOnly.getFullYear(), 0, 1)
      const end = new Date(dateOnly.getFullYear(), 11, 31)
      return { start, end, dates: listDatesBetween(start, end) }
    }
    default:
      return { start: dateOnly, end: dateOnly, dates: [getLocalDateKey(dateOnly)] }
  }
}

function shiftRange(range: RangeKind, anchor: Date, direction: number): Date {
  switch (range) {
    case 'day':
      return addDays(anchor, direction)
    case 'week':
      return addDays(anchor, direction * 7)
    case 'month':
      return addMonths(anchor, direction)
    case 'year':
      return addYears(anchor, direction)
    default:
      return anchor
  }
}

function getMonthGridOffset(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const offset = firstDay.getDay()
  return offset
}

// Bedtimes before noon belong to the previous evening (see normalizeBedtime), so the logging
// day stays on the evening still in progress after midnight instead of rolling to the next date.
const OPERATIONAL_DAY_CUTOFF_HOUR = 12

function getOperationalDateKey(date: Date): string {
  const operational = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (date.getHours() < OPERATIONAL_DAY_CUTOFF_HOUR) operational.setDate(operational.getDate() - 1)
  return getLocalDateKey(operational)
}

type PeriodOffset = -1 | 0 | 1
type CompletionTone = 'done' | 'missed' | 'empty'

const CURRENT_WINDOW_LABELS: Record<RangeKind, string> = {
  day: 'Today',
  week: 'Week-to-Date',
  month: 'Month-to-Date',
  year: 'Year-to-Date',
}

const PAST_WINDOW_LABELS: Record<RangeKind, string> = {
  day: 'Single day',
  week: 'Full week',
  month: 'Full month',
  year: 'Full year',
}

const TONE_TEXT: Record<CompletionTone, { label: string; tooltip: string }> = {
  done: { label: 'wind-down completed', tooltip: 'completed' },
  missed: { label: 'wind-down not completed', tooltip: 'not completed' },
  empty: { label: 'no entry', tooltip: 'no entry' },
}

type InsightsPeriod = {
  range: RangeKind
  windowLabel: string
  rangeLabel: string
  loggedEntries: EveningEntry[]
  avgBedtime: string
  completionRate: number
  chartData: { date: string; label: string; bedtime: number | null }[]
  bedtimeDomain: [number, number]
  bedtimeTicks: number[]
  heatmapCells: HeatmapCell[]
}

function buildInsightsPeriod(
  range: RangeKind,
  anchor: Date,
  entryMap: Record<string, EveningEntry>,
  todayKey: string,
): InsightsPeriod {
  const info = getRangeDates(range, anchor)
  const today = toDateFromKey(todayKey)
  const isCurrent = info.start <= today && today <= info.end
  const loggedEntries = info.dates
    .map((dateKey) => entryMap[dateKey])
    .filter((entry): entry is EveningEntry => Boolean(entry))

  const chartData = info.dates.map((dateKey) => {
    const entry = entryMap[dateKey]
    return {
      date: dateKey,
      label: formatDateLabel(dateKey),
      bedtime: entry ? normalizeBedtime(entry.bedtime) : null,
    }
  })
  const bedtimes = chartData
    .map((item) => item.bedtime)
    .filter((value): value is number => value !== null)
  const chartMinimum = bedtimes.length ? Math.min(...bedtimes) : 20 * 60
  const chartMaximum = bedtimes.length ? Math.max(...bedtimes) : 28 * 60
  const chartPadding = Math.max(30, Math.min(90, (chartMaximum - chartMinimum) / 4))
  const bedtimeDomain: [number, number] = [chartMinimum - chartPadding, chartMaximum + chartPadding]
  const bedtimeTicks = Array.from({ length: 5 }, (_, index) =>
    bedtimeDomain[0] + ((bedtimeDomain[1] - bedtimeDomain[0]) * index) / 4,
  )

  // The month grid starts on Sunday, so leading blanks align the first day under its weekday.
  // The year view is a plain flow of day tiles with no weekday alignment.
  const spacer = (key: string): HeatmapCell => ({ key, date: null, tone: 'spacer', label: '', tooltip: '' })
  const leadingOffset = range === 'month' ? info.start.getDay() : 0
  const heatmapCells: HeatmapCell[] = [
    ...Array.from({ length: leadingOffset }, (_, index) => spacer(`offset-${index}`)),
    ...info.dates.map((dateKey): HeatmapCell => {
      const entry = entryMap[dateKey]
      const tone: CompletionTone = !entry ? 'empty' : entry.routineCompleted ? 'done' : 'missed'
      return {
        key: dateKey,
        date: dateKey,
        tone,
        label: `${dateKey}: ${TONE_TEXT[tone].label}`,
        tooltip: `${formatDisplayDate(toDateFromKey(dateKey))}: ${TONE_TEXT[tone].tooltip}`,
      }
    }),
  ]
  if (range === 'month') {
    const trailing = Array.from({ length: 6 * 7 - heatmapCells.length }, (_, index) => spacer(`trailing-${index}`))
    heatmapCells.push(...trailing)
  }

  return {
    range,
    windowLabel: isCurrent ? CURRENT_WINDOW_LABELS[range] : PAST_WINDOW_LABELS[range],
    rangeLabel: `${formatDisplayDate(info.start)}–${formatDisplayDate(info.end)}`,
    loggedEntries,
    avgBedtime: computeAverageBedtime(loggedEntries),
    completionRate: computeCompletionRate(loggedEntries),
    chartData,
    bedtimeDomain,
    bedtimeTicks,
    heatmapCells,
  }
}

type SleepPeriod = {
  windowLabel: string
  rangeLabel: string
  chartData: { date: string; label: string; hours: number | null }[]
  yDomain: [number, number]
  nights: SleepNight[]
  stats: SleepStats
}

function buildSleepPeriod(
  range: RangeKind,
  anchor: Date,
  nightMap: Record<string, SleepNight>,
  todayKey: string,
): SleepPeriod {
  const info = getRangeDates(range, anchor)
  const today = toDateFromKey(todayKey)
  const isCurrent = info.start <= today && today <= info.end
  const chartData = info.dates.map((dateKey) => ({
    date: dateKey,
    label: formatDateLabel(dateKey),
    hours: nightMap[dateKey]?.hours ?? null,
  }))
  const nights = info.dates.map((dateKey) => nightMap[dateKey]).filter((night): night is SleepNight => Boolean(night))
  const peakHours = Math.max(0, ...chartData.map((point) => point.hours ?? 0))
  const yMaximum = Math.max(TARGET_SLEEP_HOURS + 2, Math.ceil(peakHours) + 1)

  return {
    windowLabel: isCurrent ? CURRENT_WINDOW_LABELS[range] : PAST_WINDOW_LABELS[range],
    rangeLabel: `${formatDisplayDate(info.start)}–${formatDisplayDate(info.end)}`,
    chartData,
    yDomain: [0, yMaximum],
    nights,
    stats: computeSleepStats(nights),
  }
}

type RoutineStepRowProps = {
  step: RoutineStep
  isComplete: boolean
  onToggle: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function RoutineStepRow({ step, isComplete, onToggle, onDelete, onMove, onDragStart, onDragEnd }: RoutineStepRowProps) {
  const dragControls = useDragControls()

  const handleHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onMove(-1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      onMove(1)
    }
  }

  return (
    <Reorder.Item
      as="div"
      value={step}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01 }}
      className={`checklist-item ${isComplete ? 'complete' : ''}`}
    >
      <button type="button" className="check-toggle" onClick={onToggle} aria-label={`${isComplete ? 'Mark incomplete' : 'Mark complete'} ${step.label}`}>
        {isComplete ? <Check size={14} /> : <CircleDashed size={14} />}
      </button>
      <span>{step.label}</span>
      <div className="checklist-actions">
        <button
          type="button"
          className="drag-handle"
          onPointerDown={(event) => dragControls.start(event)}
          onKeyDown={handleHandleKeyDown}
          aria-label={`Reorder ${step.label} by dragging, or with the up and down arrow keys`}
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <button type="button" className="icon-button danger" onClick={onDelete} aria-label={`Delete ${step.label}`}>
          <Trash2 size={14} />
        </button>
      </div>
    </Reorder.Item>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('daily')
  const [todayDateKey, setTodayDateKey] = useState(() => getOperationalDateKey(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => todayDateKey)
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system'
    const saved = window.localStorage.getItem(STORAGE_KEYS.theme)
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
    try {
      const parsed: unknown = saved ? JSON.parse(saved) : null
      return parsed === 'dark' || parsed === 'light' || parsed === 'system' ? parsed : 'dark'
    } catch {
      return 'dark'
    }
  })
  const [entries, setEntries] = useState<EveningEntry[]>(() => safeParse(STORAGE_KEYS.entries, []))
  const [routineSteps, setRoutineSteps] = useState<RoutineStep[]>(() => safeParse(STORAGE_KEYS.routine, []))
  const [dailyChecklist, setDailyChecklist] = useState<DailyChecklist>(() => safeParse(STORAGE_KEYS.checklist, {}))
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(new Date()))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [routineField, setRoutineField] = useState('')
  const [insightsRange, setInsightsRange] = useState<RangeKind>('month')
  const [insightsAnchor, setInsightsAnchor] = useState(() => new Date())
  const [sleepRange, setSleepRange] = useState<RangeKind>('month')
  const [sleepAnchor, setSleepAnchor] = useState(() => new Date())
  const [sleepCalendarMonth, setSleepCalendarMonth] = useState(() => getMonthStart(new Date()))
  const [wakeUser, setWakeUser] = useState<User | null>(null)
  const [wakeTimes, setWakeTimes] = useState<Record<string, string>>({})
  const [wakeStatus, setWakeStatus] = useState<'idle' | 'ready' | 'error'>('idle')
  const [wakeError, setWakeError] = useState('')
  const [wakeBusy, setWakeBusy] = useState(false)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [cloudDataActive, setCloudDataActive] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudMessage, setCloudMessage] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const localSnapshotRef = useRef<LocalSnapshot>({ entries, routineSteps, dailyChecklist })
  const activeAuthIdRef = useRef<string | null>(null)
  const authUserId = authUser?.id

  const entryMap = useMemo(() => {
    return entries.reduce<Record<string, EveningEntry>>((acc, entry) => {
      acc[entry.date] = entry
      return acc
    }, {})
  }, [entries])

  const selectedEntry = entryMap[selectedDate] ?? null

  const [dailyForm, setDailyForm] = useState(() => {
    const initialEntry = entries.find((entry) => entry.date === selectedDate)
    return {
      date: selectedDate,
      bedtime: initialEntry?.bedtime ?? getTimeInputValue(new Date()),
      routineCompleted: initialEntry?.routineCompleted ?? false,
    }
  })

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextDateKey = getOperationalDateKey(new Date())
      setTodayDateKey((current) => current === nextDateKey ? current : nextDateKey)
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    localSnapshotRef.current = { entries, routineSteps, dailyChecklist }
  }, [entries, routineSteps, dailyChecklist])

  useEffect(() => {
    if (!supabase) return
    let isMounted = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      if (error) {
        setCloudError(`Could not read the sign-in session: ${error.message}`)
        return
      }
      const user = data.session?.user ?? null
      setAuthUser(user)
      const userId = user?.id ?? null
      if (activeAuthIdRef.current !== userId) {
        activeAuthIdRef.current = userId
        setCloudLoading(Boolean(user))
        setCloudError('')
        if (!user) setCloudDataActive(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      setAuthUser(user)
      const userId = user?.id ?? null
      if (activeAuthIdRef.current !== userId) {
        activeAuthIdRef.current = userId
        setCloudLoading(Boolean(user))
        setCloudError('')
        if (!user) setCloudDataActive(false)
      }
    })
    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !authUserId) return
    let isMounted = true

    const loadCloudData = async () => {
      const priorUserId = window.localStorage.getItem(STORAGE_KEYS.activeCloudUser)
      if (priorUserId !== authUserId) {
        if (!priorUserId || !window.localStorage.getItem(STORAGE_KEYS.localBackup)) {
          window.localStorage.setItem(STORAGE_KEYS.localBackup, JSON.stringify(localSnapshotRef.current))
        }
        window.localStorage.setItem(STORAGE_KEYS.activeCloudUser, authUserId)
      }

      const [logsResult, stepsResult, completionsResult] = await Promise.all([
        client.from('evening_logs').select('*').eq('user_id', authUserId).order('evening_date'),
        client.from('routine_steps').select('*').eq('user_id', authUserId).order('step_order'),
        client.from('routine_completions').select('*').eq('user_id', authUserId),
      ])
      const queryError = logsResult.error ?? stepsResult.error ?? completionsResult.error
      if (queryError) throw queryError

      const remoteEntries = (logsResult.data ?? []).map((row) => ({
        id: row.id,
        date: row.evening_date,
        bedtime: row.bedtime.slice(0, 5),
        routineCompleted: row.routine_completed,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
      const remoteSteps = (stepsResult.data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        order: row.step_order,
        createdAt: row.created_at,
      }))
      const remoteChecklist: DailyChecklist = {}
      ;(completionsResult.data ?? []).forEach((row) => {
        remoteChecklist[row.evening_date] ??= {}
        remoteChecklist[row.evening_date][row.step_id] = row.completed
      })
      const hasRemoteData = remoteEntries.length > 0 || remoteSteps.length > 0
      const localData = localSnapshotRef.current
      const hasLocalData =
        localData.entries.length > 0 ||
        localData.routineSteps.length > 0 ||
        Object.keys(localData.dailyChecklist).length > 0

      if (!isMounted) return
      if (hasRemoteData || !hasLocalData) {
        setEntries(remoteEntries)
        setRoutineSteps(remoteSteps)
        setDailyChecklist(remoteChecklist)
      }
      setCloudDataActive(hasRemoteData || !hasLocalData)
      setCloudMessage(
        hasRemoteData
          ? 'Your cloud account data is active. This device’s previous local data is preserved separately.'
          : hasLocalData
            ? 'Your local data is still shown and saved on this device. Import it to this account or choose cloud storage.'
            : 'Cloud account connected. New entries will be saved to your account.',
      )
    }

    void loadCloudData()
      .catch((error: unknown) => {
        if (isMounted) {
          setCloudError(`Could not load your account data: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
      .finally(() => {
        if (isMounted) setCloudLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [authUserId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries))
    }
  }, [entries])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.routine, JSON.stringify(routineSteps))
    }
  }, [routineSteps])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.checklist, JSON.stringify(dailyChecklist))
    }
  }, [dailyChecklist])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme)
    }
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldUseDark = theme === 'system' ? systemPrefersDark : theme === 'dark'
    document.documentElement.dataset.theme = shouldUseDark ? 'dark' : 'light'
  }, [theme])

  useEffect(() => {
    const client = wakeSupabase
    if (!client) return
    let isMounted = true
    void client.auth.getSession().then(({ data }) => {
      if (isMounted) setWakeUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setWakeUser(session?.user ?? null)
    })
    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Silent single sign-on for the wake-up project: if the main account is signed in and this tab has no
  // wake-up session, try Google once with prompt=none and the main account's email. Google skips the account
  // chooser when the browser already has that account. Tried once per tab so a failure can't loop.
  const mainAccountEmail = authUser?.email ?? null
  useEffect(() => {
    const client = wakeSupabase
    if (!client || !mainAccountEmail) return
    const attemptedKey = 'the-deep-sleepers.wake-silent-attempted'
    if (window.sessionStorage.getItem(attemptedKey)) return
    let isMounted = true
    void client.auth.getSession().then(({ data }) => {
      if (!isMounted || data.session) return
      window.sessionStorage.setItem(attemptedKey, '1')
      void client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'none', login_hint: mainAccountEmail },
        },
      })
    })
    return () => {
      isMounted = false
    }
  }, [mainAccountEmail])

  // Wake-up times are read every time the Sleep tab opens, so the calendar, graph and insights stay current.
  const wakeUserId = wakeUser?.id
  useEffect(() => {
    const client = wakeSupabase
    if (activeTab !== 'sleep' || !client || !wakeUserId) return
    let isMounted = true
    void client
      .from('daily_logs')
      .select('log_date, wake_up_time')
      .then(({ data, error }) => {
        if (!isMounted) return
        if (error) {
          setWakeStatus('error')
          setWakeError(`Could not read wake-up times: ${error.message}`)
          return
        }
        const next: Record<string, string> = {}
        for (const row of data ?? []) {
          // A missing or empty wake-up time means the morning has not been logged yet.
          if (row.wake_up_time) next[row.log_date] = String(row.wake_up_time).slice(0, 5)
        }
        setWakeError('')
        setWakeTimes(next)
        setWakeStatus('ready')
      })
    return () => {
      isMounted = false
    }
  }, [activeTab, wakeUserId])

  const sleepNightMap = useMemo(() => buildSleepNights(entries, wakeTimes), [entries, wakeTimes])

  const sleepPeriodAt = (offset: PeriodOffset) =>
    buildSleepPeriod(
      sleepRange,
      offset === 0 ? sleepAnchor : shiftRange(sleepRange, sleepAnchor, offset),
      sleepNightMap,
      todayDateKey,
    )

  const currentPeriod = useMemo(
    () => buildInsightsPeriod(insightsRange, insightsAnchor, entryMap, todayDateKey),
    [insightsRange, insightsAnchor, entryMap, todayDateKey],
  )

  const periodAt = (offset: PeriodOffset) =>
    offset === 0
      ? currentPeriod
      : buildInsightsPeriod(insightsRange, shiftRange(insightsRange, insightsAnchor, offset), entryMap, todayDateKey)

  const stepInsightsAnchor = (direction: -1 | 1) => {
    setInsightsAnchor((current) => shiftRange(insightsRange, current, direction))
  }

  const renderBedtimePeriod = (period: InsightsPeriod, offset: PeriodOffset) => (
    <div className="period-body">
      <div className="chart-area">
        <div className="time-axis-labels" role="group" aria-label="Bedtime axis times">
          {period.bedtimeTicks.map((tick) => <span key={tick}>{formatMinutesAsTime(tick)}</span>)}
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={248}>
            <AreaChart data={period.chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`bedtimeFill-${offset}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c6d5ec" stopOpacity={0.58} />
                  <stop offset="95%" stopColor="#c6d5ec" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis
                dataKey="bedtime"
                type="number"
                domain={period.bedtimeDomain}
                ticks={period.bedtimeTicks}
                reversed
                tick={false}
                tickLine={false}
                axisLine={false}
                width={0}
              />
              <Tooltip
                formatter={(value) => (typeof value === 'number' ? formatMinutesAsTime(value) : String(value ?? ''))}
                labelFormatter={(_, payload) => {
                  const date = payload?.[0]?.payload?.date
                  return typeof date === 'string' ? formatDisplayDate(toDateFromKey(date)) : ''
                }}
              />
              <Area type="monotone" dataKey="bedtime" stroke="#c6d5ec" fill={`url(#bedtimeFill-${offset})`} strokeWidth={2} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="range-caption">{period.rangeLabel}</p>
    </div>
  )

  const renderRoutinePeriod = (period: InsightsPeriod) => (
    <div className="period-body">
      {period.range === 'month' && (
        <div className="heatmap-month-labels" aria-hidden="true">
          {weekdayLabels.map((day) => <span key={day}>{day}</span>)}
        </div>
      )}
      <HeatmapGrid cells={period.heatmapCells} range={period.range} onSelectDate={handleDateSelect} />
      <p className="range-caption">{period.rangeLabel}</p>
    </div>
  )

  const handleThemeToggle = () => {
    setTheme((current) => {
      if (current === 'system') return 'dark'
      return current === 'dark' ? 'light' : 'dark'
    })
  }

  const handleDateSelect = (nextDate: string) => {
    setSelectedDate(nextDate)
    setCalendarMonth(getMonthStart(toDateFromKey(nextDate)))
    const entry = entryMap[nextDate]
    setDailyForm({
      date: nextDate,
      bedtime: entry?.bedtime ?? getCurrentTimeInputValue(),
      routineCompleted: entry?.routineCompleted ?? false,
    })
  }

  const handleCalendarSelect = (nextDate: string) => {
    setSelectedCalendarDate((current) => current === nextDate ? null : nextDate)
    handleDateSelect(nextDate)
  }

  const openSelectedCalendarDate = () => {
    if (!selectedCalendarDate) return
    handleDateSelect(selectedCalendarDate)
    setActiveTab('daily')
  }

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setCloudError('Google sign-in is not enabled for this build. Add the Supabase URL and anon key to the deployment environment, then rebuild.')
      return
    }
    setCloudBusy(true)
    setCloudError('')
    try {
      if (!window.localStorage.getItem(STORAGE_KEYS.activeCloudUser)) {
        const snapshot: LocalSnapshot = { entries, routineSteps, dailyChecklist }
        window.localStorage.setItem(STORAGE_KEYS.localBackup, JSON.stringify(snapshot))
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    } catch (error) {
      setCloudError(`Google sign-in could not be started: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCloudBusy(false)
    }
  }

  const handleGoogleSignOut = async () => {
    if (!supabase) return
    setCloudBusy(true)
    setCloudError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      const backup = safeParse<LocalSnapshot | null>(STORAGE_KEYS.localBackup, null)
      if (backup) {
        setEntries(backup.entries)
        setRoutineSteps(backup.routineSteps)
        setDailyChecklist(backup.dailyChecklist)
      }
      window.localStorage.removeItem(STORAGE_KEYS.activeCloudUser)
      setAuthUser(null)
      setCloudDataActive(false)
      setCloudMessage('Signed out. Your local data has been restored on this device.')
    } catch (error) {
      setCloudError(`Could not sign out: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCloudBusy(false)
    }
  }

  const handleUseCloudData = () => {
    const confirmed = window.confirm('Use the cloud account as the active data source? Your existing local data remains saved separately on this device and will not be deleted.')
    if (!confirmed) return
    setEntries([])
    setRoutineSteps([])
    setDailyChecklist({})
    setCloudDataActive(true)
    setCloudMessage('Cloud storage is active. New check-ins and routine changes will sync to your account.')
  }

  const handleUseLocalBackup = () => {
    const backup = safeParse<LocalSnapshot | null>(STORAGE_KEYS.localBackup, null)
    if (!backup) {
      setCloudError('No saved local backup was found on this device.')
      return
    }
    setEntries(backup.entries)
    setRoutineSteps(backup.routineSteps)
    setDailyChecklist(backup.dailyChecklist)
    setCloudDataActive(false)
    setCloudMessage('Local data is active on this device. It remains separate from your cloud account.')
  }

  const handleImportLocalData = async () => {
    if (!supabase || !authUser) return
    const backup = safeParse<LocalSnapshot | null>(STORAGE_KEYS.localBackup, null)
    if (!backup) {
      setCloudError('No saved local backup was found on this device.')
      return
    }
    const approved = window.confirm('Import this device’s saved bedtime records, routine steps, and checked items into your cloud account? Records on matching dates will be replaced by the local backup. Your local backup will remain on this device.')
    if (!approved) return

    setCloudBusy(true)
    setCloudError('')
    try {
      if (backup.entries.length) {
        const { error } = await supabase.from('evening_logs').upsert(
          backup.entries.map((entry) => ({
            user_id: authUser.id,
            evening_date: entry.date,
            bedtime: entry.bedtime,
            routine_completed: entry.routineCompleted,
          })),
          { onConflict: 'user_id,evening_date' },
        )
        if (error) throw error
      }
      if (backup.routineSteps.length) {
        const { error } = await supabase.from('routine_steps').upsert(
          backup.routineSteps.map((step) => ({
            id: step.id,
            user_id: authUser.id,
            label: step.label,
            step_order: step.order,
          })),
          { onConflict: 'id' },
        )
        if (error) throw error
      }
      const completionRows = Object.entries(backup.dailyChecklist).flatMap(([date, checkedSteps]) =>
        Object.entries(checkedSteps)
          .map(([stepId, completed]) => ({
            user_id: authUser.id,
            step_id: stepId,
            evening_date: date,
            completed,
          })),
      )
      if (completionRows.length) {
        const { error } = await supabase.from('routine_completions').upsert(completionRows, {
          onConflict: 'user_id,step_id,evening_date',
        })
        if (error) throw error
      }
      setEntries(backup.entries)
      setRoutineSteps(backup.routineSteps)
      setDailyChecklist(backup.dailyChecklist)
      setCloudDataActive(true)
      setCloudMessage('Local data imported. This device’s original local backup is preserved.')
    } catch (error) {
      setCloudError(`Local data import failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCloudBusy(false)
    }
  }

  const handleDailySave = async () => {
    if (cloudLoading) return
    setSaveStatus('saving')
    setSaveMessage('')
    setCloudError('')

    if (!dailyForm.bedtime) {
      setSaveStatus('error')
      setSaveMessage('Please choose a bedtime before saving.')
      return
    }

    const nextEntry: EveningEntry = {
      id: selectedEntry?.id ?? crypto.randomUUID(),
      date: dailyForm.date,
      bedtime: dailyForm.bedtime,
      routineCompleted: dailyForm.routineCompleted,
      createdAt: selectedEntry?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (supabase && authUser && cloudDataActive) {
      try {
        const { error } = await supabase.from('evening_logs').upsert({
          user_id: authUser.id,
          evening_date: nextEntry.date,
          bedtime: nextEntry.bedtime,
          routine_completed: nextEntry.routineCompleted,
        }, { onConflict: 'user_id,evening_date' })
        if (error) throw error
      } catch (error) {
        setSaveStatus('error')
        setSaveMessage(`Could not save to your account: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }

    setEntries((current) => {
      const next = [...current.filter((item) => item.date !== dailyForm.date), nextEntry]
      return next.sort((left, right) => left.date.localeCompare(right.date))
    })
    setSaveStatus('success')
    setSaveMessage(cloudDataActive ? 'Your check-in was saved to your account.' : 'Your check-in was saved on this device.')
    setSelectedDate(dailyForm.date)
  }

  const handleDeleteEntry = async (dateKey: string) => {
    if (cloudLoading) return
    const entry = entryMap[dateKey]
    if (!entry) return
    const confirmed = window.confirm(`Delete the evening record for ${formatDisplayDate(toDateFromKey(dateKey))}?`)
    if (!confirmed) return
    if (supabase && authUser && cloudDataActive) {
      try {
        const { error } = await supabase.from('evening_logs').delete().eq('user_id', authUser.id).eq('evening_date', dateKey)
        if (error) throw error
      } catch (error) {
        setCloudError(`Could not delete the account record: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }
    setEntries((current) => current.filter((item) => item.date !== dateKey))
    if (selectedDate === dateKey) {
      setDailyForm({
        date: dateKey,
        bedtime: getTimeInputValue(new Date()),
        routineCompleted: false,
      })
    }
  }

  const handleAddRoutineStep = async () => {
    if (cloudLoading) return
    if (!routineField.trim()) return
    const step: RoutineStep = {
      id: crypto.randomUUID(),
      label: routineField.trim(),
      order: routineSteps.length + 1,
      createdAt: new Date().toISOString(),
    }
    if (supabase && authUser && cloudDataActive) {
      try {
        const { error } = await supabase.from('routine_steps').insert({
          id: step.id,
          user_id: authUser.id,
          label: step.label,
          step_order: step.order,
        })
        if (error) throw error
      } catch (error) {
        setCloudError(`Could not save the routine step: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }
    setRoutineSteps((current) => [...current, step])
    setRoutineField('')
  }

  const handleDeleteRoutineStep = async (stepId: string) => {
    if (cloudLoading) return
    if (supabase && authUser && cloudDataActive) {
      try {
        const { error } = await supabase.from('routine_steps').delete().eq('user_id', authUser.id).eq('id', stepId)
        if (error) throw error
      } catch (error) {
        setCloudError(`Could not delete the routine step: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }
    setRoutineSteps((current) => current.filter((step) => step.id !== stepId))
    setDailyChecklist((current) => {
      const next = { ...current }
      Object.keys(next).forEach((dateKey) => {
        if (next[dateKey] && Object.hasOwn(next[dateKey], stepId)) {
          delete next[dateKey][stepId]
        }
        if (Object.keys(next[dateKey]).length === 0) {
          delete next[dateKey]
        }
      })
      return next
    })
  }

  const persistRoutineOrder = async (nextOrder: RoutineStep[], fallbackOrder: RoutineStep[]) => {
    const reordered = nextOrder.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 }))
    if (supabase && authUser && cloudDataActive) {
      try {
        const { error } = await supabase.from('routine_steps').upsert(
          reordered.map((step) => ({
            id: step.id,
            user_id: authUser.id,
            label: step.label,
            step_order: step.order,
          })),
          { onConflict: 'id' },
        )
        if (error) throw error
      } catch (error) {
        setCloudError(`Could not reorder routine steps: ${error instanceof Error ? error.message : String(error)}`)
        setRoutineSteps(fallbackOrder)
        return
      }
    }
    setRoutineSteps(reordered)
  }

  // Drag reorders update the list live; the order is saved once, on drop, and rolled back if the save fails.
  const routineDragRef = useRef<{ start: RoutineStep[]; latest: RoutineStep[] | null } | null>(null)

  const handleRoutineDragStart = () => {
    routineDragRef.current = { start: routineSteps, latest: null }
  }

  const handleRoutineReorder = (nextOrder: RoutineStep[]) => {
    if (routineDragRef.current) routineDragRef.current.latest = nextOrder
    setRoutineSteps(nextOrder)
  }

  const handleRoutineDragEnd = () => {
    const drag = routineDragRef.current
    routineDragRef.current = null
    if (drag?.latest) void persistRoutineOrder(drag.latest, drag.start)
  }

  const moveRoutineStep = (stepId: string, direction: -1 | 1) => {
    if (cloudLoading) return
    const index = routineSteps.findIndex((step) => step.id === stepId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= routineSteps.length) return
    const nextOrder = [...routineSteps]
    const [item] = nextOrder.splice(index, 1)
    nextOrder.splice(targetIndex, 0, item)
    void persistRoutineOrder(nextOrder, routineSteps)
  }

  const toggleChecklistItem = async (stepId: string) => {
    if (cloudLoading) return
    const completed = !(dailyChecklist[selectedDate]?.[stepId] ?? false)
    if (supabase && authUser && cloudDataActive) {
      try {
        const { error } = await supabase.from('routine_completions').upsert({
          user_id: authUser.id,
          step_id: stepId,
          evening_date: selectedDate,
          completed,
        }, { onConflict: 'user_id,step_id,evening_date' })
        if (error) throw error
      } catch (error) {
        setCloudError(`Could not save this routine completion: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }
    setDailyChecklist((current) => ({
      ...current,
      [selectedDate]: {
        ...(current[selectedDate] ?? {}),
        [stepId]: completed,
      },
    }))
  }

  const canAdvanceRange = () => {
    const nextAnchor = shiftRange(insightsRange, insightsAnchor, 1)
    const nextRange = getRangeDates(insightsRange, nextAnchor)
    return nextRange.start <= toDateFromKey(todayDateKey)
  }

  const canAdvanceSleep = () => {
    const nextAnchor = shiftRange(sleepRange, sleepAnchor, 1)
    return getRangeDates(sleepRange, nextAnchor).start <= toDateFromKey(todayDateKey)
  }

  const handleConnectWakeApp = async () => {
    if (!wakeSupabase) return
    setWakeBusy(true)
    setWakeError('')
    try {
      const { error } = await wakeSupabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: authUser?.email ? { login_hint: authUser.email } : undefined,
        },
      })
      if (error) throw error
    } catch (error) {
      setWakeError(`Wake-up app sign-in could not be started: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setWakeBusy(false)
    }
  }

  const handleDisconnectWakeApp = async () => {
    if (!wakeSupabase) return
    setWakeBusy(true)
    setWakeError('')
    try {
      // Local scope signs this device out of the wake-up project only; the main account stays signed in.
      const { error } = await wakeSupabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      setWakeUser(null)
      setWakeTimes({})
      setWakeStatus('idle')
    } catch (error) {
      setWakeError(`Could not disconnect the wake-up app: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setWakeBusy(false)
    }
  }

  const stepSleepAnchor = (direction: -1 | 1) => {
    setSleepAnchor((current) => shiftRange(sleepRange, current, direction))
  }

  const currentSleep = sleepPeriodAt(0)
  const sleepStats = currentSleep.stats
  const todayDate = toDateFromKey(todayDateKey)
  const nextSleepMonthAvailable = addMonths(sleepCalendarMonth, 1) <= getMonthStart(todayDate)

  const renderSleepPeriod = (period: SleepPeriod) => (
    <div className="period-body">
      <div className="chart-area">
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={248}>
            <LineChart data={period.chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis
              domain={period.yDomain}
              allowDecimals={false}
              tickFormatter={(value: number) => `${value}h`}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <ReferenceLine y={TARGET_SLEEP_HOURS} stroke="rgba(240, 200, 113, 0.55)" strokeDasharray="6 4" />
            <Tooltip
              formatter={(value) => (typeof value === 'number' ? formatHoursLong(value) : 'No hours yet')}
              labelFormatter={(_, payload) => {
                const date = payload?.[0]?.payload?.date
                return typeof date === 'string' ? formatDisplayDate(toDateFromKey(date)) : ''
              }}
            />
            <Line
              type="monotone"
              dataKey="hours"
              name="Sleep"
              stroke="#f0c871"
              strokeWidth={2}
              dot={period.chartData.length > 62 ? false : { r: 3, fill: '#f0c871' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>
      <p className="range-caption">{period.rangeLabel}</p>
    </div>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-button ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-label={label}
              title={label}
            >
              {id === 'daily' ? (
                <img className="nav-moon-logo" src="/deep-sleepers-logo.jpg" alt="" />
              ) : (
                <Icon size={18} />
              )}
            </button>
          ))}
        </nav>
      </aside>

      <div className="content-wrap">
        <header className="topbar">
          <div className="header-title">
            <div className="header-brand">
              <img src="/deep-sleepers-logo.jpg" alt="" />
              <strong>TheDeepSleepers</strong>
            </div>
            <h1>
              {activeTab === 'daily' && 'Good evening'}
              {activeTab === 'history' && 'History'}
              {activeTab === 'insights' && 'Insights'}
              {activeTab === 'sleep' && 'Sleep'}
              {activeTab === 'routine' && 'My routine'}
              {activeTab === 'settings' && 'Settings'}
            </h1>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={handleThemeToggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <SunMoon size={18} />
          </button>
        </header>

        <main className={`page-body ${cloudLoading ? 'cloud-pending' : ''}`}>
          {cloudLoading && <p className="cloud-loading-notice" role="status">Syncing your account data…</p>}
          {cloudError && <p className="cloud-alert" role="alert">{cloudError}</p>}
          {activeTab === 'daily' && (
            <motion.section className="panel daily-layout daily-centered" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-card form-panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Daily check-in</p>
                    <h2>Log tonight</h2>
                  </div>
                </div>

                <div className="field-stack">
                  <label className="field-label">
                    Evening date
                    <input
                      type="date"
                      value={dailyForm.date}
                      onChange={(event) => event.target.value && handleDateSelect(event.target.value)}
                    />
                  </label>

                  <label className="field-label">
                    Bedtime
                    <input
                      type="time"
                      value={dailyForm.bedtime}
                      onChange={(event) => setDailyForm((current) => ({ ...current, bedtime: event.target.value }))}
                    />
                  </label>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={dailyForm.routineCompleted}
                      onChange={(event) =>
                        setDailyForm((current) => ({ ...current, routineCompleted: event.target.checked }))
                      }
                    />
                    <span>Did you complete your wind-down routine tonight?</span>
                  </label>

                </div>

                <div className="status-row">
                  <button type="button" className="primary-button" onClick={handleDailySave}>
                    <Save size={16} />
                    {selectedEntry ? 'Update evening' : 'Save evening'}
                  </button>
                  {selectedEntry && (
                    <button type="button" className="ghost-button danger" onClick={() => handleDeleteEntry(selectedDate)}>
                      <Trash2 size={16} />
                      Delete
                    </button>
                  )}
                </div>

                <div className={`form-feedback ${saveStatus}`} aria-live="polite">
                  {saveStatus === 'saving' && 'Saving your evening...'}
                  {saveStatus === 'success' && saveMessage}
                  {saveStatus === 'error' && saveMessage}
                  {saveStatus === 'idle' && 'A calm evening routine starts with a single check-in.'}
                </div>
              </div>

            </motion.section>
          )}

          {activeTab === 'history' && (
            <section className="panel history-layout">
              <div className="panel-card calendar-card">
                <div className="calendar-toolbar">
                  <button type="button" className="icon-button" onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} aria-label="Previous month">
                    <ChevronLeft size={16} />
                  </button>
                  <strong>{formatMonthLabel(calendarMonth)}</strong>
                  <button type="button" className="icon-button" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} aria-label="Next month">
                    <ChevronRight size={16} />
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setCalendarMonth(getMonthStart(toDateFromKey(todayDateKey)))}>
                    Today
                  </button>
                </div>

                <div className="weekday-row">
                  {weekdayLabels.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="calendar-grid">
                  {Array.from({ length: getMonthGridOffset(calendarMonth) }, (_, index) => (
                    <div key={`placeholder-${index}`} className="calendar-cell placeholder" aria-hidden="true" />
                  ))}

                  {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
                    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1)
                    const dateKey = getLocalDateKey(date)
                    const entry = entryMap[dateKey]
                    const isToday = dateKey === todayDateKey

                    return (
                      <div
                        key={dateKey}
                        className={`calendar-cell ${isToday ? 'today' : ''} ${entry ? 'filled' : ''} ${selectedCalendarDate === dateKey ? 'selected' : ''} ${dateKey > todayDateKey ? 'future' : ''}`}
                      >
                        <button
                          type="button"
                          className="calendar-date-target"
                          disabled={dateKey > todayDateKey}
                          aria-label={`${formatDisplayDate(date)}${entry ? `, bedtime ${formatTimeAsClock(entry.bedtime)}, wind-down ${entry.routineCompleted ? 'completed' : 'not completed'}` : ', no bedtime logged'}`}
                          onClick={() => handleCalendarSelect(dateKey)}
                        >
                          <span className="calendar-date">{date.getDate()}</span>
                          {entry && (
                            <span className="calendar-entry">
                              <span>{formatTimeAsClock(entry.bedtime)}</span>
                              {entry.routineCompleted ? <Check className="calendar-complete" size={15} /> : <X className="calendar-missed" size={15} />}
                            </span>
                          )}
                        </button>
                        <span className="calendar-actions">
                          {entry ? (
                            <>
                              <button type="button" aria-label={`Edit ${formatDisplayDate(date)}`} title="Edit entry" onClick={() => { handleDateSelect(dateKey); setActiveTab('daily') }}>
                                <PencilLine size={14} />
                              </button>
                              <button type="button" aria-label={`Delete ${formatDisplayDate(date)}`} title="Delete entry" onClick={() => handleDeleteEntry(dateKey)}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button type="button" aria-label={`Add entry for ${formatDisplayDate(date)}`} title="Add entry" disabled={dateKey > todayDateKey} onClick={() => { handleDateSelect(dateKey); setActiveTab('daily') }}>
                              <Plus size={16} />
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="panel-card side-panel history-detail">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Selected evening</p>
                    <h2>{selectedCalendarDate ? formatDisplayDate(toDateFromKey(selectedCalendarDate)) : 'Choose a date'}</h2>
                  </div>
                </div>

                {!selectedCalendarDate ? (
                  <p className="empty-selection">Select a date in the calendar to view or manage its evening.</p>
                ) : entryMap[selectedCalendarDate] ? (
                  <div className="entry-detail">
                    <div className="meta-row">
                      <span>Bedtime</span>
                      <strong>{formatTimeAsClock(entryMap[selectedCalendarDate].bedtime)}</strong>
                    </div>
                    <div className="meta-row">
                      <span>Routine</span>
                      <strong>{entryMap[selectedCalendarDate].routineCompleted ? 'Completed' : 'Not completed'}</strong>
                    </div>
                    <div className="history-actions">
                      <button type="button" className="primary-button" onClick={openSelectedCalendarDate}>
                        <PencilLine size={16} />
                        Edit
                      </button>
                      <button type="button" className="ghost-button danger" onClick={() => handleDeleteEntry(selectedCalendarDate)}>
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="empty-detail">
                    <p>No record for this evening yet.</p>
                    {selectedCalendarDate <= todayDateKey && (
                      <button type="button" className="primary-button" onClick={() => setActiveTab('daily')}>
                        <Plus size={16} />
                        Add entry
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'insights' && (
            <section className="panel insights-layout">
              <div className="insights-main">
                <div className="panel-card chart-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Sleep time</p>
                      <h2>Bedtime rhythm</h2>
                    </div>
                  </div>
                  <div className="toolbar insights-toolbar">
                    <div className="segmented-control" aria-label="Bedtime range selector">
                      {(['day', 'week', 'month', 'year'] as RangeKind[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={insightsRange === option ? 'selected' : ''}
                          onClick={() => setInsightsRange(option)}
                        >
                          {option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="nav-buttons">
                      <button type="button" className="icon-button" onClick={() => stepInsightsAnchor(-1)} aria-label="Previous range">
                        <ChevronLeft size={16} />
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setInsightsAnchor(toDateFromKey(todayDateKey))}>
                        Current {insightsRange}
                      </button>
                      <button type="button" className="icon-button" onClick={() => stepInsightsAnchor(1)} disabled={!canAdvanceRange()} aria-label="Next range">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  <PeriodStrip
                    periodKey={`bedtime-${insightsRange}-${getLocalDateKey(insightsAnchor)}`}
                    canAdvance={canAdvanceRange()}
                    onStep={stepInsightsAnchor}
                    renderPeriod={(offset) => renderBedtimePeriod(periodAt(offset), offset)}
                  />
                </div>

                <div className="panel-card chart-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Wind-down rhythm</p>
                      <h2>Routine completion</h2>
                    </div>
                  </div>
                  <div className="toolbar insights-toolbar">
                    <div className="segmented-control" aria-label="Routine range selector">
                      {(['day', 'week', 'month', 'year'] as RangeKind[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={insightsRange === option ? 'selected' : ''}
                          onClick={() => setInsightsRange(option)}
                        >
                          {option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="nav-buttons">
                      <button type="button" className="icon-button" onClick={() => stepInsightsAnchor(-1)} aria-label="Previous range">
                        <ChevronLeft size={16} />
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setInsightsAnchor(toDateFromKey(todayDateKey))}>
                        Current {insightsRange}
                      </button>
                      <button type="button" className="icon-button" onClick={() => stepInsightsAnchor(1)} disabled={!canAdvanceRange()} aria-label="Next range">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  <PeriodStrip
                    periodKey={`routine-${insightsRange}-${getLocalDateKey(insightsAnchor)}`}
                    canAdvance={canAdvanceRange()}
                    onStep={stepInsightsAnchor}
                    renderPeriod={(offset) => renderRoutinePeriod(periodAt(offset))}
                  />
                  <div className="heatmap-legend">
                    <span><i className="legend-tile done" /> Completed</span>
                    <span><i className="legend-tile missed" /> Not completed</span>
                    <span><i className="legend-tile empty" /> No entry</span>
                  </div>
                </div>
              </div>

              <aside className="metrics-panel">
                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Typical bedtime · {currentPeriod.windowLabel}</p>
                    <strong>{currentPeriod.avgBedtime}</strong>
                    <span>Across {currentPeriod.loggedEntries.length} logged {currentPeriod.loggedEntries.length === 1 ? 'evening' : 'evenings'} in this period.</span>
                    <span className="insight-range">{currentPeriod.rangeLabel}</span>
                  </div>
                </div>
                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Routine rhythm · {currentPeriod.windowLabel}</p>
                    <strong>{currentPeriod.loggedEntries.length ? `${currentPeriod.completionRate}%` : 'No entries'}</strong>
                    <span>Wind-down completion for {currentPeriod.rangeLabel}.</span>
                  </div>
                </div>
                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Logged evenings · {currentPeriod.windowLabel}</p>
                    <strong>{currentPeriod.loggedEntries.length}</strong>
                    <span>Evening bedtime records in the selected period.</span>
                    <span className="insight-range">{currentPeriod.rangeLabel}</span>
                  </div>
                </div>
              </aside>
            </section>
          )}

          {activeTab === 'sleep' && (
            <section className="panel insights-layout sleep-layout">
              <div className="insights-main">
                <div className="panel-card wake-status">
                  <div>
                    <p className="eyebrow">Wake-up data</p>
                    <p className="settings-copy">
                      {!wakeSupabaseConfigured
                        ? 'The wake-up app is not configured for this build. Add its URL and key to the deployment environment, then rebuild.'
                        : wakeUser
                          ? `Connected as ${wakeUser.email ?? 'Google account'}. Sleep hours fill in once the morning after a night is logged.`
                          : 'Connect the wake-up app to calculate sleep hours from your logged wake-up times.'}
                    </p>
                    {wakeSupabaseConfigured && wakeUser && wakeStatus === 'idle' && (
                      <p className="settings-hint" role="status">Reading wake-up times…</p>
                    )}
                    {wakeError && <p className="cloud-alert" role="alert">{wakeError}</p>}
                  </div>
                  {wakeSupabaseConfigured && (
                    wakeUser ? (
                      <button type="button" className="ghost-button" onClick={handleDisconnectWakeApp} disabled={wakeBusy}>
                        <LogOut size={16} />
                        Disconnect
                      </button>
                    ) : (
                      <button type="button" className="primary-button" onClick={handleConnectWakeApp} disabled={wakeBusy}>
                        <ShieldCheck size={16} />
                        {wakeBusy ? 'Connecting…' : 'Connect wake-up app'}
                      </button>
                    )
                  )}
                </div>

                <div className="panel-card calendar-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Sleep calendar</p>
                      <h2>Hours slept each night</h2>
                    </div>
                  </div>
                  <div className="calendar-toolbar">
                    <button type="button" className="icon-button" onClick={() => setSleepCalendarMonth(addMonths(sleepCalendarMonth, -1))} aria-label="Previous month">
                      <ChevronLeft size={16} />
                    </button>
                    <strong>{formatMonthLabel(sleepCalendarMonth)}</strong>
                    <button type="button" className="icon-button" onClick={() => setSleepCalendarMonth(addMonths(sleepCalendarMonth, 1))} disabled={!nextSleepMonthAvailable} aria-label="Next month">
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setSleepCalendarMonth(getMonthStart(todayDate))}>
                      Today
                    </button>
                  </div>

                  <div className="weekday-row">
                    {weekdayLabels.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>

                  <div className="calendar-grid">
                    {Array.from({ length: getMonthGridOffset(sleepCalendarMonth) }, (_, index) => (
                      <div key={`sleep-placeholder-${index}`} className="calendar-cell placeholder" aria-hidden="true" />
                    ))}

                    {Array.from({ length: new Date(sleepCalendarMonth.getFullYear(), sleepCalendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
                      const date = new Date(sleepCalendarMonth.getFullYear(), sleepCalendarMonth.getMonth(), index + 1)
                      const dateKey = getLocalDateKey(date)
                      const night = sleepNightMap[dateKey]
                      const hours = night?.hours ?? null
                      const tone = hours === null ? 'unmeasured' : hours >= MIN_SLEEP_HOURS ? 'rested' : 'short'
                      const tooltip = night
                        ? `Bed ${formatTimeAsClock(night.bedtime)} · Wake ${night.wakeTime ? formatTimeAsClock(night.wakeTime) : 'not logged yet'}`
                        : 'No bedtime logged'

                      return (
                        <div
                          key={dateKey}
                          className={`calendar-cell sleep-day ${tone} ${dateKey === todayDateKey ? 'today' : ''} ${dateKey > todayDateKey ? 'future' : ''}`}
                          title={tooltip}
                          aria-label={`${formatDisplayDate(date)}: ${hours === null ? 'no sleep hours yet' : formatHoursLong(hours)}. ${tooltip}`}
                        >
                          <span className="calendar-date">{date.getDate()}</span>
                          <span className="sleep-hours">{hours === null ? '—' : formatHoursShort(hours)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="panel-card chart-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Sleep graph</p>
                      <h2>Hours slept</h2>
                    </div>
                  </div>
                  <div className="toolbar sleep-toolbar">
                    <div className="segmented-control" aria-label="Sleep range selector">
                      {(['day', 'week', 'month', 'year'] as RangeKind[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={sleepRange === option ? 'selected' : ''}
                          onClick={() => setSleepRange(option)}
                        >
                          {option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="nav-buttons">
                      <button type="button" className="icon-button" onClick={() => stepSleepAnchor(-1)} aria-label="Previous range">
                        <ChevronLeft size={16} />
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setSleepAnchor(toDateFromKey(todayDateKey))}>
                        Current {sleepRange}
                      </button>
                      <button type="button" className="icon-button" onClick={() => stepSleepAnchor(1)} disabled={!canAdvanceSleep()} aria-label="Next range">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  <PeriodStrip
                    periodKey={`sleep-${sleepRange}-${getLocalDateKey(sleepAnchor)}`}
                    canAdvance={canAdvanceSleep()}
                    onStep={stepSleepAnchor}
                    renderPeriod={(offset) => renderSleepPeriod(sleepPeriodAt(offset))}
                  />
                  <p className="settings-hint">The dashed line marks the {TARGET_SLEEP_HOURS}-hour target. Gaps mean no wake-up or bedtime is logged for that night.</p>
                </div>
              </div>

              <aside className="metrics-panel">
                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Average sleep · {currentSleep.windowLabel}</p>
                    <strong>{sleepStats.averageHours !== null ? formatHoursLong(sleepStats.averageHours) : 'No sleep data'}</strong>
                    <span>
                      {sleepStats.measuredNights} measured of {sleepStats.loggedNights} logged {sleepStats.loggedNights === 1 ? 'night' : 'nights'}.
                    </span>
                    <span className="insight-range">{currentSleep.rangeLabel}</span>
                  </div>
                </div>

                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Nights at {MIN_SLEEP_HOURS}h or more · {currentSleep.windowLabel}</p>
                    <strong>{sleepStats.shareAtMinimum !== null ? `${sleepStats.shareAtMinimum}%` : 'No data'}</strong>
                    <span>Share of measured nights that reached {MIN_SLEEP_HOURS} hours.</span>
                  </div>
                </div>

                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Consistency · {currentSleep.windowLabel}</p>
                    <strong>{sleepStats.spreadHours !== null ? `±${formatHoursLong(sleepStats.spreadHours)}` : 'No data'}</strong>
                    <span>Typical swing from one night to the next. Lower means steadier.</span>
                  </div>
                </div>

                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Balance vs {TARGET_SLEEP_HOURS}h · {currentSleep.windowLabel}</p>
                    <strong>
                      {sleepStats.balanceHours !== null
                        ? `${sleepStats.balanceHours >= 0 ? '+' : ''}${formatHoursLong(sleepStats.balanceHours)}`
                        : 'No data'}
                    </strong>
                    <span>Total hours over or under {TARGET_SLEEP_HOURS} across measured nights.</span>
                  </div>
                </div>

                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Best and shortest · {currentSleep.windowLabel}</p>
                    <strong>{sleepStats.longest ? formatHoursLong(sleepStats.longest.hours ?? 0) : 'No data'}</strong>
                    {sleepStats.longest && sleepStats.shortest && (
                      <span>
                        Longest {formatDisplayDate(toDateFromKey(sleepStats.longest.date))} · shortest{' '}
                        {formatHoursLong(sleepStats.shortest.hours ?? 0)} on {formatDisplayDate(toDateFromKey(sleepStats.shortest.date))}
                      </span>
                    )}
                  </div>
                </div>

                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Weekend vs weekday · {currentSleep.windowLabel}</p>
                    <strong>
                      {sleepStats.weekendAverage !== null && sleepStats.weekdayAverage !== null
                        ? `${sleepStats.weekendAverage - sleepStats.weekdayAverage >= 0 ? '+' : ''}${formatHoursLong(sleepStats.weekendAverage - sleepStats.weekdayAverage)}`
                        : 'No data'}
                    </strong>
                    <span>
                      Friday and Saturday nights average {sleepStats.weekendAverage !== null ? formatHoursLong(sleepStats.weekendAverage) : '—'}; other nights {sleepStats.weekdayAverage !== null ? formatHoursLong(sleepStats.weekdayAverage) : '—'}.
                    </span>
                  </div>
                </div>

                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Typical wake-up · {currentSleep.windowLabel}</p>
                    <strong>{sleepStats.averageWakeMinutes !== null ? formatMinutesOfClock(sleepStats.averageWakeMinutes) : 'No wake-ups'}</strong>
                    {sleepStats.wakeSpreadMinutes !== null && (
                      <span>Typically within ±{Math.round(sleepStats.wakeSpreadMinutes)} minutes of that time.</span>
                    )}
                  </div>
                </div>
              </aside>
            </section>
          )}

          {activeTab === 'routine' && (
            <section className="panel routine-layout">
              <div className="panel-card routine-main">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Your ritual</p>
                    <h2>Build your evening routine</h2>
                  </div>
                </div>
                <p className="section-copy">Define your own wind-down steps and mark what you completed for the selected evening.</p>

                <form
                  className="routine-add-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleAddRoutineStep()
                  }}
                >
                  <input
                    type="text"
                    value={routineField}
                    placeholder="Add a new routine step"
                    onChange={(event) => setRoutineField(event.target.value)}
                  />
                  <button type="submit" className="primary-button" disabled={cloudLoading}>
                    <Plus size={16} />
                    Add
                  </button>
                </form>

                {routineSteps.length ? (
                  <Reorder.Group as="div" axis="y" values={routineSteps} onReorder={handleRoutineReorder} className="checklist-list">
                    {routineSteps.map((step) => (
                      <RoutineStepRow
                        key={step.id}
                        step={step}
                        isComplete={Boolean(dailyChecklist[selectedDate]?.[step.id])}
                        onToggle={() => toggleChecklistItem(step.id)}
                        onDelete={() => handleDeleteRoutineStep(step.id)}
                        onMove={(direction) => moveRoutineStep(step.id, direction)}
                        onDragStart={handleRoutineDragStart}
                        onDragEnd={handleRoutineDragEnd}
                      />
                    ))}
                  </Reorder.Group>
                ) : (
                  <div className="empty-panel">No routine steps yet. Add one to start your evening sequence.</div>
                )}
              </div>

              <aside className="panel-card side-panel routine-side">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Selected date</p>
                    <h2>{formatDisplayDate(toDateFromKey(selectedDate))}</h2>
                  </div>
                </div>

                <div className="progress-card">
                  <strong>{routineSteps.filter((step) => Boolean(dailyChecklist[selectedDate]?.[step.id])).length}/{routineSteps.length}</strong>
                  <span>steps completed</span>
                </div>

                <div className="mini-summary">
                  <div className="mini-item">
                    <ListTodo size={16} />
                    <span>{routineSteps.length} total steps</span>
                  </div>
                  <div className="mini-item">
                    <Coffee size={16} />
                    <span>{dailyChecklist[selectedDate] ? 'Check-in ready' : 'Start your routine'}</span>
                  </div>
                </div>
              </aside>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="panel settings-layout">
              <div className="settings-col">
                <div className="panel-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Account</p>
                      <h2>Google sign-in</h2>
                    </div>
                  </div>
                  <p className="settings-copy">
                    {authUser
                      ? `Signed in as ${authUser.email ?? 'Google account'}. ${cloudMessage}`
                      : 'Sign in to sync your sleep records and routine across devices.'}
                  </p>
                  {supabaseConfigured && supabase ? (
                    <>
                      {cloudLoading ? (
                        <p className="settings-hint" role="status">Loading account data…</p>
                      ) : authUser ? (
                        <div className="settings-actions">
                          <button type="button" className="ghost-button" onClick={handleGoogleSignOut} disabled={cloudBusy}>
                            <LogOut size={16} />
                            Sign out
                          </button>
                          {cloudDataActive ? (
                            <button type="button" className="ghost-button" onClick={handleUseLocalBackup} disabled={cloudBusy}>
                              <Cloud size={16} />
                              Use local backup
                            </button>
                          ) : (
                            <>
                              <button type="button" className="primary-button" onClick={handleUseCloudData} disabled={cloudBusy}>
                                <Cloud size={16} />
                                Use cloud storage
                              </button>
                              <button type="button" className="ghost-button" onClick={handleImportLocalData} disabled={cloudBusy}>
                                <Plus size={16} />
                                Import local data
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <button type="button" className="primary-button" onClick={handleGoogleSignIn} disabled={cloudBusy}>
                          <ShieldCheck size={16} />
                          {cloudBusy ? 'Connecting…' : 'Continue with Google'}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" className="primary-button" onClick={handleGoogleSignIn}>
                        <ShieldCheck size={16} />
                        Continue with Google
                      </button>
                      <p className="settings-hint">Sign-in is not configured for this build yet. Your data is saved locally in this browser.</p>
                    </>
                  )}
                </div>

                <div className="panel-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Feedback</p>
                      <h2>Support</h2>
                    </div>
                  </div>
                  <a className="link-button" href={SUPPORT_URL} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    Ko-fi support
                  </a>
                  <a className="link-button" href="mailto:hello@theeveningclub.app?subject=TheDeepSleepers%20feedback">
                    <Mail size={16} />
                    Send feedback
                  </a>
                </div>

                <div className="panel-card fine-print-panel">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Fine print</p>
                      <h2>Privacy, terms, and licenses</h2>
                    </div>
                  </div>
                  <div className="fine-print-body">
                    <p>
                      TheDeepSleepers stores bedtime and routine entries locally in the browser by default. Optional Supabase sync keeps data in your own authenticated account with Row Level Security enforced in the configured database.
                    </p>
                    <p>
                      This app is a personal sleep routine tracker and does not replace medical advice. Bedtime and routine data are self-reported observations, not clinical assessments.
                    </p>
                    <p>
                      Copyright © 2026 TheDeepSleepers. Third-party software and assets retain their respective licenses.
                    </p>
                  </div>
                </div>
              </div>

              <div className="settings-col right-col">
                <div className="panel-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">App info</p>
                      <h2>TheDeepSleepers</h2>
                    </div>
                  </div>
                  <div className="meta-row">
                    <span>Version</span>
                    <strong>0.1.0</strong>
                  </div>
                  <div className="meta-row">
                    <span>Support</span>
                    <strong>{SUPPORT_URL}</strong>
                  </div>
                  <div className="meta-row">
                    <span>Local storage</span>
                    <strong>Enabled</strong>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
