import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Coffee,
  Cloud,
  ExternalLink,
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'
import './App.css'

type NavTab = 'daily' | 'history' | 'insights' | 'routine' | 'settings'
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
  { id: 'settings', label: 'Settings', icon: Settings },
]

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
      const dayOfWeek = (start.getDay() + 6) % 7
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
  const offset = (firstDay.getDay() + 6) % 7
  return offset
}

function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('daily')
  const [todayDateKey, setTodayDateKey] = useState(() => getLocalDateKey(new Date()))
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
      const nextDateKey = getLocalDateKey(new Date())
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

  const rangeInfo = useMemo(() => getRangeDates(insightsRange, insightsAnchor), [insightsRange, insightsAnchor])
  const rangeEntries = useMemo(() => {
    return entries.filter((entry) => {
      const dateValue = toDateFromKey(entry.date)
      return dateValue >= rangeInfo.start && dateValue <= rangeInfo.end
    })
  }, [entries, rangeInfo])

  const avgBedtime = computeAverageBedtime(rangeEntries)
  const completionRate = computeCompletionRate(rangeEntries)

  const chartData = rangeInfo.dates.map((dateKey) => {
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
  const bedtimeDomain: [number, number] = [
    chartMinimum - chartPadding,
    chartMaximum + chartPadding,
  ]
  const bedtimeTicks = Array.from({ length: 5 }, (_, index) =>
    bedtimeDomain[0] + ((bedtimeDomain[1] - bedtimeDomain[0]) * index) / 4,
  )

  const completionTileData = rangeInfo.dates.map((dateKey) => {
    const entry = entryMap[dateKey]
    return {
      date: dateKey,
      tone: !entry ? 'empty' : entry.routineCompleted ? 'done' : 'missed',
    }
  })
  const heatmapOffset =
    insightsRange === 'month' || insightsRange === 'year'
      ? (rangeInfo.start.getDay() + 6) % 7
      : 0
  const heatmapCells = [
    ...Array.from({ length: heatmapOffset }, (_, index) => ({ key: `offset-${index}`, date: null, tone: 'spacer' })),
    ...completionTileData.map((item) => ({ key: item.date, date: item.date, tone: item.tone })),
  ]
  if (insightsRange === 'year' || insightsRange === 'month') {
    const targetCellCount = insightsRange === 'year' ? 53 * 7 : 6 * 7
    const trailingCells = targetCellCount - heatmapCells.length
    heatmapCells.push(
      ...Array.from({ length: trailingCells }, (_, index) => ({
        key: `trailing-${index}`,
        date: null,
        tone: 'spacer',
      })),
    )
  }

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

  const moveRoutineStep = async (stepId: string, direction: number) => {
    if (cloudLoading) return
    const index = routineSteps.findIndex((step) => step.id === stepId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= routineSteps.length) return
    const nextSteps = [...routineSteps]
    const [item] = nextSteps.splice(index, 1)
    nextSteps.splice(targetIndex, 0, item)
    const reordered = nextSteps.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 }))
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
        return
      }
    }
    setRoutineSteps(reordered)
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
                  <div className="toolbar">
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
                      <button type="button" className="icon-button" onClick={() => setInsightsAnchor((current) => shiftRange(insightsRange, current, -1))} aria-label="Previous range">
                        <ChevronLeft size={16} />
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setInsightsAnchor(toDateFromKey(todayDateKey))}>
                        Current {insightsRange}
                      </button>
                      <button type="button" className="icon-button" onClick={() => setInsightsAnchor((current) => shiftRange(insightsRange, current, 1))} disabled={!canAdvanceRange()} aria-label="Next range">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="chart-area">
                    <div className="time-axis-labels" role="group" aria-label="Bedtime axis times">
                      {bedtimeTicks.map((tick) => <span key={tick}>{formatMinutesAsTime(tick)}</span>)}
                    </div>
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height={248}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="bedtimeFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#c6d5ec" stopOpacity={0.58} />
                              <stop offset="95%" stopColor="#c6d5ec" stopOpacity={0.04} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="4 4" />
                          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
                          <YAxis
                            dataKey="bedtime"
                            type="number"
                            domain={bedtimeDomain}
                            ticks={bedtimeTicks}
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
                          <Area type="monotone" dataKey="bedtime" stroke="#c6d5ec" fill="url(#bedtimeFill)" strokeWidth={2} connectNulls={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="range-caption">{formatDisplayDate(rangeInfo.start)}–{formatDisplayDate(rangeInfo.end)}</p>
                </div>

                <div className="panel-card chart-card">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Wind-down rhythm</p>
                      <h2>Routine completion</h2>
                    </div>
                  </div>
                  <div className="toolbar">
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
                      <button type="button" className="icon-button" onClick={() => setInsightsAnchor((current) => shiftRange(insightsRange, current, -1))} aria-label="Previous range">
                        <ChevronLeft size={16} />
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setInsightsAnchor(toDateFromKey(todayDateKey))}>
                        Current {insightsRange}
                      </button>
                      <button type="button" className="icon-button" onClick={() => setInsightsAnchor((current) => shiftRange(insightsRange, current, 1))} disabled={!canAdvanceRange()} aria-label="Next range">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                  {insightsRange === 'month' && (
                    <div className="heatmap-month-labels">
                      {weekdayLabels.map((day) => <span key={day}>{day}</span>)}
                    </div>
                  )}
                  <div className={insightsRange === 'year' ? 'heatmap-year-layout' : undefined}>
                    {insightsRange === 'year' && (
                      <div className="heatmap-year-labels" aria-hidden="true">
                        <span>Mon</span><span>Wed</span><span>Fri</span>
                      </div>
                    )}
                    <div className={`heatmap-grid ${insightsRange}`} style={insightsRange === 'year' ? { gridTemplateRows: 'repeat(7, minmax(0, 1fr))' } : { gridTemplateColumns: `repeat(${insightsRange === 'day' ? 1 : 7}, minmax(0, 1fr))` }}>
                      {heatmapCells.map((item) => item.date !== null ? (
                        <button
                          key={item.key}
                          type="button"
                          className={`heat-tile ${item.tone}`}
                          aria-label={`${item.date}: ${item.tone === 'done' ? 'wind-down completed' : item.tone === 'missed' ? 'wind-down not completed' : 'no entry'}`}
                          onClick={() => handleDateSelect(item.date)}
                          title={`${formatDisplayDate(toDateFromKey(item.date))}: ${item.tone === 'done' ? 'completed' : item.tone === 'missed' ? 'not completed' : 'no entry'}`}
                        />
                      ) : (
                        <span key={item.key} className={`heat-tile ${item.tone}`} aria-hidden="true" />
                      ))}
                    </div>
                  </div>
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
                    <p className="eyebrow">Typical bedtime</p>
                    <strong>{avgBedtime}</strong>
                    <span>Across {rangeEntries.length} logged {rangeEntries.length === 1 ? 'evening' : 'evenings'} in this period.</span>
                  </div>
                </div>
                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Routine rhythm</p>
                    <strong>{rangeEntries.length ? `${completionRate}%` : 'No entries'}</strong>
                    <span>Wind-down completion for {formatDisplayDate(rangeInfo.start)}–{formatDisplayDate(rangeInfo.end)}.</span>
                  </div>
                </div>
                <div className="panel-card insight-card">
                  <div>
                    <p className="eyebrow">Logged evenings</p>
                    <strong>{rangeEntries.length}</strong>
                    <span>Evening bedtime records in the selected period.</span>
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

                <div className="checklist-list">
                  {routineSteps.length ? (
                    routineSteps.map((step) => {
                      const isComplete = Boolean(dailyChecklist[selectedDate]?.[step.id])
                      return (
                        <div key={step.id} className={`checklist-item ${isComplete ? 'complete' : ''}`}>
                          <button type="button" className="check-toggle" onClick={() => toggleChecklistItem(step.id)} aria-label={`${isComplete ? 'Mark incomplete' : 'Mark complete'} ${step.label}`}>
                            {isComplete ? <Check size={14} /> : <CircleDashed size={14} />}
                          </button>
                          <span>{step.label}</span>
                          <div className="checklist-actions">
                            <button type="button" className="icon-button" onClick={() => moveRoutineStep(step.id, -1)} aria-label={`Move ${step.label} up`}>
                              <ChevronLeft size={14} />
                            </button>
                            <button type="button" className="icon-button" onClick={() => moveRoutineStep(step.id, 1)} aria-label={`Move ${step.label} down`}>
                              <ChevronRight size={14} />
                            </button>
                            <button type="button" className="icon-button danger" onClick={() => handleDeleteRoutineStep(step.id)} aria-label={`Delete ${step.label}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="empty-panel">No routine steps yet. Add one to start your evening sequence.</div>
                  )}
                </div>
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
