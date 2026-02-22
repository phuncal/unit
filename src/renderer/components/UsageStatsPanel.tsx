import { useMemo } from 'react'
import { X, DollarSign, TrendingUp, Calendar } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'

interface UsageStatsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function UsageStatsPanel({ isOpen, onClose }: UsageStatsPanelProps) {
  const { conversations } = useConversationsStore()

  // 计算统计数据
  const stats = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000

    let todayCost = 0
    let weekCost = 0
    let totalCost = 0
    let todayInputTokens = 0
    let todayOutputTokens = 0

    for (const conv of conversations) {
      const convCost = conv.totalCost || 0
      totalCost += convCost

      // 根据 updatedAt 判断是否在时间范围内
      if (conv.updatedAt >= todayStart) {
        todayCost += convCost
      }
      if (conv.updatedAt >= weekStart) {
        weekCost += convCost
      }
    }

    return {
      todayCost,
      weekCost,
      totalCost,
      todayInputTokens,
      todayOutputTokens,
    }
  }, [conversations])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-[400px] bg-bg-primary rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">费用统计</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-secondary">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="p-4 space-y-4">
          {/* 今日消耗 */}
          <div className="flex items-center gap-4 p-4 bg-bg-secondary rounded-lg">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">今日消耗</p>
              <p className="text-xl font-medium text-text-primary">
                ${stats.todayCost.toFixed(4)}
              </p>
            </div>
          </div>

          {/* 本周消耗 */}
          <div className="flex items-center gap-4 p-4 bg-bg-secondary rounded-lg">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">本周消耗</p>
              <p className="text-xl font-medium text-text-primary">
                ${stats.weekCost.toFixed(4)}
              </p>
            </div>
          </div>

          {/* 总计 */}
          <div className="flex items-center gap-4 p-4 bg-bg-secondary rounded-lg">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">总计消耗</p>
              <p className="text-xl font-medium text-text-primary">
                ${stats.totalCost.toFixed(4)}
              </p>
            </div>
          </div>
        </div>

        {/* 说明 */}
        <div className="px-4 pb-4">
          <p className="text-xs text-text-secondary">
            费用基于 API 返回的 token 用量计算，仅统计有价格信息的模型
          </p>
        </div>

        {/* 关闭按钮 */}
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm bg-bg-secondary rounded hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
