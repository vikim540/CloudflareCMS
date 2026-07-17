import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

/** 公司信息數據結構 */
interface CompanyInfo {
  name: string
  address: string
  postcode: string
  contact: string
  mobile: string
  phone: string
  fax: string
  email: string
  qq: string
  weixin: string
  icp: string
  blicense: string
  other: string
  legal: string
  business: string
}

/** 空表單初始值 */
const EMPTY_FORM: CompanyInfo = {
  name: '',
  address: '',
  postcode: '',
  contact: '',
  mobile: '',
  phone: '',
  fax: '',
  email: '',
  qq: '',
  weixin: '',
  icp: '',
  blicense: '',
  other: '',
  legal: '',
  business: '',
}

export default function Company() {
  const [form, setForm] = useState<CompanyInfo>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  /** 載入公司信息 */
  const fetchCompany = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<CompanyInfo>('/admin/company')
      if (res.data) {
        setForm({ ...EMPTY_FORM, ...res.data })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入公司信息失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompany()
  }, [fetchCompany])

  /** 表單欄位更新 */
  const updateField = <K extends keyof CompanyInfo>(key: K, value: CompanyInfo[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  /** 提交保存 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('請輸入公司名稱')
      return
    }

    setSaving(true)
    setError('')
    try {
      await api.put('/admin/company', form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <span className="animate-spin inline-block mr-2">🔄</span>
          載入中...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* 頁首 */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xl text-muted-foreground">🏢</span>
        <h1 className="text-2xl font-bold">公司信息</h1>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <span className="shrink-0">⚠️</span>
          {error}
        </div>
      )}

      {/* 成功提示 */}
      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-md text-sm">
          <span className="shrink-0">✅</span>
          公司信息已成功保存
        </div>
      )}

      {/* 表單 */}
      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-lg border p-6">
        {/* 公司名稱 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            公司名稱 <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="請輸入公司名稱"
            required
          />
        </div>

        {/* 法人代表 + 營業執照 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">法人代表</label>
            <input
              type="text"
              value={form.legal}
              onChange={(e) => updateField('legal', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="法人代表姓名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">營業執照號</label>
            <input
              type="text"
              value={form.blicense}
              onChange={(e) => updateField('blicense', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="營業執照註冊號"
            />
          </div>
        </div>

        {/* 公司地址 + 郵編 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">公司地址</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="詳細地址"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">郵編</label>
            <input
              type="text"
              value={form.postcode}
              onChange={(e) => updateField('postcode', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="郵政編碼"
            />
          </div>
        </div>

        {/* 聯繫人 + 手機 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">聯繫人</label>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => updateField('contact', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="聯繫人姓名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">手機</label>
            <input
              type="text"
              value={form.mobile}
              onChange={(e) => updateField('mobile', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="手機號碼"
            />
          </div>
        </div>

        {/* 電話 + 傳真 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">電話</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="固定電話"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">傳真</label>
            <input
              type="text"
              value={form.fax}
              onChange={(e) => updateField('fax', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="傳真號碼"
            />
          </div>
        </div>

        {/* 郵箱 + QQ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">郵箱</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="電子郵箱"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">QQ</label>
            <input
              type="text"
              value={form.qq}
              onChange={(e) => updateField('qq', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="QQ 號碼"
            />
          </div>
        </div>

        {/* 微信 + ICP */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">微信</label>
            <input
              type="text"
              value={form.weixin}
              onChange={(e) => updateField('weixin', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="微信號或公眾號"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ICP 備案號</label>
            <input
              type="text"
              value={form.icp}
              onChange={(e) => updateField('icp', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="ICP 備案號"
            />
          </div>
        </div>

        {/* 經營範圍 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">經營範圍</label>
          <textarea
            value={form.business}
            onChange={(e) => updateField('business', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            placeholder="公司經營範圍"
          />
        </div>

        {/* 其他信息 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">其他信息</label>
          <textarea
            value={form.other}
            onChange={(e) => updateField('other', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            placeholder="其他補充信息"
          />
        </div>

        {/* 操作按鈕 */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm disabled:opacity-50',
            )}
          >
            {saving ? <span className="animate-spin inline-block">🔄</span> : <span>💾</span>}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
