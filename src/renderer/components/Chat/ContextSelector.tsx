import { useState, useMemo } from 'react'
import { X, Check, Pin } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

interface ContextSelectorProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedIds: string[]) => void
}

export function ContextSelector({ isOpen, onClose, onConfirm }: ContextSelectorProps) {
  const { t, lang } = useTranslation()
  const { currentConversation } = useConversationsStore()
  const { settings } = useSettingsStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const defaultSelected = useMemo(() => {
    if (!currentConversation) return new Set<string>()
    const messages = currentConversation.messages
    const windowSize = settings.slidingWindowSize
    const recentStart = Math.max(0, messages.length - windowSize)
    const selected = new Set<string>()
    messages.forEach((msg, index) => {
      if (msg.pinned || index >= recentStart) selected.add(msg.id)
    })
    return selected
  }, [currentConversation, settings.slidingWindowSize])

  useMemo(() => {
    if (isOpen) setSelectedIds(new Set(defaultSelected))
  }, [isOpen, defaultSelected])

  if (!isOpen || !currentConversation) return null

  const messages = currentConversation.messages

  const toggleMessage = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(messages.map((m) => m.id)))
  const selectNone = () => setSelectedIds(new Set())
  const selectDefault = () => setSelectedIds(new Set(defaultSelected))

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds))
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(43,42,39,0.18)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        className="w-[600px] max-h-[80vh] border shadow-2xl rounded-sm overflow-hidden flex flex-col"
        style={{ backgroundColor: T.mainBg, borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-8 py-5 border-b relative"
          style={{ borderColor: T.border }}
        >
          <div>
            <h2
              className="text-[13px] font-bold tracking-wide"
              style={{ color: T.textPrimary }}
            >
              {t('contextTitle')}
            </h2>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: T.textMuted }}
            >
              {lang === 'zh'
                ? `已选择 ${selectedIds.size} / ${messages.length} 条消息`
                : `${selectedIds.size} / ${messages.length} messages selected`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="absolute right-8 top-5 transition-transform hover:rotate-90"
          >
            <X size={17} style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* 操作按钮行 */}
        <div
          className="flex-shrink-0 flex items-center gap-5 px-8 py-3 border-b"
          style={{ borderColor: T.border }}
        >
          {[
            { label: t('selectAll'), action: selectAll },
            { label: t('selectNone'), action: selectNone },
            { label: t('restoreDefault'), action: selectDefault },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="text-[12px] transition-colors"
              style={{ color: T.textMuted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto">
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
                className="flex gap-4 px-8 py-3 cursor-pointer transition-colors border-b last:border-b-0"
                style={{
                  borderColor: T.border,
                  backgroundColor: isSelected ? 'rgba(71,92,77,0.04)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(43,42,39,0.03)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isSelected ? 'rgba(71,92,77,0.04)' : 'transparent'
                }}
              >
                {/* 复选框 */}
                <div
                  className="mt-0.5 w-4 h-4 border flex items-center justify-center flex-shrink-0 rounded-sm"
                  style={{
                    backgroundColor: isSelected ? T.accent : 'transparent',
                    borderColor: isSelected ? T.accent : T.border,
                  }}
                >
                  {isSelected && <Check size={10} style={{ color: T.mainBg }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: T.textMuted }}
                    >
                      #{index + 1} {msg.role === 'user' ? t('userLabel') : t('aiLabel')}
                    </span>
                    {isPinned && (
                      <span
                        className="flex items-center gap-0.5 text-[10px]"
                        style={{ color: T.orange }}
                      >
                        <Pin size={10} />
                        锚点
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm line-clamp-2 leading-relaxed"
                    style={{ color: T.textPrimary }}
                  >
                    {content || t('imagePlaceholder')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部纯文本按钮 */}
        <div
          className="flex-shrink-0 flex items-center justify-end gap-8 px-8 py-5 border-t"
          style={{ borderColor: T.border }}
        >
          <button
            onClick={onClose}
            className="text-[13px] transition-colors"
            style={{ color: T.textMuted }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className="text-[13px] transition-colors"
            style={{ color: T.textPrimary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.textPrimary)}
          >
            {t('confirmSend')}
          </button>
        </div>
      </div>
    </div>
  )
}
