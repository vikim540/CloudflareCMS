import { useEffect, useState, useCallback } from 'react'
import {
  Plus,
  Edit,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Menu as MenuIcon,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

/** 選單節點 */
interface MenuItem {
  id: number
  name: string
  url: string
  ico: string
  sorting: number
  status: string
  pcode: string
  scode: string
  children?: MenuItem[]
}

/** 選單表單 */
interface MenuForm {
  name: string
  url: string
  ico: string
  sorting: number
  status: string
  pcode: string
}

/** 空表單初始值 */
const EMPTY_FORM: MenuForm = {
  name: '',
  url: '',
  ico: '',
  sorting: 0,
  status: '1',
  pcode: '0',
}

/** 將樹展平為選項列表，用於父選單下拉選擇 */
function flattenForSelect(
  nodes: MenuItem[],
  depth = 0,
  acc: { scode: string; name: string; depth: number }[] = [],
): { scode: string; name: string; depth: number }[] {
  for (const node of nodes) {
    acc.push({ scode: node.scode, name: node.name, depth })
    if (node.children?.length) {
      flattenForSelect(node.children, depth + 1, acc)
    }
  }
  return acc
}

/** 遞迴渲染樹節點行 */
function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  node: MenuItem
  depth: number
  expanded: Set<string>
  onToggle: (scode: string) => void
  onEdit: (node: MenuItem) => void
  onDelete: (node: MenuItem) => void
}) {
  const hasChildren = !!node.children && node.children.length > 0
  const isOpen = expanded.has(node.scode)

  return (
    <>
      <tr className="border-b last:border-b-0 hover:bg-accent/40 transition-colors">
        <td className="py-3 px-4">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 24}px` }}>
            {hasChildren ? (
              <button
                onClick={() => onToggle(node.scode)}
                className="mr-1.5 p-0.5 rounded hover:bg-accent transition-colors shrink-0"
                aria-label={isOpen ? '收起' : '展開'}
              >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="inline-block w-5 mr-1.5 shrink-0" />
            )}
            <span className="font-medium truncate">{node.name}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground">
          {node.url ? (
            <span className="font-mono text-xs">{node.url}</span>
          ) : (
            <span className="text-xs">-</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground">
          {node.ico ? <span className="font-mono text-xs">{node.ico}</span> : '-'}
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground">{node.sorting}</td>
        <td className="py-3 px-4">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
              node.status === '1' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
            )}
          >
            {node.status === '1' ? '啟用' : '禁用'}
          </span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(node)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="編輯"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(node)}
              className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="刪除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {hasChildren &&
        isOpen &&
        node.children!.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  )
}

export default function Menus() {
  const [tree, setTree] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // 對話框狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null)
  const [form, setForm] = useState<MenuForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  /** 拉取選單樹 */
  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<MenuItem[]>('/admin/menus')
      const data = Array.isArray(res.data) ? res.data : []
      setTree(data)
      // 預設展開第一層節點
      setExpanded(new Set(data.map((n) => n.scode)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  /** 切換節點展開/收起 */
  const handleToggle = (scode: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(scode)) next.delete(scode)
      else next.add(scode)
      return next
    })
  }

  /** 全部展開 / 全部收起 */
  const allScodes = flattenForSelect(tree).map((o) => o.scode)
  const allExpanded = allScodes.length > 0 && allScodes.every((s) => expanded.has(s))
  const toggleAll = () => {
    setExpanded(allExpanded ? new Set() : new Set(allScodes))
  }

  /** 開啟新增對話框 */
  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setActionError('')
    setModalOpen(true)
  }

  /** 開啟編輯對話框 */
  const openEdit = (node: MenuItem) => {
    setEditTarget(node)
    setForm({
      name: node.name ?? '',
      url: node.url ?? '',
      ico: node.ico ?? '',
      sorting: node.sorting ?? 0,
      status: node.status ?? '1',
      pcode: node.pcode ?? '0',
    })
    setActionError('')
    setModalOpen(true)
  }

  /** 提交表單 */
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setActionError('選單名稱不能為空')
      return
    }

    setSaving(true)
    setActionError('')
    try {
      const payload = {
        name: form.name.trim(),
        url: form.url,
        ico: form.ico,
        sorting: form.sorting,
        status: form.status,
        pcode: form.pcode,
      }
      if (editTarget) {
        await api.put(`/admin/menus/${editTarget.id}`, payload)
      } else {
        await api.post('/admin/menus', payload)
      }
      setModalOpen(false)
      await fetchTree()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 刪除選單 */
  const handleDelete = async (node: MenuItem) => {
    if (!window.confirm(`確定要刪除選單「${node.name}」嗎?`)) return
    setActionLoading(node.id)
    try {
      await api.del(`/admin/menus/${node.id}`)
      await fetchTree()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗')
    } finally {
      setActionLoading(null)
    }
  }

  const parentOptions = flattenForSelect(tree)

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">選單管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理後台側邊欄選單結構</p>
        </div>
        <div className="flex items-center gap-2">
          {tree.length > 0 && (
            <button
              onClick={toggleAll}
              className="px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
            >
              {allExpanded ? '全部收起' : '全部展開'}
            </button>
          )}
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            新增選單
          </button>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive rounded-md text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 加載中 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          載入中...
        </div>
      )}

      {/* 空狀態 */}
      {!loading && tree.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <MenuIcon className="w-10 h-10 mb-3 opacity-50" />
          <p className="mb-3">尚未創建任何選單</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            新增選單
          </button>
        </div>
      )}

      {/* 選單樹表格 */}
      {!loading && tree.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    名稱
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    URL
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    圖標
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    排序
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    狀態
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {tree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    onToggle={handleToggle}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯對話框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editTarget ? '編輯選單' : '新增選單'}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 名稱 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  名稱 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="請輸入選單名稱"
                  autoFocus
                />
              </div>
              {/* URL */}
              <div>
                <label className="block text-sm font-medium mb-1.5">URL</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="選單連結（可選）"
                />
              </div>
              {/* 圖標 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">圖標</label>
                <input
                  type="text"
                  value={form.ico}
                  onChange={(e) => setForm((f) => ({ ...f, ico: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  placeholder="圖標 class 名稱（可選）"
                />
              </div>
              {/* 父選單 */}
              <div>
                <label className="block text-sm font-medium mb-1.5">父選單</label>
                <select
                  value={form.pcode}
                  onChange={(e) => setForm((f) => ({ ...f, pcode: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                >
                  <option value="0">頂級選單</option>
                  {parentOptions.map((opt) => (
                    <option key={opt.scode} value={opt.scode}>
                      {'　'.repeat(opt.depth)}
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* 排序 + 狀態 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">排序</label>
                  <input
                    type="number"
                    value={form.sorting}
                    onChange={(e) => setForm((f) => ({ ...f, sorting: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="數字越小越靠前"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">狀態</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                  >
                    <option value="1">啟用</option>
                    <option value="0">禁用</option>
                  </select>
                </div>
              </div>
              {actionError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {actionError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
