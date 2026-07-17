import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, FolderTree, Eye, TrendingUp } from 'lucide-react'
import { api } from '../lib/api'

interface Stats {
  contentTotal: number
  sortTotal: number
  visitsTotal: number
  todayNew: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    contentTotal: 0,
    sortTotal: 0,
    visitsTotal: 0,
    todayNew: 0,
  })

  useEffect(() => {
    api
      .get<Stats>('/admin/stats')
      .then((res) => {
        const d = res.data as Partial<Stats> | undefined
        setStats({
          contentTotal: d?.contentTotal ?? 0,
          sortTotal: d?.sortTotal ?? 0,
          visitsTotal: d?.visitsTotal ?? 0,
          todayNew: d?.todayNew ?? 0,
        })
      })
      .catch(() => {})
  }, [])

  const cards = [
    { label: '內容總數', value: stats.contentTotal, icon: FileText, to: '/contents' },
    { label: '欄目數量', value: stats.sortTotal, icon: FolderTree, to: '/categories' },
    { label: '總訪問量', value: stats.visitsTotal, icon: Eye, to: '/contents' },
    { label: '今日新增', value: stats.todayNew, icon: TrendingUp, to: '/contents' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">儀表板</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="bg-white rounded-lg border p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <card.icon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
