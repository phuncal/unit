import { useState, useEffect, useCallback } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { T } from '@/lib/tokens'
import type { Message } from '@/types'
import { useTranslation } from '@/lib/i18n'

interface ChatSearchProps {
  onHighlight: (messageId: string) => void
}

export function ChatSearch({ onHighlight }: ChatSearchProps) {
  const { t } = useTranslation()
  const { currentConversation, searchMessages } = useConversationsStore()
  const [isOpen, setIsOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Message[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  const handleSearch = useCallback(async () => {
    if (!keyword.trim() || !currentConversation) {
      setResults([])
      return
    }
    const searchResults = await searchMessages(keyword)
    setResults(searchResults)
    setCurrentIndex(0)
    if (searchResults.length > 0) onHighlight(searchResults[0].id)
  }, [keyword, currentConversation, searchMessages, onHighlight])

  useEffect(() => {
    const debounce = setTimeout(() => { handleSearch() }, 300)
    return () => clearTimeout(debounce)
  }, [keyword, handleSearch])

  const handlePrev = () => {
    if (results.length === 0) return
    const newIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1
    setCurrentIndex(newIndex)
    onHighlight(results[newIndex].id)
  }

  const handleNext = () => {
    if (results.length === 0) return
    const newIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0
    setCurrentIndex(newIndex)
    onHighlight(results[newIndex].id)
  }

  const handleClose = () => {
    setIsOpen(false)
    setKeyword('')
    setResults([])
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (!currentConversation) return null

  return (
    <div className="relative">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title={t('searchTooltip')}
          className="p-1 transition-colors"
          style={{ color: T.textMuted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
        >
          <Search size={15} strokeWidth={1.5} />
        </button>
      )}

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 border shadow-lg p-2 rounded-sm"
          style={{
            backgroundColor: T.mainBg,
            borderColor: T.border,
          }}
        >
          <Search size={13} style={{ color: T.textMuted, flexShrink: 0 }} />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-44 px-1 py-0.5 text-sm bg-transparent outline-none"
            style={{ color: T.textPrimary }}
            autoFocus
          />
          {results.length > 0 && (
            <>
              <span className="text-[10px] font-mono px-1" style={{ color: T.textMuted }}>
                {currentIndex + 1}/{results.length}
              </span>
              <button
                onClick={handlePrev}
                className="p-0.5 transition-colors"
                style={{ color: T.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={handleNext}
                className="p-0.5 transition-colors"
                style={{ color: T.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
              >
                <ChevronDown size={14} />
              </button>
            </>
          )}
          <button
            onClick={handleClose}
            className="p-0.5 transition-colors"
            style={{ color: T.textMuted }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
