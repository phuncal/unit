import { useState, useMemo } from 'react'
import { X, Check, Pin } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'

interface ContextSelectorProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedIds: string[]) => void
}

export function ContextSelector({ isOpen, onClose, onConfirm }: ContextSelectorProps) {
  const { currentConversation } = useConversationsStore()
  const { settings } = useSettingsStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 初始化：默认选择滑动窗口内的消息 + 锚点消息
  const defaultSelected = useMemo(() => {
    if (!currentConversation) return new Set<string>()

    const messages = currentConversation.messages
    const windowSize = settings.slidingWindowSize
    const recentStart = Math.max(0, messages.length - windowSize)

    const selected = new Set<string>()

    messages.forEach((msg, index) => {
      // 锚点消息或最近 N 条
      if (msg.pinned || index >= recentStart) {
        selected.add(msg.id)
      }
    })

    return selected
  }, [currentConversation, settings.slidingWindowSize])

  // 打开时重置选择
  useMemo(() => {
    if (isOpen) {
      setSelectedIds(new Set(defaultSelected))
    }
  }, [isOpen, defaultSelected])

  if (!isOpen || !currentConversation) return null

  const messages = currentConversation.messages

  const toggleMessage = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(messages.map((m) => m.id)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const selectDefault = () => {
    setSelectedIds(new Set(defaultSelected))
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-[600px] max-h-[80vh] bg-bg-primary rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-medium text-text-primary">选择携带的上下文</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              已选择 {selectedIds.size} / {messages.length} 条消息
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-secondary">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-secondary">
          <button
            onClick={selectAll}
            className="px-3 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            全选
          </button>
          <button
            onClick={selectNone}
            className="px-3 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            全不选
          </button>
          <button
            onClick={selectDefault}
            className="px-3 py-1 text-xs text-accent hover:text-accent transition-colors"
          >
            恢复默认
          </button>
        </div>

        {/* 消息列表 */}
        <div className="max-h-[400px] overflow-y-auto">
          {messages.map((msg, index) => {
            const isSelected = selectedIds.has(msg.id)
            const isPinned = msg.pinned
            const content = msg.content
              .filter((b) => b.type === 'text')
              .map((b) => b.text)
              .join('')
              .slice(0, 100)

            return (
              <div
                key={msg.id}
                onClick={() => toggleMessage(msg.id)}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-accent/5' : 'hover:bg-bg-secondary'
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? 'bg-accent border-accent text-white'
                      : 'border-border'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-text-secondary">
                      #{index + 1} {msg.role === 'user' ? '用户' : 'AI'}
                    </span>
                    {isPinned && (
                      <span className="flex items-center gap-0.5 text-xs text-accent">
                        <Pin className="w-3 h-3" />
                        锚点
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-primary line-clamp-2">{content || '[图片]'}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm rounded-xl hover:bg-bg-secondary active:scale-[0.98] transition-all duration-120 text-text-secondary hover:text-text-primary"
          >
            确认并发送
          </button>
        </div>
      </div>
    </div>
  )
}
