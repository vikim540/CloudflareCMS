import { useState } from 'react'
import { cn } from '../lib/utils'
import BookingCalendar from './BookingCalendar'
import BookingSchedule from './BookingSchedule'

type TabKey = 'calendar' | 'schedule'

interface TabConfig {
  key: TabKey
  label: string
  icon: string
}

const TABS: TabConfig[] = [
  { key: 'calendar', label: '日曆圖片', icon: '🖼️' },
  { key: 'schedule', label: '預約排期', icon: '📅' },
]

export default function Booking() {
  const [activeTab, setActiveTab] = useState<TabKey>('calendar')

  return (
    <div className="p-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">講座預約管理</h1>
      </div>

      {/* Tab 切換欄 */}
      <div className="flex gap-1 mb-4 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 內容 */}
      {activeTab === 'calendar' && <BookingCalendar />}
      {activeTab === 'schedule' && <BookingSchedule />}
    </div>
  )
}
