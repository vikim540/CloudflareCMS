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
    <div className="space-y-4">
      {/* Tab 切換欄 */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 內容 */}
      <div>
        {activeTab === 'calendar' && <BookingCalendar />}
        {activeTab === 'schedule' && <BookingSchedule />}
      </div>
    </div>
  )
}
