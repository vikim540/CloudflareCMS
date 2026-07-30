import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { LoadingState } from '../components/StateDisplay'
import { formatDate } from '../lib/utils'

/** 備份文件數據結構 */
interface BackupFile {
  filename: string
  size: number
  date: string
  site: string
  compressed?: boolean
}

/** 定時備份配置 */
interface BackupSchedule {
  enabled: string
  frequency: string
  time: string
  weekday: string
  keep: number
  lastRun: string
  excludeLogs: string
  logRetentionDays: number
  lastLogCleanup: string
}

/** 日誌統計信息 */
interface LogStats {
  total: number
  levels: { level: string; cnt: number }[]
  earliest: string
  latest: string
}

/** 星期標籤 */
const WEEKDAY_LABELS: { value: string; label: string }[] = [
  { value: '0', label: '週日' },
  { value: '1', label: '週一' },
  { value: '2', label: '週二' },
  { value: '3', label: '週三' },
  { value: '4', label: '週四' },
  { value: '5', label: '週五' },
  { value: '6', label: '週六' },
]

/** 取得星期標籤 */
function getWeekdayLabel(weekday: string): string {
  return WEEKDAY_LABELS.find((w) => w.value === weekday)?.label ?? '週一'
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 取得 API 基礎路徑 */
function getApiBase(): string {
  return import.meta.env.VITE_API_BASE || '/api/v1'
}

/** 取得 JWT token */
function getToken(): string | null {
  return localStorage.getItem('cms_token')
}

export default function DatabasePage() {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [actionFile, setActionFile] = useState<string | null>(null)

  // 備份選項：是否排除日誌數據
  const [excludeLogs, setExcludeLogs] = useState(false)

  // 定時備份配置
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: '0',
    frequency: 'daily',
    time: '03:00',
    weekday: '1',
    keep: 7,
    lastRun: '',
    excludeLogs: '0',
    logRetentionDays: 30,
    lastLogCleanup: '',
  })
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 日誌統計與清理
  const [logStats, setLogStats] = useState<LogStats | null>(null)
  const [logStatsLoading, setLogStatsLoading] = useState(false)
  const [cleanupDays, setCleanupDays] = useState(30)
  const [cleaning, setCleaning] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 備份列表站點 Tab
  const [activeSiteTab, setActiveSiteTab] = useState<string>('all')

  /** 載入備份列表 */
  const fetchBackups = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<BackupFile[]>('/admin/database/backups')
      setBackups(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  /** 載入定時備份配置 */
  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true)
    try {
      const res = await api.get<BackupSchedule>('/admin/database/backup-schedule')
      if (res.data) {
        setSchedule(res.data)
      }
    } catch {
      // 配置不存在時使用默認值，不報錯
    } finally {
      setScheduleLoading(false)
    }
  }, [])

  /** 載入日誌統計 */
  const fetchLogStats = useCallback(async () => {
    setLogStatsLoading(true)
    try {
      const res = await api.get<LogStats>('/admin/database/log-stats')
      if (res.data) {
        setLogStats(res.data)
      }
    } catch {
      // 靜默失敗，日誌統計為輔助信息
    } finally {
      setLogStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBackups()
    fetchSchedule()
    fetchLogStats()
  }, [fetchBackups, fetchSchedule, fetchLogStats])

  /** 建立備份 */
  const handleCreateBackup = async () => {
    setCreating(true)
    setError('')
    try {
      await api.post(`/admin/database/backup${excludeLogs ? '?excludeLogs=1' : ''}`, {})
      await fetchBackups()
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立備份失敗')
    } finally {
      setCreating(false)
    }
  }

  /** 手動清理舊日誌 */
  const handleCleanupLogs = async () => {
    if (!window.confirm(`確定要清理 ${cleanupDays} 天前的舊日誌嗎？此操作不可撤銷。`)) return
    setCleaning(true)
    setCleanupMsg(null)
    try {
      const res = await api.post<{ deleted: number; cutoff: string }>(`/admin/database/cleanup-logs?days=${cleanupDays}`, {})
      const deleted = res.data?.deleted ?? 0
      setCleanupMsg({
        type: 'success',
        text: deleted > 0 ? `成功清理 ${deleted} 條舊日誌` : '沒有需要清理的舊日誌',
      })
      // 重新載入日誌統計
      await fetchLogStats()
    } catch (err) {
      setCleanupMsg({ type: 'error', text: err instanceof Error ? err.message : '清理失敗' })
    } finally {
      setCleaning(false)
    }
  }

  /** 下載備份 */
  const handleDownload = async (filename: string) => {
    setActionFile(filename)
    try {
      // 嘗試通過 fetch 取得 blob 並觸發下載
      const response = await fetch(
        `${getApiBase()}/admin/database/backups/${encodeURIComponent(filename)}`,
        {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        },
      )
      if (!response.ok) {
        throw new Error(`下載失敗: ${response.status}`)
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      // 壓縮文件下載時後端已解壓，使用 .sql 副檔名
      link.download = filename.replace(/\.gz$/, '')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '下載失敗')
    } finally {
      setActionFile(null)
    }
  }

  /** 刪除備份 */
  const handleDelete = async (filename: string) => {
    if (!window.confirm(`確定要刪除備份文件「${filename}」嗎?`)) return
    setActionFile(filename)
    try {
      await api.del(`/admin/database/backups/${encodeURIComponent(filename)}`)
      await fetchBackups()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionFile(null)
    }
  }

  /** 保存定時備份配置 */
  const handleSaveSchedule = async () => {
    setScheduleSaving(true)
    setScheduleMsg(null)
    try {
      await api.put('/admin/database/backup-schedule', {
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        time: schedule.time,
        weekday: schedule.weekday,
        keep: schedule.keep,
        excludeLogs: schedule.excludeLogs,
        logRetentionDays: schedule.logRetentionDays,
      })
      setScheduleMsg({ type: 'success', text: '定時備份配置已保存' })
      // 重新載入以獲取最新的 lastRun
      await fetchSchedule()
    } catch (err) {
      setScheduleMsg({ type: 'error', text: err instanceof Error ? err.message : '保存失敗' })
    } finally {
      setScheduleSaving(false)
    }
  }

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-xl">🗄️</span>
            資料庫管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">管理資料庫備份文件，可建立、下載或刪除備份</p>
        </div>
        <div className="flex items-center gap-4">
          {/* 排除日誌數據選項（放大版） */}
          <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-white cursor-pointer select-none hover:bg-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={excludeLogs}
              onChange={(e) => setExcludeLogs(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">排除日誌數據</span>
              <span className="text-xs text-muted-foreground">備份時跳過 ay_syslog 表數據</span>
            </div>
          </label>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
          >
            {creating ? <span className="animate-spin inline-block">🔄</span> : <span>➕</span>}
            {creating ? '備份中...' : '建立備份'}
          </button>
        </div>
      </div>

      {/* 定時備份設置卡片 */}
      <div className="mb-6 bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-secondary/30">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span>⏰</span>
            定時備份排程
            <span className="text-xs font-normal text-muted-foreground ml-1">
              （每站點獨立配置，Cron 每 15 分鐘檢查）
            </span>
          </h2>
        </div>

        {scheduleLoading ? (
          <div className="px-4 py-8"><LoadingState text="載入配置中..." /></div>
        ) : (
          <div className="p-4 space-y-5">
            {/* ===== 區塊 1：備份排程設定 ===== */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold text-foreground">📋 備份排程</span>
                <span className="text-xs text-muted-foreground">— 何時自動執行備份</span>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {/* 開關 */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">啟用</label>
                  <button
                    type="button"
                    onClick={() => setSchedule(s => ({ ...s, enabled: s.enabled === '1' ? '0' : '1' }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      schedule.enabled === '1' ? 'bg-primary' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        schedule.enabled === '1' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {schedule.enabled === '1' ? '已啟用' : '已停用'}
                  </span>
                </div>

                {/* 頻率 */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">備份頻率</label>
                  <select
                    value={schedule.frequency}
                    onChange={(e) => setSchedule(s => ({ ...s, frequency: e.target.value }))}
                    disabled={schedule.enabled !== '1'}
                    className="px-3 py-1.5 text-sm border rounded-md bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="daily">每天</option>
                    <option value="weekly">每週</option>
                  </select>
                </div>

                {/* 星期幾（僅 weekly 顯示） */}
                {schedule.frequency === 'weekly' && (
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">星期</label>
                    <select
                      value={schedule.weekday}
                      onChange={(e) => setSchedule(s => ({ ...s, weekday: e.target.value }))}
                      disabled={schedule.enabled !== '1'}
                      className="px-3 py-1.5 text-sm border rounded-md bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {WEEKDAY_LABELS.map((w) => (
                        <option key={w.value} value={w.value}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 時間 */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">執行時間</label>
                  <input
                    type="time"
                    value={schedule.time}
                    onChange={(e) => setSchedule(s => ({ ...s, time: e.target.value }))}
                    disabled={schedule.enabled !== '1'}
                    className="px-3 py-1.5 text-sm border rounded-md bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* 保留數量 */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">保留備份數</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={schedule.keep}
                    onChange={(e) => setSchedule(s => ({ ...s, keep: parseInt(e.target.value, 10) || 7 }))}
                    disabled={schedule.enabled !== '1'}
                    className="w-20 px-3 py-1.5 text-sm border rounded-md bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="ml-1.5 text-xs text-muted-foreground">個</span>
                </div>
              </div>
            </div>

            {/* ===== 區塊 2：備份內容選項 ===== */}
            <div className="pt-4 border-t">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold text-foreground">📦 備份內容</span>
                <span className="text-xs text-muted-foreground">— 備份文件中包含什麼</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {/* 備份排除日誌 */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSchedule(s => ({ ...s, excludeLogs: s.excludeLogs === '1' ? '0' : '1' }))}
                    disabled={schedule.enabled !== '1'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      schedule.excludeLogs === '1' ? 'bg-primary' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        schedule.excludeLogs === '1' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">排除日誌數據</span>
                    <span className="text-xs text-muted-foreground">
                      {schedule.excludeLogs === '1'
                        ? '✅ 備份文件僅含日誌表結構，不含日誌數據（文件更小）'
                        : '備份文件包含完整日誌數據'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== 區塊 3：日誌自動清理（獨立功能） ===== */}
            <div className="pt-4 border-t">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-semibold text-foreground">🧹 日誌自動清理</span>
                <span className="text-xs text-muted-foreground">— 定期刪除數據庫中的舊日誌（與備份無關）</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">保留最近</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={schedule.logRetentionDays}
                    onChange={(e) => setSchedule(s => ({ ...s, logRetentionDays: parseInt(e.target.value, 10) || 0 }))}
                    disabled={schedule.enabled !== '1'}
                    className="w-20 px-3 py-1.5 text-sm border rounded-md bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-sm text-muted-foreground">天的日誌</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  schedule.logRetentionDays > 0
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}>
                  {schedule.logRetentionDays > 0
                    ? `✅ 每天自動刪除 ${schedule.logRetentionDays} 天前的日誌`
                    : '⚠️ 設為 0 表示不自動清理'}
                </span>
                {schedule.lastLogCleanup && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>🧹</span>
                    上次清理: <span className="font-mono text-foreground">{formatDate(schedule.lastLogCleanup)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* ===== 保存按鈕 + 狀態信息 ===== */}
            <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                {schedule.lastRun && (
                  <span className="flex items-center gap-1">
                    <span>🕐</span>
                    上次執行: <span className="font-mono text-foreground">{formatDate(schedule.lastRun)}</span>
                  </span>
                )}
                {schedule.enabled === '1' && (
                  <span className="flex items-center gap-1 text-green-600">
                    <span>✅</span>
                    {schedule.frequency === 'daily'
                      ? `每天 ${schedule.time} 自動備份，保留最近 ${schedule.keep} 個`
                      : `每${getWeekdayLabel(schedule.weekday)} ${schedule.time} 自動備份，保留最近 ${schedule.keep} 個`
                    }
                  </span>
                )}
              </div>
              <button
                onClick={handleSaveSchedule}
                disabled={scheduleSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
              >
                {scheduleSaving ? <span className="animate-spin inline-block">🔄</span> : <span>💾</span>}
                {scheduleSaving ? '保存中...' : '保存配置'}
              </button>
            </div>

            {/* 操作結果提示 */}
            {scheduleMsg && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
                scheduleMsg.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}>
                <span>{scheduleMsg.type === 'success' ? '✅' : '⚠️'}</span>
                {scheduleMsg.text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 日誌管理卡片 */}
      <div className="mb-6 bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-secondary/30">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span>🧹</span>
            日誌管理
            <span className="text-xs font-normal text-muted-foreground ml-1">
              （系統操作日誌統計與清理）
            </span>
          </h2>
        </div>

        <div className="p-4">
          {/* 日誌統計 */}
          {logStatsLoading ? (
            <div className="py-4"><LoadingState text="載入日誌統計..." /></div>
          ) : logStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-secondary/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-primary">{logStats.total}</div>
                <div className="text-xs text-muted-foreground mt-1">總日誌數</div>
              </div>
              <div className="bg-secondary/20 rounded-lg p-3 text-center">
                <div className="text-sm font-mono text-foreground">{logStats.earliest || '—'}</div>
                <div className="text-xs text-muted-foreground mt-1">最早記錄</div>
              </div>
              <div className="bg-secondary/20 rounded-lg p-3 text-center">
                <div className="text-sm font-mono text-foreground">{logStats.latest || '—'}</div>
                <div className="text-xs text-muted-foreground mt-1">最新記錄</div>
              </div>
              <div className="bg-secondary/20 rounded-lg p-3 text-center">
                <div className="text-sm text-foreground">
                  {logStats.levels.slice(0, 3).map(l => `${l.level}: ${l.cnt}`).join(' · ') || '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">級別分佈</div>
              </div>
            </div>
          ) : null}

          {/* 手動清理區 */}
          <div className="flex flex-wrap items-end gap-3 pt-3 border-t">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">手動清理舊日誌</label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">刪除</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={cleanupDays}
                  onChange={(e) => setCleanupDays(parseInt(e.target.value, 10) || 30)}
                  className="w-16 px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">天前的日誌</span>
              </div>
            </div>
            <button
              onClick={handleCleanupLogs}
              disabled={cleaning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {cleaning ? <span className="animate-spin inline-block">🔄</span> : <span>🧹</span>}
              {cleaning ? '清理中...' : '立即清理'}
            </button>

            {cleanupMsg && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs ${
                cleanupMsg.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}>
                <span>{cleanupMsg.type === 'success' ? '✅' : '⚠️'}</span>
                {cleanupMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <span className="shrink-0">⚠️</span>
          {error}
        </div>
      )}

      {/* 加載中 */}
      {loading && (
        <LoadingState text="載入中..." />
      )}

      {/* 空狀態 */}
      {!loading && backups.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <span className="text-3xl mb-3 opacity-50">💾</span>
          <p className="mb-3">尚未有任何備份文件</p>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
          >
            {creating ? <span className="animate-spin inline-block">🔄</span> : <span>➕</span>}
            建立第一個備份
          </button>
        </div>
      )}

      {/* 備份列表 */}
      {!loading && backups.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          {/* 站點 Tab 切換 */}
          {(() => {
            const sites = Array.from(new Set(backups.map(b => b.site || '(未知)'))).sort()
            const filteredBackups = activeSiteTab === 'all'
              ? backups
              : backups.filter(b => (b.site || '(未知)') === activeSiteTab)

            return (
              <>
                <div className="flex items-center gap-1 px-3 pt-3 border-b">
                  <button
                    onClick={() => setActiveSiteTab('all')}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                      activeSiteTab === 'all'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    全部 <span className="text-xs text-muted-foreground">({backups.length})</span>
                  </button>
                  {sites.map(site => (
                    <button
                      key={site}
                      onClick={() => setActiveSiteTab(site)}
                      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        activeSiteTab === site
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {site === '(舊格式)' ? '舊格式' : site}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({backups.filter(b => (b.site || '(未知)') === site).length})
                      </span>
                    </button>
                  ))}
                </div>

                {/* 當前 Tab 的備份列表 */}
                {filteredBackups.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    此站點暫無備份文件
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-secondary/50">
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">文件名</th>
                          {activeSiteTab === 'all' && (
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">站點</th>
                          )}
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">大小</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">建立時間</th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBackups.map((file) => (
                          <tr
                            key={file.filename}
                            className="border-b last:border-0 hover:bg-accent/50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground shrink-0">{file.compressed ? '🗜️' : '📄'}</span>
                                <span className="font-mono text-xs">{file.filename}</span>
                                {file.compressed && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                                    gzip
                                  </span>
                                )}
                              </div>
                            </td>
                            {activeSiteTab === 'all' && (
                              <td className="px-4 py-3">
                                {file.site && file.site !== '(舊格式)' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    {file.site}
                                  </span>
                                ) : file.site === '(舊格式)' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                                    舊格式
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 text-muted-foreground">{formatSize(file.size)}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {formatDate(file.date)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleDownload(file.filename)}
                                  disabled={actionFile === file.filename}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                                  title="下載"
                                >
                                  <span className="text-sm">📥</span>
                                  下載
                                </button>
                                <button
                                  onClick={() => handleDelete(file.filename)}
                                  disabled={actionFile === file.filename}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                  title="刪除"
                                >
                                  <span className="text-sm">🗑️</span>
                                  刪除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
