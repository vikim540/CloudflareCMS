import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { LoadingState, EmptyState, ErrorState } from '../components/StateDisplay'

interface FormConfig {
  id: number
  fcode: string
  form_name: string
  description: string
  is_active: string
  sorting: number
  status: string
  webhook_url: string | null
  submit_token: string
  turnstile_enabled: string
  allowed_origins: string | null
  create_time: string
  submission_count: number
}

export default function FormManager() {
  const [forms, setForms] = useState<FormConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editTarget, setEditTarget] = useState<FormConfig | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const fetchForms = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<FormConfig[]>('/admin/forms/config')
      setForms(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchForms() }, [fetchForms])

  const handleToggleActive = async (form: FormConfig) => {
    const newActive = form.is_active === '1' ? '0' : '1'
    try {
      await api.put(`/admin/forms/config/${form.id}`, { is_active: newActive })
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: newActive } : f))
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確認刪除此表單？已提交的數據不會被刪除。')) return
    try {
      await api.del(`/admin/forms/config/${id}`)
      setForms((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  const handleCopyApi = (form: FormConfig) => {
    const apiUrl = `POST /api/v1/f/${form.submit_token}`
    navigator.clipboard.writeText(apiUrl).then(() => {
      setCopiedId(form.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const handleRegenerateToken = async (form: FormConfig) => {
    if (!confirm('重新生成提交端點後，舊的 API 路徑將失效，所有使用舊路徑的表單都需要更新。確認繼續？')) return
    try {
      await api.put(`/admin/forms/config/${form.id}`, { regenerate_token: true })
      fetchForms()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失敗')
    }
  }

  if (loading) return <LoadingState text="載入表單列表..." />
  if (error && forms.length === 0) return <ErrorState message={error} onRetry={fetchForms} />

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-xl">📝</span>
          表單管理
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
        >
          <span className="mr-1">➕</span>
          新增表單
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <span className="shrink-0">⚠️</span>{error}
        </div>
      )}

      {/* 表格 */}
      {forms.length === 0 ? (
        <EmptyState icon="📭" text="尚未創建任何表單" />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">表單名稱</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">提交端點（隱蔽化）</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">安全</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">展示</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">提交數</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{form.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{form.form_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className="px-1.5 py-0.5 bg-secondary/50 rounded font-mono">{form.fcode}</span>
                        {form.description && <span className="ml-2">{form.description}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">
                          /api/v1/f/{form.submit_token}
                        </code>
                        <button
                          onClick={() => handleCopyApi(form)}
                          className="p-1 text-xs hover:bg-accent rounded transition-colors"
                          title="複製 API 端點"
                        >
                          {copiedId === form.id ? '✅' : '📋'}
                        </button>
                        <button
                          onClick={() => handleRegenerateToken(form)}
                          className="p-1 text-xs text-orange-600 hover:bg-orange-50 rounded transition-colors"
                          title="重新生成端點（舊路徑將失效）"
                        >
                          🔄
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {form.turnstile_enabled === '1' && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
                            <span>🛡️</span> Turnstile
                          </span>
                        )}
                        {form.allowed_origins && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-blue-600">
                            <span>🔒</span> 來源限制
                          </span>
                        )}
                        {form.turnstile_enabled !== '1' && !form.allowed_origins && (
                          <span className="text-xs text-muted-foreground">基本防護</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(form)}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          form.is_active === '1' ? 'bg-primary' : 'bg-muted',
                        )}
                      >
                        <span className={cn(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                          form.is_active === '1' ? 'translate-x-5' : 'translate-x-1',
                        )} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{form.submission_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditTarget(form)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <span className="text-sm">✏️</span> 編輯
                        </button>
                        {form.id !== 1 && (
                          <button
                            onClick={() => handleDelete(form.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <span className="text-sm">🗑️</span> 刪除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯對話框 */}
      {(showCreate || editTarget) && (
        <FormEditDialog
          target={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null) }}
          onSuccess={() => { setShowCreate(false); setEditTarget(null); fetchForms() }}
        />
      )}
    </div>
  )
}

function FormEditDialog({
  target, onClose, onSuccess,
}: {
  target: FormConfig | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [fcode, setFcode] = useState(target?.fcode || '')
  const [formName, setFormName] = useState(target?.form_name || '')
  const [description, setDescription] = useState(target?.description || '')
  const [sorting, setSorting] = useState(target?.sorting || 255)
  const [webhookUrl, setWebhookUrl] = useState(target?.webhook_url || '')
  const [turnstileEnabled, setTurnstileEnabled] = useState(target?.turnstile_enabled === '1')
  const [allowedOrigins, setAllowedOrigins] = useState(target?.allowed_origins || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!fcode.trim()) { setError('請填寫表單代碼'); return }
    if (!formName.trim()) { setError('請填寫表單名稱'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        fcode: fcode.trim(),
        form_name: formName.trim(),
        description,
        sorting,
        webhook_url: webhookUrl,
        turnstile_enabled: turnstileEnabled ? '1' : '0',
        allowed_origins: allowedOrigins,
      }
      if (target) {
        await api.put(`/admin/forms/config/${target.id}`, body)
      } else {
        await api.post('/admin/forms/config', body)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">{target ? '編輯表單' : '新增表單'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground">❌</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">表單代碼 <span className="text-destructive">*</span></label>
            <input
              value={fcode}
              onChange={(e) => setFcode(e.target.value)}
              placeholder="如：appointment"
              disabled={!!target}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">用於內部標識，創建後不可修改</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">表單名稱 <span className="text-destructive">*</span></label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="如：預約表單"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">描述</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="表單用途說明"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">排序</label>
            <input
              type="number"
              value={sorting}
              onChange={(e) => setSorting(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">專屬 Webhook URL（可選）</label>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="留空則使用全局 webhook"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">不同表單可推送到不同釘釘群組</p>
          </div>

          {/* 安全配置 */}
          <div className="pt-3 border-t">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">
              <span>🛡️</span> 安全配置
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={turnstileEnabled}
                  onChange={(e) => setTurnstileEnabled(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">啟用 Turnstile 人機驗證</span>
              </label>
              <p className="text-xs text-muted-foreground ml-6">開啟後每次提交需通過 Cloudflare 人機驗證</p>

              <div>
                <label className="block text-sm font-medium mb-1.5">允許來源域名（可選）</label>
                <input
                  value={allowedOrigins}
                  onChange={(e) => setAllowedOrigins(e.target.value)}
                  placeholder="如：https://cmermedical.com.hk,https://www.cmermedical.com.hk"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  逗號分隔。留空則不限制來源。配置後僅接受來自這些域名的提交
                </p>
              </div>
            </div>
          </div>

          {target && (
            <div className="pt-3 border-t">
              <div className="bg-secondary/30 rounded-md p-3">
                <p className="text-xs text-muted-foreground mb-1">當前提交端點：</p>
                <code className="text-xs text-blue-600 font-mono break-all">
                  POST /api/v1/f/{target.submit_token}
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  此端點路徑已隱蔽化，不可猜測。如需重置可在列表中點擊 🔄 按鈕。
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors">取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving && <span className="animate-spin inline-block">🔄</span>}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
