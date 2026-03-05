import { useState, useEffect, useCallback } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

interface ArchiveMentionProps {
  input: string
  inputRef: React.RefObject<HTMLTextAreaElement>
  onInsert: (text: string) => void
}

interface ArchiveEntry {
  category: string
  content: string
}

// eslint-disable-next-line react-refresh/only-export-components
export function useArchiveMention({ input, inputRef, onInsert }: ArchiveMentionProps) {
  const { currentConversation } = useConversationsStore()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 })
  const [searchTerm, setSearchTerm] = useState('')
  const [entries, setEntries] = useState<ArchiveEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)

  // 加载档案条目
  const loadEntries = useCallback(async () => {
    if (!currentConversation?.projectPath) {
      setEntries([])
      return
    }

    try {
      const result = await window.api.archive.read(currentConversation.projectPath)
      if (result.success && result.content) {
        const parsed = parseArchiveContent(result.content)
        setEntries(parsed)
      } else {
        setEntries([])
      }
    } catch {
      setEntries([])
    }
  }, [currentConversation?.projectPath])

  // 检测 @ 输入
  useEffect(() => {
    const lastAtIndex = input.lastIndexOf('@')
    if (lastAtIndex === -1) {
      setShowPicker(false)
      setMentionStartIndex(-1)
      return
    }

    // 检查 @ 后面是否还有空格（如果有，说明不是在输入 @mention）
    const textAfterAt = input.slice(lastAtIndex + 1)
    if (textAfterAt.includes('\n') || textAfterAt.includes('  ')) {
      setShowPicker(false)
      return
    }

    // 显示选择器
    setMentionStartIndex(lastAtIndex)
    setSearchTerm(textAfterAt.toLowerCase())
    setShowPicker(true)
    setSelectedIndex(0)
    loadEntries()
  }, [input, loadEntries])

  // 计算选择器位置
  useEffect(() => {
    if (!showPicker || !inputRef.current) return

    const textarea = inputRef.current
    const rect = textarea.getBoundingClientRect()

    // 简单定位：在输入框上方
    setPickerPosition({
      top: rect.top - 200,
      left: rect.left + 20,
    })
  }, [showPicker, inputRef])

  // 过滤条目
  const filteredEntries = entries.filter((entry) =>
    entry.content.toLowerCase().includes(searchTerm) ||
    entry.category.toLowerCase().includes(searchTerm)
  )

  // 选择条目
  const selectEntry = useCallback((entry: ArchiveEntry) => {
    if (mentionStartIndex === -1) return

    // 构建插入文本
    const insertText = `[${entry.category}] ${entry.content}`

    // 调用插入回调
    onInsert(insertText)
    setShowPicker(false)
    setMentionStartIndex(-1)
  }, [mentionStartIndex, onInsert])

  // 键盘导航
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!showPicker) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredEntries.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredEntries.length - 1
        )
        break
      case 'Enter':
        if (filteredEntries.length > 0) {
          e.preventDefault()
          selectEntry(filteredEntries[selectedIndex])
        }
        break
      case 'Escape':
        setShowPicker(false)
        break
    }
  }, [showPicker, filteredEntries, selectedIndex, selectEntry])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    showPicker,
    pickerPosition,
    filteredEntries,
    selectedIndex,
    selectEntry,
  }
}

// 解析 archive.md 内容
function parseArchiveContent(text: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  const lines = text.split('\n')
  let currentCategory = ''

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('## ')) {
      currentCategory = trimmed.slice(3).trim()
      continue
    }

    if (trimmed.startsWith('- ') && currentCategory) {
      entries.push({
        category: currentCategory,
        content: trimmed.slice(2),
      })
    }
  }

  return entries
}

// 选择器组件
export function ArchiveMentionPicker({
  show,
  position,
  entries,
  selectedIndex,
  onSelect,
}: {
  show: boolean
  position: { top: number; left: number }
  entries: ArchiveEntry[]
  selectedIndex: number
  onSelect: (entry: ArchiveEntry) => void
}) {
  const { t } = useTranslation()
  if (!show || entries.length === 0) return null

  return (
    <div
      className="fixed z-50 w-72 border shadow-xl py-1 max-h-60 overflow-y-auto rounded-sm"
      style={{
        top: position.top,
        left: position.left,
        backgroundColor: T.mainBg,
        borderColor: T.border,
      }}
    >
      <div
        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b"
        style={{ color: T.textMuted, borderColor: T.border }}
      >
        {t('archiveMenuTitle')}
      </div>
      {entries.map((entry, index) => (
        <button
          key={`${entry.category}-${index}`}
          onClick={() => onSelect(entry)}
          className="w-full px-3 py-2 text-left text-sm transition-colors"
          style={{
            backgroundColor: index === selectedIndex ? T.sidebarBg : 'transparent',
            color: T.textPrimary,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.sidebarBg)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = index === selectedIndex ? T.sidebarBg : 'transparent')}
        >
          <span className="text-[10px] mr-2" style={{ color: T.accent }}>[{entry.category}]</span>
          <span className="line-clamp-1">{entry.content}</span>
        </button>
      ))}
    </div>
  )
}
