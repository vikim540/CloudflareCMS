import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../lib/api'
import { cn, getPageNumbers } from '../lib/utils'
import { LoadingState, EmptyState } from '../components/StateDisplay'

/**
 * 講座預約排期管理
 *
 * 服務類型與地點約束（對齊前端 Vue 組件 preaching-seat.vue）：
 *   '1' = SMILE Pro 2.0  → 旺角('1') + 中環('2')，需用戶選擇
 *   '2' = SMILE+ICL       → 僅中環('2')，自動鎖定
 *   '3' = 老花矯視        → 僅旺角('1')，自動鎖定
 *
 * 時段格式：'HH:mm-HH:mm'（如 '13:30-14:30'）
 *
 * 批量新增工作流（v2 — 暫存 + 單時段）：
 *   1. 選擇服務+地點 → 2. 月曆勾選日期 → 3. 單選時段（顯示在日曆數字下方）
 *   → 4. 預保存（暫存到 localStorage，不怕意外關閉）→ 5. 切換服務/地點繼續
 *   → 6. 確認完成（N 條）→ 一次性提交所有暫存批次
 */

/** 預約排期數據結構 */
interface BookingSchedule {
  id: number
  service_type: string
  location: string
  booking_date: string
  time_slot: string
  is_special: string
  special_label: string
  status: string
  sorting: number
}

/** 行內編輯表單 */
interface EditForm {
  service_type: string
  location: string
  booking_date: string
  time_slot: string
  is_special: string
  special_label: string
  status: string
}

/** 批量新增表單（單時段） */
interface BatchForm {
  service_type: string
  location: string
  dates: string[]
  time_slot: string
  is_special: string
  special_label: string
}

/** 預保存的暫存批次 */
interface StagedBatch {
  id: string
  service_type: string
  location: string
  dates: string[]
  time_slot: string
  is_special: string
  special_label: string
}

/** 服務類型選項 */
const SERVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'SMILE Pro 2.0' },
  { value: '2', label: 'SMILE+ICL' },
  { value: '3', label: '老花矯視' },
]

/** 地點標籤映射 */
const LOCATION_LABELS: Record<string, string> = {
  '1': '旺角',
  '2': '中環',
}

/**
 * 服務類型 → 允許的地點列表
 * SMILE Pro 2.0 支持旺角+中環，SMILE+ICL 僅中環，老花矯視僅旺角
 */
const SERVICE_LOCATION_CONSTRAINTS: Record<string, string[]> = {
  '1': ['1', '2'],
  '2': ['2'],
  '3': ['1'],
}

/** 預設時段選項（對齊日曆圖片中的實際時段） */
const TIME_SLOT_PRESETS = [
  '13:30-14:30',
  '14:30-15:30',
  '15:30-16:30',
  '18:30-19:30',
]

/** 時段選擇器 — 小時選項（09-22，覆蓋講座常見時段） */
const HOUR_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 9) // 9 ~ 22

/** 時段選擇器 — 分鐘選項（15 分鐘粒度） */
const MINUTE_OPTIONS = ['00', '15', '30', '45']

/** 狀態標籤映射 */
const STATUS_LABELS: Record<string, string> = {
  '1': '可用',
  '0': '停用',
}

/** 星期標頭 */
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']

/** localStorage 暫存 key */
const STAGING_KEY = 'booking_batch_staging'

/**
 * 根據服務類型推導地點
 * Service 1 需用戶選擇，Service 2 → 中環, Service 3 → 旺角
 */
function deriveLocation(serviceType: string, explicitLocation?: string): string {
  const allowed = SERVICE_LOCATION_CONSTRAINTS[serviceType]
  if (!allowed) return '1'
  if (allowed.length === 1) return allowed[0]
  if (explicitLocation && allowed.includes(explicitLocation)) return explicitLocation
  return allowed[0]
}

