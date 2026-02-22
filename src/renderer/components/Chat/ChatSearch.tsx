import { useState, useEffect, useCallback } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import type { Message } from '@/types'

interface ChatSearchProps {
  onHighlight: (messageId: string) => void
}

export function ChatSearch({ onHighlight }: ChatSearchProps) {
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

    if (searchResults.length > 0) {
      onHighlight(searchResults[0].id)
    }
  }, [keyword, currentConversation, searchMessages, onHighlight])

  useEffect(() => {
    const debounce = setTimeout(() => {
      handleSearch()
    }, 300)
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

  // 快捷键：Cmd/Ctrl + F 打开搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (!currentConversation) return null

  return (
    <div className="relative">
      {/* 搜索按钮 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="p-1 rounded hover:bg-bg-secondary transition-colors text-text-secondary"
          title="搜索对话 (⌘F)"
        >
          <Search className="w-4 h-4" />
        </button>
      )}

      {/* 搜索框 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 bg-bg-primary rounded-lg shadow-lg border border-border p-2">
          <Search className="w-4 h-4 text-text-secondary" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索..."
            className="w-48 px-2 py-1 text-sm bg-transparent outline-none text-text-primary"
            autoFocus
          />
          {results.length > 0 && (
            <>
              <span className="text-xs text-text-secondary">
                {currentIndex + 1}/{results.length}
              </span>
              <button
                onClick={handlePrev}
                className="p-1 rounded hover:bg-bg-secondary transition-colors text-text-secondary"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                className="p-1 rounded hover:bg-bg-secondary transition-colors text-text-secondary"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-bg-secondary transition-colors text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
