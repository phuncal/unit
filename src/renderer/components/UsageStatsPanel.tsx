import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

interface UsageStatsPanelProps {
  isOpen: boolean
  onClose: () => void
}

// 生成伪随机但视觉稳定的柱高（基于索引，不每次 re-render 变化）
// 最高 60%，最低 5%，确保不触顶，给 SIGNAL MONITOR 标签留呼吸空间
const barHeights = Array.from({ length: 30 }, (_, i) => {
  const seed = Math.sin(i * 2.5) * 0.5 + 0.5
  return Math.round(seed * 55 + 5)
})

export function UsageStatsPanel({ isOpen, onClose }: UsageStatsPanelProps) {
  const { t } = useTranslation()
  const { conversations } = useConversationsStore()

  const stats = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000

    let todayCost = 0
    let weekCost = 0
    let totalCost = 0

    for (const conv of conversations) {
      const convCost = conv.totalCost || 0
      totalCost += convCost
      if (conv.updatedAt >= todayStart) todayCost += convCost
      if (conv.updatedAt >= weekStart) weekCost += convCost
    }

    return { todayCost, weekCost, totalCost }
  }, [conversations])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(43,42,39,0.18)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        className="w-[420px] border shadow-2xl rounded-sm overflow-hidden"
        style={{ backgroundColor: T.mainBg, borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-8 py-5 border-b relative"
          style={{ borderColor: T.border }}
        >
          <h2
            className="text-[13px] font-bold tracking-wide"
            style={{ color: T.textPrimary }}
          >
            {t('usageStats')}
          </h2>
          <button
            onClick={onClose}
            className="absolute right-8 top-5 transition-transform hover:rotate-90"
          >
            <X size={17} style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-8 py-6 space-y-6 pb-8">
          {/* Signal Monitor — 柱状图 */}
          <div
            className="h-28 w-full border flex items-end px-3 gap-0.5 relative overflow-hidden rounded-sm"
            style={{ borderColor: T.border, backgroundColor: 'rgba(43,42,39,0.02)' }}
          >
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="flex-1"
                style={{
                  height: `${h}%`,
                  backgroundColor: T.textMuted,
                  opacity: 0.3,
                }}
              />
            ))}
            {/* 图表标题 */}
            <div
              className="absolute top-2 right-3 text-[9px] font-bold uppercase tracking-widest font-mono"
              style={{ color: T.textMuted, opacity: 0.5 }}
            >
              SIGNAL MONITOR / 30D
            </div>
          </div>

          {/* 三列费用卡片 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '今日 / TODAY', value: `$${stats.todayCost.toFixed(4)}` },
              { label: '本周 / WEEK', value: `$${stats.weekCost.toFixed(4)}` },
              { label: '总计 / TOTAL', value: `$${stats.totalCost.toFixed(4)}` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="border p-4 flex flex-col items-center gap-2 rounded-sm"
                style={{
                  borderColor: T.border,
                  backgroundColor: 'rgba(43,42,39,0.02)',
                  boxShadow: 'inset 0 1px 3px rgba(43,42,39,0.03)',
                }}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-widest text-center leading-tight"
                  style={{ color: T.textMuted }}
                >
                  {label}
                </span>
                <span
                  className="text-xl font-light tracking-tighter font-mono"
                  style={{ color: T.textPrimary }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* 说明 */}
          <p
            className="text-[10px] leading-relaxed"
            style={{ color: T.textMuted, opacity: 0.6 }}
          >
            {t('usageStatsTip')}
          </p>
        </div>
      </div>
    </div>
  )
}