/** 取得服務類型標籤 */
function getServiceTypeLabel(type: string): string {
  return SERVICE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** 格式化日期為 YYYY-MM-DD */
function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 取得今天的日期字串 */
function getTodayStr(): string {
  const now = new Date()
  return formatDateStr(now.getFullYear(), now.getMonth(), now.getDate())
}

/** 生成暫存批次唯一 ID */
function genBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 提取時段開始時間（用於日曆簡短顯示） */
function slotStart(timeSlot: string): string {
  return timeSlot.split('-')[0] || timeSlot
}

/** localStorage 自定義時段歷史記錄 key */
const CUSTOM_TIME_HISTORY_KEY = 'booking_custom_time_history'
const MAX_HISTORY_ITEMS = 10

/**
 * 時段選擇器 — 點擊選擇開始時間（小時+分鐘），結束時間自動 +1 小時
 *
 * 設計目的：避免文案手動輸入符號和數字，防止格式錯誤（18：00、18:00-、18:00-17:00 等）
 * 符號「:」「-」由前端固定生成，文案只需點擊選擇
 */
function TimeSlotPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string // 當前 time_slot，如 '18:30-19:30'
  onChange: (slot: string) => void
  compact?: boolean // 編輯表單用緊湊模式
}) {
  // 從 value 解析開始時間的小時和分鐘
  const startPart = value ? value.split('-')[0] : '09:00'
  const [hStr, mStr] = startPart.split(':')
  const startHour = parseInt(hStr, 10) || 9
  const startMinute = mStr || '00'

  /** 構建時段字串：開始時間 → 結束時間（+1 小時） */
  const buildSlot = (h: number, m: string): string => {
    const start = `${String(h).padStart(2, '0')}:${m}`
    const endH = h + 1
    const end = `${String(endH).padStart(2, '0')}:${m}`
    return `${start}-${end}`
  }

  const selectClass = compact
    ? 'px-1.5 py-0.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white w-16'
    : 'px-2.5 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white'

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'flex-wrap'}`}>
      {/* 開始時間：小時 */}
      <select
        value={startHour}
        onChange={(e) => onChange(buildSlot(Number(e.target.value), startMinute))}
        className={selectClass}
      >
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, '0')}
          </option>
        ))}
      </select>
      <span className="text-sm font-medium text-muted-foreground">:</span>
      {/* 開始時間：分鐘 */}
      <select
        value={startMinute}
        onChange={(e) => onChange(buildSlot(startHour, e.target.value))}
        className={selectClass}
      >
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {/* 結束時間（自動 +1 小時，只讀顯示） */}
      <span className="text-sm text-muted-foreground px-1">→</span>
      <span className={`font-mono font-medium ${compact ? 'text-xs' : 'text-sm'} text-green-700 bg-green-50 px-2 py-0.5 rounded`}>
        {String(startHour + 1).padStart(2, '0')}:{startMinute}
      </span>
      {!compact && (
        <span className="text-xs text-muted-foreground">（自動 +1 小時）</span>
      )}
    </div>
  )
}

/** 從 localStorage 載入自定義時段歷史 */
function loadCustomTimeHistory(): string[] {
  try {
    const stored = localStorage.getItem(CUSTOM_TIME_HISTORY_KEY)
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch {
    return []
  }
}

/** 保存自定義時段到歷史記錄（去重 + 最近優先） */
function saveCustomTimeToHistory(slot: string): string[] {
  try {
    const history = loadCustomTimeHistory()
    const filtered = history.filter((s) => s !== slot)
    const updated = [slot, ...filtered].slice(0, MAX_HISTORY_ITEMS)
    localStorage.setItem(CUSTOM_TIME_HISTORY_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return loadCustomTimeHistory()
  }
}

/** 判斷時段是否為預設值 */
function isPresetTimeSlot(slot: string): boolean {
  return TIME_SLOT_PRESETS.includes(slot)
}

// ============================================================================
// 月曆日期選擇器組件（增強：顯示時段 + 標記暫存日期）
// ============================================================================
function MonthCalendar({
  selectedDates,
  onToggleDate,
  currentTimeSlot,
  stagedDateInfo,
}: {
  selectedDates: Set<string>
  onToggleDate: (date: string) => void
  /** 當前選中的時段（顯示在已選日期下方） */
  currentTimeSlot?: string
  /** 已暫存的日期 → 時段映射（用綠色標記） */
  stagedDateInfo?: Map<string, string>
}) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const todayStr = getTodayStr()
  const monthLabel = `${year}年${month + 1}月`

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
        >
          ◀
        </button>
        <span className="font-medium text-sm">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const dateStr = formatDateStr(year, month, day)
          const isSelected = selectedDates.has(dateStr)
          const isPast = dateStr < todayStr
          const isToday = dateStr === todayStr
          const stagedSlot = stagedDateInfo?.get(dateStr)
          // 當前選中日期顯示 currentTimeSlot，暫存日期顯示 stagedSlot
          const showSlot = isSelected && currentTimeSlot
            ? currentTimeSlot
            : stagedSlot && !isSelected
              ? stagedSlot
              : null

          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggleDate(dateStr)}
              disabled={isPast}
              className={cn(
                'min-h-[52px] flex flex-col items-center justify-start pt-1.5 rounded text-sm transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground font-bold'
                  : stagedSlot
                    ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                    : isPast
                      ? 'text-muted-foreground/30 cursor-not-allowed'
                      : isToday
                        ? 'border-2 border-primary text-primary hover:bg-primary/10'
                        : 'hover:bg-accent border border-transparent',
              )}
            >
              <span>{day}</span>
              {showSlot && (
                <span
                  className={cn(
                    'text-[10px] leading-tight mt-0.5 px-1 rounded',
                    isSelected ? 'bg-white/20' : 'bg-green-100 text-green-600',
                  )}
                >
                  {slotStart(showSlot)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 圖例 */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-primary" /> 已選
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-50 border border-green-200" /> 已暫存
        </span>
      </div>
    </div>
  )
}

const PAGE_SIZE = 20

export default function BookingSchedule() {
  // ─── 列表狀態 ──────────────────────────────────────────
  const [schedules, setSchedules] = useState<BookingSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // ─── 篩選狀態 ──────────────────────────────────────────
  const [filterServiceType, setFilterServiceType] = useState<string>('all')
  const [filterLocation, setFilterLocation] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // ─── 分頁狀態 ──────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ─── 批量選擇 ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // ─── 批量新增對話框 ────────────────────────────────────
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchForm, setBatchForm] = useState<BatchForm>({
    service_type: '1',
    location: '1',
    dates: [],
    time_slot: '',
    is_special: '0',
    special_label: '',
  })
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [commitProgress, setCommitProgress] = useState(0)

  // ─── 自定義時段輸入 ────────────────────────────────────
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customTimeError, setCustomTimeError] = useState('')
  const [customTimeHistory, setCustomTimeHistory] = useState<string[]>(() => loadCustomTimeHistory())

  // ─── 暫存批次（localStorage 持久化）─────────────────────
  const [stagedBatches, setStagedBatches] = useState<StagedBatch[]>(() => {
    try {
      const stored = localStorage.getItem(STAGING_KEY)
      return stored ? (JSON.parse(stored) as StagedBatch[]) : []
    } catch {
      return []
    }
  })

  // 暫存持久化到 localStorage
  useEffect(() => {
    try {
      if (stagedBatches.length > 0) {
        localStorage.setItem(STAGING_KEY, JSON.stringify(stagedBatches))
      } else {
        localStorage.removeItem(STAGING_KEY)
      }
    } catch {
      // localStorage 不可用時靜默失敗
    }
  }, [stagedBatches])

  // ─── 行內編輯 ──────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // ─── 重新載入觸發器 ────────────────────────────────────
  const [refreshCounter, setRefreshCounter] = useState(0)
  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), [])

  /** 當前篩選服務類型允許的地點選項 */
  const filterLocationOptions = useMemo(() => {
    if (filterServiceType === 'all') {
      return Object.entries(LOCATION_LABELS).map(([value, label]) => ({ value, label }))
    }
    const allowed = SERVICE_LOCATION_CONSTRAINTS[filterServiceType] ?? []
    return allowed.map((v) => ({ value: v, label: LOCATION_LABELS[v] ?? v }))
  }, [filterServiceType])

  /** 批量表單中當前服務類型允許的地點選項 */
  const batchLocationOptions = useMemo(() => {
    const allowed = SERVICE_LOCATION_CONSTRAINTS[batchForm.service_type] ?? []
    return allowed.map((v) => ({ value: v, label: LOCATION_LABELS[v] ?? v }))
  }, [batchForm.service_type])

  /** 批量表單中服務類型是否需要選擇地點（SMILE Pro 2.0 需要選） */
  const batchNeedsLocationSelect = batchLocationOptions.length > 1

  /** 當前批次預覽條數 */
  const currentBatchCount = batchForm.dates.length

  /** 所有暫存批次的總條數 */
  const totalStagedCount = useMemo(
    () => stagedBatches.reduce((sum, b) => sum + b.dates.length, 0),
    [stagedBatches],
  )

  /** 暫存日期 → 時段映射（供月曆標記） */
  const stagedDateInfo = useMemo(() => {
    const map = new Map<string, string>()
    for (const batch of stagedBatches) {
      for (const date of batch.dates) {
        map.set(date, batch.time_slot)
      }
    }
    return map
  }, [stagedBatches])

  /** 載入排期列表 */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('pagesize', String(PAGE_SIZE))
        if (filterServiceType !== 'all') {
          params.set('service_type', filterServiceType)
        }
        if (filterLocation !== 'all') {
          params.set('location', filterLocation)
        }
        if (filterDateFrom) params.set('date_from', filterDateFrom)
        if (filterDateTo) params.set('date_to', filterDateTo)
        const res = await api.get<BookingSchedule[]>(
          `/admin/booking/schedules?${params.toString()}`,
        )
        if (!cancelled) {
          setSchedules(res.data ?? [])
          setTotal(res.meta?.total ?? 0)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '載入失敗')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, filterServiceType, filterLocation, filterDateFrom, filterDateTo, refreshCounter])

  /** 重置篩選 */
  const handleResetFilter = () => {
    setFilterServiceType('all')
    setFilterLocation('all')
    setFilterDateFrom('')
    setFilterDateTo('')
    setPage(1)
    setSelectedIds(new Set())
  }

  // ─── 批量選擇處理 ──────────────────────────────────────
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(schedules.map((s) => s.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // ─── 批量新增處理 ──────────────────────────────────────
  const openBatch = () => {
    setBatchForm({
      service_type: '1',
      location: '1',
      dates: [],
      time_slot: '',
      is_special: '0',
      special_label: '',
    })
    setIsCustomMode(false)
    setCustomTimeError('')
    setBatchError('')
    setCommitProgress(0)
    setBatchOpen(true)
  }

  /** 安全關閉對話框（有暫存時提示） */
  const handleCloseBatch = () => {
    if (batchSaving) return
    if (stagedBatches.length > 0) {
      if (
        !window.confirm(
          `您有 ${totalStagedCount} 條暫存的排期尚未提交，確定要關閉嗎？\n（暫存數據會保留，下次打開時仍可看到）`,
        )
      ) {
        return
      }
    }
    setBatchOpen(false)
  }

  /** 批量表單切換服務類型 — 自動校正地點 + 清除已選日期/時段 */
  const handleBatchServiceChange = (st: string) => {
    const allowed = SERVICE_LOCATION_CONSTRAINTS[st] ?? []
    const newLocation = allowed[0] ?? '1'
    setBatchForm((f) => ({
      ...f,
      service_type: st,
      location: newLocation,
      // 切換服務時清除已選日期和時段，避免跨服務數據污染
      dates: [],
      time_slot: '',
      is_special: '0',
      special_label: '',
    }))
    setIsCustomMode(false)
    setCustomTimeError('')
    setBatchError('')
  }

  /** 月曆點選日期 */
  const handleToggleDate = (date: string) => {
    setBatchForm((f) => {
      const has = f.dates.includes(date)
      return {
        ...f,
        dates: has
          ? f.dates.filter((d) => d !== date)
          : [...f.dates, date].sort(),
      }
    })
    setBatchError('')
  }

  const handleRemoveDate = (date: string) => {
    setBatchForm((f) => ({ ...f, dates: f.dates.filter((d) => d !== date) }))
  }

  const handleClearDates = () => {
    setBatchForm((f) => ({ ...f, dates: [] }))
  }

  /** 單選時段（預設） */
  const handleSelectTimeSlot = (slot: string) => {
    setBatchForm((f) => ({ ...f, time_slot: slot }))
    setIsCustomMode(false)
    setCustomTimeError('')
    setBatchError('')
  }

  /** 切換到自定義時段模式 — 設置默認時段 09:00-10:00 */
  const handleSwitchToCustom = () => {
    setIsCustomMode(true)
    setBatchForm((f) => ({ ...f, time_slot: '09:00-10:00' }))
    setCustomTimeError('')
    setBatchError('')
  }

  /** 自定義時段變更（TimeSlotPicker 回調） — 存入歷史記錄 */
  const handleCustomTimeChange = (slot: string) => {
    setBatchForm((f) => ({ ...f, time_slot: slot }))
    setCustomTimeError('')
    setBatchError('')
    setCustomTimeHistory(saveCustomTimeToHistory(slot))
  }

  /** 從歷史記錄中選擇時段 */
  const handleSelectHistoryTime = (slot: string) => {
    setBatchForm((f) => ({ ...f, time_slot: slot }))
    setCustomTimeError('')
    setBatchError('')
  }

  /** 移除歷史記錄中的時段 */
  const handleRemoveHistoryTime = (slot: string) => {
    const updated = customTimeHistory.filter((s) => s !== slot)
    setCustomTimeHistory(updated)
    try {
      if (updated.length > 0) {
        localStorage.setItem(CUSTOM_TIME_HISTORY_KEY, JSON.stringify(updated))
      } else {
        localStorage.removeItem(CUSTOM_TIME_HISTORY_KEY)
      }
    } catch {
      // localStorage 不可用時靜默失敗
    }
  }

  /**
   * 預保存：將當前選擇暫存到 staging（localStorage）
   * 清空日期和時段但保留服務/地點，方便繼續下一批
   */
  const handlePreSave = () => {
    if (batchForm.dates.length === 0) {
      setBatchError('請至少在月曆中選擇一個日期')
      return
    }
    if (!batchForm.time_slot) {
      setBatchError('請選擇一個時段')
      return
    }

    // 重複日期檢測：相同服務+地點+日期
    const dupes: string[] = []
    for (const batch of stagedBatches) {
      if (batch.service_type === batchForm.service_type && batch.location === batchForm.location) {
        const overlap = batchForm.dates.filter((d) => batch.dates.includes(d))
        if (overlap.length > 0) dupes.push(...overlap)
      }
    }
    if (dupes.length > 0) {
      if (
        !window.confirm(
          `以下日期在暫存中已存在相同服務+地點的排期：\n${dupes.join(', ')}\n是否繼續添加？（將產生重複排期）`,
        )
      ) {
        return
      }
    }

    const newBatch: StagedBatch = {
      id: genBatchId(),
      service_type: batchForm.service_type,
      location: batchForm.location,
      dates: [...batchForm.dates].sort(),
      time_slot: batchForm.time_slot,
      is_special: batchForm.is_special,
      special_label: batchForm.is_special === '1' ? batchForm.special_label : '',
    }
    setStagedBatches((prev) => [...prev, newBatch])

    // 清空當前選擇但保留服務/地點，方便繼續下一批
    setBatchForm((f) => ({
      ...f,
      dates: [],
      time_slot: '',
      is_special: '0',
      special_label: '',
    }))
    setIsCustomMode(false)
    setCustomTimeError('')
    setBatchError('')
  }

  /** 移除單個暫存批次 */
  const handleRemoveStagedBatch = (id: string) => {
    setStagedBatches((prev) => prev.filter((b) => b.id !== id))
  }

  /** 清空所有暫存 */
  const handleClearStaging = () => {
    if (stagedBatches.length === 0) return
    if (!window.confirm(`確定要清空所有 ${totalStagedCount} 條暫存排期嗎？`)) return
    setStagedBatches([])
  }

  /**
   * 確認完成：一次性提交所有暫存批次到後端
   * 成功的批次從暫存中移除，失敗的保留
   */
  const handleCommitAll = async () => {
    if (stagedBatches.length === 0) {
      setBatchError('沒有暫存的排期可提交')
      return
    }
    setBatchSaving(true)
    setBatchError('')
    setCommitProgress(0)

    let successCount = 0
    let failCount = 0
    const failedBatches: StagedBatch[] = []

    for (let i = 0; i < stagedBatches.length; i++) {
      const batch = stagedBatches[i]
      setCommitProgress(i + 1)
      try {
        await api.post('/admin/booking/schedules/batch', {
          service_type: batch.service_type,
          location: batch.location,
          dates: batch.dates,
          time_slots: [batch.time_slot],
          is_special: batch.is_special,
          special_label: batch.is_special === '1' ? batch.special_label : '',
        })
        successCount += batch.dates.length
      } catch {
        failCount += batch.dates.length
        failedBatches.push(batch)
      }
    }

    // 只保留失敗的批次
    setStagedBatches(failedBatches)

    if (failCount === 0) {
      // 全部成功
      setBatchOpen(false)
      setPage(1)
      refresh()
    } else {
      // 部分失敗
      setBatchError(
        `成功提交 ${successCount} 條，${failCount} 條失敗。失敗的排期已保留在暫存中，可重試。`,
      )
      refresh()
    }

    setBatchSaving(false)
    setCommitProgress(0)
  }

  // ─── 行內編輯處理 ──────────────────────────────────────
  const openEdit = (item: BookingSchedule) => {
    setEditingId(item.id)
    setEditForm({
      service_type: item.service_type,
      location: item.location,
      booking_date: item.booking_date,
      time_slot: item.time_slot,
      is_special: item.is_special || '0',
      special_label: item.special_label || '',
      status: item.status,
    })
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
    setEditError('')
  }

  /** 編輯時切換服務類型，自動校正地點 */
  const handleEditServiceTypeChange = (st: string) => {
    const allowed = SERVICE_LOCATION_CONSTRAINTS[st] ?? []
    const newLocation = allowed.length === 1 ? allowed[0] : (editForm?.location ?? allowed[0])
    setEditForm((f) => (f ? { ...f, service_type: st, location: newLocation } : f))
  }

  /** 編輯時的地点選項 */
  const editLocationOptions = useMemo(() => {
    if (!editForm) return []
    const allowed = SERVICE_LOCATION_CONSTRAINTS[editForm.service_type] ?? []
    return allowed.map((v) => ({ value: v, label: LOCATION_LABELS[v] ?? v }))
  }, [editForm])

  const handleSaveEdit = async () => {
    if (!editForm || editingId === null) return
    if (!editForm.booking_date) {
      setEditError('請選擇日期')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      await api.put(`/admin/booking/schedules/${editingId}`, {
        service_type: editForm.service_type,
        location: editForm.location,
        booking_date: editForm.booking_date,
        time_slot: editForm.time_slot,
        is_special: editForm.is_special,
        special_label: editForm.is_special === '1' ? editForm.special_label : '',
        status: editForm.status,
      })
      cancelEdit()
      refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setEditSaving(false)
    }
  }

  // ─── 狀態切換 ──────────────────────────────────────────
  const handleToggleStatus = async (item: BookingSchedule) => {
    const newStatus = item.status === '1' ? '0' : '1'
    setSchedules((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, status: newStatus } : s)),
    )
    try {
      await api.put(`/admin/booking/schedules/${item.id}`, { status: newStatus })
    } catch {
      setSchedules((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, status: item.status } : s)),
      )
      setError('更新狀態失敗')
    }
  }

  // ─── 刪除處理 ──────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除此排期嗎？')) return
    setActionLoading(id)
    try {
      await api.del(`/admin/booking/schedules/${id}`)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`確定要刪除選中的 ${selectedIds.size} 條排期嗎？`)) return
    setActionLoading(-1)
    try {
      const ids = Array.from(selectedIds)
      await api.del(`/admin/booking/schedules/batch?ids=${ids.join(',')}`)
      setSelectedIds(new Set())
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── 衍生變量 ──────────────────────────────────────────
  const allSelected = schedules.length > 0 && schedules.every((s) => selectedIds.has(s.id))
  const someSelected = selectedIds.size > 0 && !allSelected
  const sortedSelectedDates = useMemo(() => [...batchForm.dates].sort(), [batchForm.dates])

  return (
    <>
      {/* 操作按鈕 */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          onClick={openBatch}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <span className="mr-1">➕</span>
          批量新增排期
          {totalStagedCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs bg-orange-500 text-white rounded-full font-medium">
              {totalStagedCount}
            </span>
          )}
        </button>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* 篩選欄 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* 服務類型篩選 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">服務類型</label>
          <select
            value={filterServiceType}
            onChange={(e) => {
              setFilterServiceType(e.target.value)
              setFilterLocation('all')
              setPage(1)
              setSelectedIds(new Set())
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm bg-white"
          >
            <option value="all">全部</option>
            {SERVICE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* 地點篩選 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">地點</label>
          <select
            value={filterLocation}
            onChange={(e) => {
              setFilterLocation(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm bg-white"
          >
            <option value="all">全部</option>
            {filterLocationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* 日期範圍篩選 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">日期範圍</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => {
              setFilterDateFrom(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
          <span className="text-muted-foreground">~</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => {
              setFilterDateTo(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>

        {/* 重置 */}
        <button
          onClick={handleResetFilter}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
        >
          🔄 重置
        </button>

        {/* 批量刪除 */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleBatchDelete}
            disabled={actionLoading === -1}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 ml-auto"
          >
            {actionLoading === -1 ? (
              <>
                <span className="animate-spin inline-block">🔄</span>
                刪除中...
              </>
            ) : (
              <>
                <span>🗑️</span>
                批量刪除（{selectedIds.size}）
              </>
            )}
          </button>
        )}
      </div>

      {/* 加載中 */}
      {loading && <LoadingState text="載入中..." />}

      {/* 空狀態 */}
      {!loading && schedules.length === 0 && !error && (
        <>
          <EmptyState icon="📅" text="尚未創建任何預約排期" hint="點擊「批量新增排期」創建時段" />
          <div className="flex justify-center -mt-16 pb-8">
            <button
              onClick={openBatch}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
            >
              <span className="mr-1">➕</span>
              批量新增排期
            </button>
          </div>
        </>
      )}

      {/* 排期表格 */}
      {!loading && schedules.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">時段</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">服務類型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">地點</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">特別場</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">狀態</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => {
                  const isEditing = editingId === item.id

                  if (isEditing && editForm) {
                    return (
                      <tr key={item.id} className="border-b last:border-0 bg-blue-50/40">
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" disabled className="w-4 h-4 rounded opacity-40" />
                        </td>
                        {/* 日期 */}
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={editForm.booking_date}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, booking_date: e.target.value } : f))
                            }
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </td>
                        {/* 時段 — 點擊選擇，無需手動輸入符號 */}
                        <td className="px-4 py-3">
                          <TimeSlotPicker
                            value={editForm.time_slot}
                            onChange={(slot) => setEditForm((f) => (f ? { ...f, time_slot: slot } : f))}
                            compact
                          />
                        </td>
                        {/* 服務類型 */}
                        <td className="px-4 py-3">
                          <select
                            value={editForm.service_type}
                            onChange={(e) => handleEditServiceTypeChange(e.target.value)}
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                          >
                            {SERVICE_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* 地點 */}
                        <td className="px-4 py-3">
                          {editLocationOptions.length > 1 ? (
                            <select
                              value={editForm.location}
                              onChange={(e) =>
                                setEditForm((f) => (f ? { ...f, location: e.target.value } : f))
                              }
                              className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                            >
                              {editLocationOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                              {LOCATION_LABELS[editForm.location] ?? editForm.location}
                            </span>
                          )}
                        </td>
                        {/* 特別場 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editForm.is_special === '1'}
                              onChange={(e) =>
                                setEditForm((f) => (f ? { ...f, is_special: e.target.checked ? '1' : '0' } : f))
                              }
                              className="w-4 h-4 rounded accent-primary"
                            />
                            {editForm.is_special === '1' && (
                              <input
                                type="text"
                                value={editForm.special_label}
                                onChange={(e) =>
                                  setEditForm((f) => (f ? { ...f, special_label: e.target.value } : f))
                                }
                                placeholder="LBV特別場"
                                className="px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 w-24"
                              />
                            )}
                          </div>
                        </td>
                        {/* 狀態 */}
                        <td className="px-4 py-3">
                          <select
                            value={editForm.status}
                            onChange={(e) =>
                              setEditForm((f) => (f ? { ...f, status: e.target.value } : f))
                            }
                            className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                          >
                            <option value="1">可用</option>
                            <option value="0">停用</option>
                          </select>
                        </td>
                        {/* 操作 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleSaveEdit}
                              disabled={editSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                            >
                              {editSaving ? (
                                <span className="animate-spin inline-block">🔄</span>
                              ) : (
                                <span className="text-sm">💾</span>
                              )}
                              保存
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={editSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-accent rounded transition-colors disabled:opacity-50"
                            >
                              <span className="text-sm">❌</span>
                              取消
                            </button>
                          </div>
                          {editError && (
                            <p className="text-xs text-destructive mt-1 text-right">{editError}</p>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b last:border-0 hover:bg-accent/50 transition-colors',
                        selectedIds.has(item.id) && 'bg-blue-50/40',
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleSelectRow(item.id, e.target.checked)}
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </td>
                      {/* 日期 */}
                      <td className="px-4 py-3 font-medium">{item.booking_date || '-'}</td>
                      {/* 時段 */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                          {item.time_slot || '-'}
                        </span>
                      </td>
                      {/* 服務類型 */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {getServiceTypeLabel(item.service_type)}
                      </td>
                      {/* 地點 */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          {LOCATION_LABELS[item.location] ?? item.location}
                        </span>
                      </td>
                      {/* 特別場 */}
                      <td className="px-4 py-3">
                        {item.is_special === '1' ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-600">
                            ⭐ {item.special_label || '特別場'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      {/* 狀態 */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            item.status === '1' ? 'bg-primary' : 'bg-muted',
                          )}
                          title={item.status === '1' ? '點擊停用' : '點擊啟用'}
                        >
                          <span
                            className={cn(
                              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                              item.status === '1' ? 'translate-x-5' : 'translate-x-1',
                            )}
                          />
                        </button>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      </td>
                      {/* 操作 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="編輯"
                          >
                            <span className="text-sm">✏️</span>
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="刪除"
                          >
                            {actionLoading === item.id ? (
                              <span className="animate-spin inline-block text-sm">🔄</span>
                            ) : (
                              <span className="text-sm">🗑️</span>
                            )}
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 分頁 */}
          <div className="px-4 py-3 bg-slate-50 border-t flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              共 {total} 條，第 {page}/{totalPages} 頁
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  ⬅️ 上一頁
                </button>
                {getPageNumbers(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'px-3 py-1.5 text-sm border rounded-md transition-colors',
                        p === page
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent',
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  下一頁 ➡️
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 批量新增對話框 ──────────────────────────────── */}
      {batchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">
                📅 批量新增排期
                {totalStagedCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-orange-600">
                    （已暫存 {totalStagedCount} 條）
                  </span>
                )}
              </h2>
              <button
                onClick={handleCloseBatch}
                disabled={batchSaving}
                className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
              >
                ❌
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* 服務類型 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  服務類型 <span className="text-destructive">*</span>
                </label>
                <select
                  value={batchForm.service_type}
                  onChange={(e) => handleBatchServiceChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm bg-white"
                >
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 地點（SMILE Pro 2.0 需選擇，其他自動鎖定） */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  地點 <span className="text-destructive">*</span>
                  {!batchNeedsLocationSelect && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                     （此服務僅支持 {LOCATION_LABELS[batchForm.location]}，自動鎖定）
                    </span>
                  )}
                </label>
                {batchNeedsLocationSelect ? (
                  <div className="flex gap-4">
                    {batchLocationOptions.map((o) => (
                      <label
                        key={o.value}
                        className={cn(
                          'inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer transition-colors text-sm',
                          batchForm.location === o.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'hover:bg-accent',
                        )}
                      >
                        <input
                          type="radio"
                          name="batch-location"
                          checked={batchForm.location === o.value}
                          onChange={() => setBatchForm((f) => ({ ...f, location: o.value }))}
                          className="w-4 h-4 accent-primary"
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-slate-50 border rounded-md text-sm text-muted-foreground">
                    📍 {LOCATION_LABELS[batchForm.location]}
                  </div>
                )}
              </div>

              {/* 月曆日期選擇 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium">
                    日期 <span className="text-destructive">*</span>
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                     （點擊月曆選擇多個日期）
                    </span>
                  </label>
                  {batchForm.dates.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearDates}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      清空
                    </button>
                  )}
                </div>
                <MonthCalendar
                  selectedDates={new Set(batchForm.dates)}
                  onToggleDate={handleToggleDate}
                  currentTimeSlot={batchForm.time_slot || undefined}
                  stagedDateInfo={stagedDateInfo}
                />
                {sortedSelectedDates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sortedSelectedDates.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium"
                      >
                        {d}
                        {batchForm.time_slot && (
                          <span className="text-blue-400">{slotStart(batchForm.time_slot)}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveDate(d)}
                          className="hover:text-red-600 transition-colors"
                          title="移除"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 時段選擇（單選 + 自定義） */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  時段 <span className="text-destructive">*</span>
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    （單選 — 同一服務同一日期僅一個時段）
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {TIME_SLOT_PRESETS.map((slot) => {
                    const checked = !isCustomMode && batchForm.time_slot === slot
                    return (
                      <label
                        key={slot}
                        className={cn(
                          'inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer transition-colors text-sm',
                          checked
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'hover:bg-accent',
                        )}
                      >
                        <input
                          type="radio"
                          name="batch-time-slot"
                          checked={checked}
                          onChange={() => handleSelectTimeSlot(slot)}
                          className="w-4 h-4 accent-primary"
                        />
                        {slot}
                      </label>
                    )
                  })}
                  {/* 自定義時段 */}
                  <label
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer transition-colors text-sm',
                      isCustomMode
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'hover:bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="batch-time-slot"
                      checked={isCustomMode}
                      onChange={handleSwitchToCustom}
                      className="w-4 h-4 accent-primary"
                    />
                    ✏️ 自定義
                  </label>
                </div>

                {/* 自定義時段選擇區 — 點擊小時+分鐘，結束時間自動 +1 小時 */}
                {isCustomMode && (
                  <div className="mt-3 space-y-2 p-3 border border-dashed rounded-md bg-slate-50/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground shrink-0">開始時間：</span>
                      <TimeSlotPicker
                        value={batchForm.time_slot}
                        onChange={handleCustomTimeChange}
                      />
                    </div>
                    {/* 已選時段 */}
                    {batchForm.time_slot && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600">✅ 已選時段：</span>
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          {batchForm.time_slot}
                        </span>
                      </div>
                    )}
                    {/* 歷史記錄氣泡 */}
                    {customTimeHistory.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs text-muted-foreground mr-1">🕘 最近使用：</span>
                        {customTimeHistory.map((slot) => (
                          <span
                            key={slot}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors group"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectHistoryTime(slot)}
                              className="leading-none"
                              title="點擊選用此時段"
                            >
                              {slot}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveHistoryTime(slot)}
                              className="text-blue-300 hover:text-red-500 transition-colors leading-none"
                              title="刪除此歷史記錄"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 特別場標記 */}
              <div className="px-4 py-3 border rounded-md bg-orange-50/40">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchForm.is_special === '1'}
                    onChange={(e) =>
                      setBatchForm((f) => ({
                        ...f,
                        is_special: e.target.checked ? '1' : '0',
                        special_label: e.target.checked ? (f.special_label || 'LBV特別場') : '',
                      }))
                    }
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm font-medium">⭐ 特別場（如 LBV）</span>
                </label>
                {batchForm.is_special === '1' && (
                  <input
                    type="text"
                    value={batchForm.special_label}
                    onChange={(e) =>
                      setBatchForm((f) => ({ ...f, special_label: e.target.value }))
                    }
                    placeholder="特別場標籤（如 LBV特別場）"
                    className="mt-2 w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                )}
              </div>

              {/* 當前批次預覽 */}
              {currentBatchCount > 0 && (
                <div className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg text-sm flex items-center gap-2">
                  <span>💡</span>
                  當前批次：<span className="font-bold">{currentBatchCount}</span> 個日期
                  {batchForm.time_slot && (
                    <span className="text-blue-500 text-xs">× 時段 {batchForm.time_slot}</span>
                  )}
                </div>
              )}

              {/* 暫存批次面板 */}
              {stagedBatches.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 border-b">
                    <span className="text-sm font-medium text-green-700">
                      📋 暫存批次（{stagedBatches.length} 批，共 {totalStagedCount} 條）
                    </span>
                    <button
                      type="button"
                      onClick={handleClearStaging}
                      disabled={batchSaving}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      清空全部
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y">
                    {stagedBatches.map((batch) => (
                      <div
                        key={batch.id}
                        className="flex items-start justify-between gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {getServiceTypeLabel(batch.service_type)} - {LOCATION_LABELS[batch.location]}
                            </span>
                            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                              {batch.time_slot}
                            </span>
                            {batch.is_special === '1' && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-600">
                                ⭐ {batch.special_label || '特別場'}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {batch.dates.length} 個日期：{batch.dates.join(', ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedBatch(batch.id)}
                          disabled={batchSaving}
                          className="shrink-0 p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="移除此批次"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 提交進度 */}
              {batchSaving && (
                <div className="px-4 py-2 bg-blue-50 text-blue-600 text-sm flex items-center gap-2 rounded-lg">
                  <span className="animate-spin inline-block">🔄</span>
                  提交中... {commitProgress}/{stagedBatches.length} 批
                </div>
              )}

              {/* 錯誤提示 */}
              {batchError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="mr-1">⚠️</span>
                  {batchError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              {/* 左側：關閉 */}
              <button
                onClick={handleCloseBatch}
                disabled={batchSaving}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                關閉
              </button>

              {/* 右側：預保存 + 確認完成 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreSave}
                  disabled={batchSaving || currentBatchCount === 0 || !batchForm.time_slot}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm border-2 border-green-500 text-green-600 rounded-md hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="將當前選擇暫存（不清空服務/地點，可繼續下一批）"
                >
                  📌 預保存（{currentBatchCount} 條）
                </button>
                <button
                  onClick={handleCommitAll}
                  disabled={batchSaving || totalStagedCount === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  title="提交所有暫存批次到數據庫"
                >
                  {batchSaving && <span className="animate-spin inline-block">🔄</span>}
                  {batchSaving
                    ? `提交中...`
                    : `確認完成（${totalStagedCount} 條）`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
