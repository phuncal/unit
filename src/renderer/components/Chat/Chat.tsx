import { useRef, useEffect, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Send, Upload, Download, ChevronDown,
  Trash2, RefreshCw, Plus, GitBranch, ListFilter,
  Anchor,
} from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { useChat } from '@/hooks/useChat'
import { useExport } from '@/hooks/useExport'
import { ChatSearch } from './ChatSearch'
import { ContextSelector } from './ContextSelector'
import { useArchiveMention, ArchiveMentionPicker } from './useArchiveMention'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'
import type { Message, ContentBlock } from '@/types'
import { ManualPanel } from '@/components/ManualPanel'

// 高亮搜索关键词
function highlightText(text: string | undefined, keyword: string | undefined): React.ReactNode {
  if (!text || !keyword || !keyword.trim()) return text || ''

  const lowerText = text.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  let index = lowerText.indexOf(lowerKeyword)
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index))
    }
    parts.push(
      <mark key={index}>
        {text.slice(index, index + keyword.length)}
      </mark>
    )
    lastIndex = index + keyword.length
    index = lowerText.indexOf(lowerKeyword, lastIndex)
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

// ============================================================
// MessageItem — 100% 照搬 UnitRedesign.jsx 消息结构
// ============================================================
function MessageItem({
  message,
  isStreaming,
  streamingContent,
  highlightKeyword,
  isHighlighted: _isHighlighted,
  onPin,
  onDelete,
  onBranch,
}: {
  message: Message
  isStreaming?: boolean
  streamingContent?: string
  highlightKeyword?: string
  isHighlighted?: boolean
  onPin?: () => void
  onDelete?: () => void
  onBranch?: () => void
}) {
  const isUser = message.role === 'user'
  const content = isStreaming
    ? streamingContent
    : message.content.filter((b) => b.type === 'text').map((b) => b.text || '').join('')

  return (
    <div
      id={`message-${message.id}`}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}
      style={{ padding: '0', transition: 'background 120ms' }}
    >
      <div className={`max-w-2xl ${isUser ? 'text-right' : 'text-left'}`}>
        {/* 角色标签 */}
        <div
          className="text-[9px] font-bold uppercase tracking-widest mb-1.5"
          style={{ color: T.textMuted, opacity: 0.7 }}
        >
          {isUser ? 'OPERATOR' : 'UNIT'}
          {message.pinned && <span style={{ color: T.orange, marginLeft: 6 }}>◆</span>}
        </div>

        {/* 正文 */}
        <div
          className="text-sm leading-relaxed mb-3 whitespace-pre-wrap break-words"
          style={{ color: T.textPrimary }}
        >
          {highlightKeyword ? highlightText(content, highlightKeyword) : content}
        </div>

        {/* 图片 */}
        {!isStreaming && message.content.some((b) => b.type === 'image') && (
          <div className={`flex flex-wrap gap-2 mb-3 ${isUser ? 'justify-end' : ''}`}>
            {message.content.filter((b) => b.type === 'image').map((block, idx) => (
              <img
                key={idx}
                src={`data:${block.image!.mimeType};base64,${block.image!.data}`}
                alt=""
                className="max-w-[200px] max-h-[200px] rounded-sm"
              />
            ))}
          </div>
        )}

        {/* 元信息 + 操作按钮（隐性设计，hover 才出现） */}
        <div
          className={`flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
          {!isUser && !isStreaming && message.generationTime && (
            <span className="text-[10px] font-mono" style={{ color: T.textMuted, opacity: 0.7 }}>
              {(message.generationTime / 1000).toFixed(1)}s
            </span>
          )}
          {!isUser && message.cacheHit && (
            <span className="text-[10px] font-mono" style={{ color: T.accent, opacity: 0.8 }}
              title={`缓存读取 ${message.cacheReadTokens} tokens`}>
              cache
            </span>
          )}
          {!isUser && message.outputTokens && (
            <span className="text-[10px] font-mono" style={{ color: T.textMuted, opacity: 0.7 }}>
              {message.outputTokens}t
            </span>
          )}
          {onPin && (
            <button
              onClick={onPin}
              className="p-1 transition-colors"
              style={{ color: message.pinned ? T.orange : T.textMuted }}
              title={message.pinned ? '取消锚点' : '标记为锚点'}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
              onMouseLeave={(e) => (e.currentTarget.style.color = message.pinned ? T.orange : T.textMuted)}
            >
              <Anchor size={14} strokeWidth={1.5} />
            </button>
          )}
          {onBranch && (
            <button
              onClick={onBranch}
              className="p-1 transition-colors"
              style={{ color: T.textMuted }}
              title="从此处分叉对话"
              onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
            >
              <GitBranch size={14} strokeWidth={1.5} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 transition-colors"
              style={{ color: T.textMuted }}
              title="删除消息"
              onMouseEnter={(e) => (e.currentTarget.style.color = T.warning)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Chat() {
  // 使用单独的 selector 确保正确订阅
  const currentConversation = useConversationsStore((state) => state.currentConversation)
  const toggleMessagePinned = useConversationsStore((state) => state.toggleMessagePinned)
  const deleteMessage = useConversationsStore((state) => state.deleteMessage)
  const createBranch = useConversationsStore((state) => state.createBranch)
  const selectConversation = useConversationsStore((state) => state.selectConversation)
  const setNewConversationDialogOpen = useSettingsStore((state) => state.setNewConversationDialogOpen)
  const { t } = useTranslation()

  const [archiveLoaded, setArchiveLoaded] = useState(false)

  // 说明书面板视图状态
  const [view, setView] = useState<string | null>(null)

  // 直接从 store 获取 streaming 状态，不通过 useChat
  const isStreaming = useConversationsStore((state) => state.isStreaming)
  const streamingContent = useConversationsStore((state) => state.streamingContent)

  const {
    sendMessage,
    canSend,
    regenerateLastMessage,
    contextStats,
    costEstimate,
  } = useChat()
  const { exportAsMarkdown, exportAsText, isExporting, listMdFiles, exportSelectedMdAsDesign, saveToFile } = useExport()
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<ContentBlock[]>([])

  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [showContextSelector, setShowContextSelector] = useState(false)
  const [manualContextIds, setManualContextIds] = useState<string[] | null>(null)

  // 长内容导出提示
  const [longContentPrompt, setLongContentPrompt] = useState<{
    content: string
    messageId: string
  } | null>(null)
  const [exportFileName, setExportFileName] = useState('')

  // 策划文档转换
  const [showDesignDocPanel, setShowDesignDocPanel] = useState(false)
  const [mdFiles, setMdFiles] = useState<string[]>([])
  const [selectedMdFile, setSelectedMdFile] = useState('')
  const [designOutputName, setDesignOutputName] = useState('')

  // 上一次 isStreaming 的值，用于检测流式完成
  const prevStreamingRef = useRef(false)

  const parentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @ 引用档案条目
  const { showPicker, pickerPosition, filteredEntries, selectedIndex, selectEntry } = useArchiveMention({
    input,
    inputRef: textareaRef,
    onInsert: (text) => {
      // 将 @ 及其后面的搜索词替换为选中的条目内容
      const lastAtIndex = input.lastIndexOf('@')
      if (lastAtIndex !== -1) {
        setInput(input.slice(0, lastAtIndex) + text)
      }
    },
  })

  // 检测流式响应完成，若内容超过500字则提示导出
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    if (wasStreaming && !isStreaming && currentConversation) {
      const msgs = currentConversation.messages
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg.role === 'assistant') {
          const text = lastMsg.content.filter((b) => b.type === 'text').map((b) => b.text || '').join('')
          if (text.length > 500 && currentConversation.projectPath) {
            setLongContentPrompt({ content: text, messageId: lastMsg.id })
            setExportFileName(`ai-response-${Date.now()}.md`)
          }
        }
      }
    }
  }, [isStreaming, currentConversation])

  // 检测当前对话是否有档案，用于显示系统提示
  useEffect(() => {
    setArchiveLoaded(false)
    if (!currentConversation?.projectPath) return

    window.api.archive.read(currentConversation.projectPath).then((result) => {
      if (result.success && result.content && result.content.trim()) {
        setArchiveLoaded(true)
      }
    }).catch(() => {})
  }, [currentConversation?.id, currentConversation?.projectPath])

  // 滚动到高亮消息
  const handleHighlight = useCallback((messageId: string) => {
    setHighlightMessageId(messageId)
    const element = document.getElementById(`message-${messageId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    // 3秒后取消高亮
    setTimeout(() => setHighlightMessageId(null), 3000)
  }, [])

  const messages = currentConversation?.messages || []

  // 虚拟滚动器
  const virtualizer = useVirtualizer({
    count: messages.length + (isStreaming ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // 估计每条消息的高度
    overscan: 5, // 预渲染前后各5条
  })

  // 自动滚动到底部
  useEffect(() => {
    if (parentRef.current && messages.length > 0) {
      // 滚动到最后一个元素
      virtualizer.scrollToIndex(messages.length + (isStreaming ? 1 : 0) - 1, {
        align: 'end',
        behavior: 'smooth',
      })
    }
  }, [messages.length, isStreaming, virtualizer])

  // 流式内容更新时也滚动到底部
  useEffect(() => {
    if (isStreaming && parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight
    }
  }, [isStreaming, streamingContent])

  const handleSend = async () => {
    if (!input.trim() && pendingImages.length === 0) return
    if (!canSend) return

    const content: ContentBlock[] = [
      ...pendingImages,
    ]

    if (input.trim()) {
      content.push({ type: 'text', text: input.trim() })
    }

    await sendMessage(content, manualContextIds ?? undefined)
    setInput('')
    setPendingImages([])
    setManualContextIds(null)
  }

  const handleContextSelectorConfirm = async (selectedIds: string[]) => {
    setManualContextIds(selectedIds)
    setShowContextSelector(false)
    // 直接触发发送，此时 manualContextIds 会在下一次渲染生效
    // 用 ref 存储以确保立即可用
    if (!input.trim() && pendingImages.length === 0) return
    if (!canSend) return

    const content: ContentBlock[] = [...pendingImages]
    if (input.trim()) {
      content.push({ type: 'text', text: input.trim() })
    }

    await sendMessage(content, selectedIds)
    setInput('')
    setPendingImages([])
    setManualContextIds(null)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue

      const reader = new FileReader()
      reader.onload = () => {
        const data = reader.result as string
        const base64 = data.split(',')[1]
        const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

        setPendingImages((prev) => [
          ...prev,
          {
            type: 'image',
            image: { data: base64, mimeType },
          },
        ])
      }
      reader.readAsDataURL(file)
    }

    e.target.value = ''
  }

  const handleRemovePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }

  // 拖放文件处理
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    for (const file of files) {
      // 图片文件
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          const data = reader.result as string
          const base64 = data.split(',')[1]
          const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
          setPendingImages((prev) => [
            ...prev,
            {
              type: 'image',
              image: { data: base64, mimeType },
            },
          ])
        }
        reader.readAsDataURL(file)
        continue
      }

      // 文本文件 (.txt, .md)
      if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        try {
          const text = await file.text()
          setInput((prev) => {
            const separator = prev.trim() ? '\n\n' : ''
            return prev + separator + `【文件：${file.name}】\n${text}`
          })
        } catch (error) {
          console.error('Failed to read file:', error)
        }
      }
    }
  }, [])

  // ============================================================
  // 欢迎界面 — 打字机 Logo + 说明书入口
  // ============================================================
  if (!currentConversation) {
    return (
      <main
        className="flex-1 flex flex-col relative overflow-hidden"
        style={{ backgroundColor: T.mainBg, color: T.textPrimary }}
      >
        {/* 顶部拖拽占位 */}
        <div
          className="absolute top-0 left-0 w-full h-12"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        {/* 封面内容 — 打字机 Logo 物理一体化 */}
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-1000 relative">
          <div className="absolute top-0 left-0 w-full h-12" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

          <div className="flex flex-col items-center w-full max-w-2xl -mt-16">

            {/* 打字机 Logo 容器：自适应高度，正常下边距 */}
            <div className="mb-8 relative flex flex-col items-center justify-center w-[320px] mx-auto">
              {/* 底部棚拍阴影层修复：
                  1. 改为 -z-10 避免层级溢出导致遮挡 Modal。
                  2. 加深 bg-black 浓度，降低 blur 值，增强接触面的实体压迫感，解决发飘问题。*/}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[260px] h-[24px] bg-black/30 blur-xl rounded-[100%] pointer-events-none -z-10" />
              <div className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[200px] h-[8px] bg-black/60 blur-md rounded-[100%] pointer-events-none -z-10" />

              {/* 透明 PNG：unit_cover.png，保留阴影，禁止混合模式 */}
              <img
                src="./unit_cover.png"
                alt="Unit Typewriter"
                className="w-full h-auto object-contain opacity-95 drop-shadow-xl"
              />
            </div>

            {/* 描述文字 - 修复：移除了导致穿透到 Modal 弹窗上方的 relative z-20 */}
            <p
              className="text-[10px] font-bold uppercase tracking-[0.45em] mb-6 opacity-60 w-full text-center pl-[0.45em]"
              style={{ color: T.textMuted }}
            >
              {t('standbyDesc')}
            </p>

            {/* 修复：移除了导致穿透到 Modal 弹窗上方的 relative z-20 */}
            <div className="flex flex-col items-center gap-3">
              {/* 新建对话按钮 - 保留原有 onClick */}
              <button
                onClick={() => setNewConversationDialogOpen(true)}
                className="flex items-center gap-3 px-12 py-3.5 rounded-sm transition-all text-[11px] font-bold uppercase tracking-[0.2em] shadow-md hover:brightness-110 active:translate-y-px"
                style={{ backgroundColor: T.accent, color: T.mainBg }}
              >
                <Plus size={14} strokeWidth={3} />
                {t('newChat')}
              </button>
              {/* 说明书入口按钮 */}
              <button
                onClick={() => setView('manual')}
                className="text-[10px] font-bold uppercase tracking-widest transition-colors hover:text-[#D47700]"
                style={{ color: T.textMuted }}
              >
                {t('info')}
              </button>
            </div>
          </div>
        </div>

        {/* 说明书面板 */}
        <ManualPanel
          isOpen={view === 'manual'}
          onClose={() => setView(null)}
        />
      </main>
    )
  }

  // ============================================================
  // 主聊天界面 — 100% 照搬 UnitRedesign.jsx activeSessionId 分支
  // ============================================================
  return (
    <main
      className="flex-1 flex flex-col relative overflow-hidden"
      style={{ backgroundColor: T.mainBg }}
    >
      {/* 标题栏 — 可拖拽区域 */}
      <header
        className="h-12 w-full px-12 flex items-center justify-between shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* 状态指示灯 */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: T.statusGreen,
              boxShadow: `0 0 6px ${T.statusGreen}4d`,
            }}
          />
          <span
            className="text-[11px] font-medium tracking-widest truncate max-w-[300px]"
            style={{ color: T.textPrimary }}
          >
            {currentConversation.name}
          </span>
          {/* 上下文统计 */}
          {contextStats && (
            <span className="text-[10px] font-mono" style={{ color: T.textMuted, opacity: 0.6 }}>
              携带 {contextStats.carried} / {contextStats.total}
              {contextStats.pinned > 0 && ` · ${contextStats.pinned}⚓`}
            </span>
          )}
          {/* 费用预估 */}
          {costEstimate && costEstimate.hasPricing && (
            <span className="text-[10px] font-mono" style={{ color: T.textMuted, opacity: 0.6 }}>
              {costEstimate.estimatedCost}
            </span>
          )}
          {/* 累计费用 */}
          {currentConversation.totalCost > 0 && (
            <span className="text-[10px] font-mono" style={{ color: T.textMuted, opacity: 0.5 }}>
              ${(currentConversation.totalCost || 0).toFixed(3)}
            </span>
          )}
        </div>

        {/* 右侧操作区 — 3 图标，右对齐等距，向右贴到 px-12 边界 */}
        <div
          className="flex items-center gap-6"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* 搜索 */}
          {messages.length > 0 && (
            <ChatSearch onHighlight={handleHighlight} />
          )}

          {/* 导出 — group-hover 悬浮下拉，完全无背景 */}
          {messages.length > 0 && (
            <div className="relative group">
              {/* 触发图标：纯透明，strokeWidth 1.5，hover 橙 */}
              <button
                className="flex items-center gap-0.5 transition-colors"
                style={{ color: T.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                title="导出"
              >
                <Download size={16} strokeWidth={1.5} />
                <ChevronDown size={12} strokeWidth={1.5} />
              </button>

              {/* 悬浮下拉面板 — group-hover 控制，无需 state */}
              <div
                className="absolute right-0 top-full mt-2 z-50 min-w-[160px] border py-1 rounded-sm opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150"
                style={{
                  backgroundColor: T.mainBg,
                  borderColor: T.border,
                  boxShadow: '0 8px 30px rgba(43,42,39,0.08)',
                }}
              >
                {[
                  { label: t('exportMarkdown'), action: async () => { const r = await exportAsMarkdown(); if (r.success) alert('导出成功'); else alert('导出失败: ' + r.error) } },
                  { label: t('exportPinned'), action: async () => { const r = await exportAsMarkdown({ onlyPinned: true }); if (r.success) alert('导出成功'); else alert('导出失败: ' + r.error) } },
                  { label: t('exportText'), action: async () => { const r = await exportAsText(); if (r.success) alert('导出成功'); else alert('导出失败: ' + r.error) } },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="w-full py-2 px-4 text-left text-[12px] transition-colors"
                    style={{ color: T.textMuted }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.hoverBg; e.currentTarget.style.color = T.textPrimary }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = T.textMuted }}
                  >
                    {item.label}
                  </button>
                ))}
                {currentConversation.projectPath && (
                  <>
                    {/* 分割线 — 照搬原型，1px，border 色，opacity 0.5 */}
                    <div className="h-[1px] w-full my-1" style={{ backgroundColor: T.border, opacity: 0.5 }} />
                    <button
                      onClick={async () => {
                        const files = await listMdFiles()
                        setMdFiles(files)
                        setSelectedMdFile(files[0] || '')
                        setDesignOutputName('design-' + Date.now() + '.md')
                        setShowDesignDocPanel(true)
                      }}
                      className="w-full py-2 px-4 text-left text-[12px] transition-colors"
                      style={{ color: T.textMuted }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.hoverBg; e.currentTarget.style.color = T.textPrimary }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = T.textMuted }}
                    >
                      {t('exportDesignDoc')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 重新生成 — 纯图标，hover 橙 */}
          {!isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
            <button
              onClick={regenerateLastMessage}
              className="transition-colors"
              style={{ color: T.textMuted }}
              title={t('regenerate')}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
            >
              <RefreshCw size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      {/* 消息区域 — w-full px-12 与 footer 黄金对齐轴 */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto border-t"
        style={{ borderColor: T.border }}
      >
        <div className="w-full px-12 py-8 space-y-8">
          {/* 档案已加载提示 */}
          {archiveLoaded && (
            <div className="w-full text-center">
              <span className="text-[11px] italic tracking-wide" style={{ color: T.textMuted }}>
                {t('systemReady')}
              </span>
            </div>
          )}

          {messages.length === 0 && !isStreaming && !archiveLoaded && (
            <div className="flex items-center justify-center py-24">
              <p className="text-[12px]" style={{ color: T.textMuted, opacity: 0.5 }}>
                {t('startChat')}
              </p>
            </div>
          )}

          {(messages.length > 0 || isStreaming) && (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const isStreamingItem = virtualItem.index === messages.length
                const message = isStreamingItem ? null : messages[virtualItem.index]

                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                  >
                    {isStreamingItem ? (
                      <MessageItem
                        message={{ id: 'streaming', role: 'assistant', content: [], pinned: false, createdAt: Date.now() }}
                        isStreaming
                        streamingContent={streamingContent}
                      />
                    ) : message ? (
                      <MessageItem
                        message={message}
                        highlightKeyword={highlightMessageId === message.id ? undefined : undefined}
                        isHighlighted={highlightMessageId === message.id}
                        onPin={() => toggleMessagePinned(message.id)}
                        onDelete={() => deleteMessage(message.id)}
                        onBranch={async () => {
                          if (currentConversation) {
                            const newId = await createBranch(currentConversation.id, message.id)
                            selectConversation(newId)
                          }
                        }}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 输入区域 — 100% 照搬 UnitRedesign.jsx footer */}
      <footer
        className="w-full px-12 py-8 border-t z-10 shrink-0"
        style={{
          backgroundColor: isDragging ? 'rgba(71,92,77,0.06)' : T.sidebarBg,
          borderColor: T.border,
          transition: 'background-color 120ms',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="w-full relative group flex flex-col">
          {/* 拖放提示 */}
          {isDragging && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none rounded-sm"
              style={{ backgroundColor: `${T.mainBg}d9` }}
            >
              <p className="text-[12px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
                拖放图片或文本文件到这里
              </p>
            </div>
          )}

          {/* 待发送的图片预览 */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingImages.map((block, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={`data:${block.image!.mimeType};base64,${block.image!.data}`}
                    alt=""
                    className="w-14 h-14 object-cover rounded-sm"
                  />
                  <button
                    onClick={() => handleRemovePendingImage(idx)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center"
                    style={{ backgroundColor: T.warning, color: T.mainBg }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 输入框 — min-h 自然撑开，去除固定 h-32 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={canSend ? t('placeholder') : t('placeholderNoApi')}
            disabled={!canSend || isStreaming}
            className="w-full min-h-[80px] max-h-[40vh] bg-transparent text-sm resize-none focus:outline-none leading-relaxed placeholder:opacity-40 disabled:opacity-50"
            style={{ color: T.textPrimary }}
          />

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between mt-2 pt-2">
            {/* 左侧：Upload + 快捷键提示（档案入口已移至 sidebar） */}
            <div className="flex items-center gap-6">
              <div
                className="flex items-center gap-5 pr-6 border-r opacity-40 group-focus-within:opacity-100 transition-opacity"
                style={{ borderColor: T.border, color: T.textMuted }}
              >
                {/* Upload — 图片上传 */}
                <label
                  className="cursor-pointer transition-colors"
                  title="上传图片"
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                >
                  <Upload size={18} strokeWidth={1.5} />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={!canSend || isStreaming}
                  />
                </label>
              </div>
              <span className="text-[10px] tracking-tighter hidden sm:inline-block" style={{ color: T.textMuted }}>
                {t('shortcut')}
              </span>
            </div>

            {/* 右侧：ListFilter + Send */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowContextSelector(true)}
                disabled={isStreaming}
                className="p-2 rounded-sm transition-all disabled:opacity-40"
                style={{
                  color: manualContextIds ? T.orange : T.textMuted,
                  opacity: manualContextIds ? 1 : 0.4,
                }}
                title={manualContextIds ? `已手动选择 ${manualContextIds.length} 条上下文` : '选择发送的上下文'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                  if (!manualContextIds) e.currentTarget.style.color = T.orange
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = manualContextIds ? '1' : '0.4'
                  if (!manualContextIds) e.currentTarget.style.color = T.textMuted
                }}
              >
                <ListFilter size={20} strokeWidth={1.5} />
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || isStreaming || (!input.trim() && pendingImages.length === 0)}
                className="w-12 h-12 flex items-center justify-center transition-all shadow-sm active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 rounded-sm hover:opacity-90"
                style={{ backgroundColor: T.accent, color: T.mainBg }}
                title="发送"
              >
                <Send size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* 长内容导出提示 */}
      {longContentPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(43,42,39,0.2)' }}
        >
          <div
            className="w-80 border shadow-2xl rounded-sm p-6 space-y-4"
            style={{ backgroundColor: T.mainBg, borderColor: T.border }}
          >
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
              内容较长
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: T.textPrimary }}>
              内容共 {longContentPrompt.content.length} 字，是否导出为 md 文件？
            </p>
            <input
              type="text"
              value={exportFileName}
              onChange={(e) => setExportFileName(e.target.value)}
              placeholder="文件名（如 output.md）"
              className="w-full border-b py-1.5 text-sm outline-none bg-transparent"
              style={{ borderColor: T.border, color: T.textPrimary }}
            />
            <div className="flex justify-end gap-6 pt-2">
              <button
                onClick={() => setLongContentPrompt(null)}
                className="text-[13px] transition-colors"
                style={{ color: T.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
              >
                在对话中显示
              </button>
              <button
                onClick={async () => {
                  if (!exportFileName.trim()) return
                  const name = exportFileName.trim().endsWith('.md') ? exportFileName.trim() : exportFileName.trim() + '.md'
                  const result = await saveToFile(longContentPrompt.content, name)
                  if (result.success) {
                    alert(`已导出到 ${result.path}`)
                  } else {
                    alert('导出失败：' + result.error)
                  }
                  setLongContentPrompt(null)
                }}
                className="text-[13px] transition-colors"
                style={{ color: T.textPrimary }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textPrimary)}
              >
                导出文件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 策划文档转换面板 */}
      {showDesignDocPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(43,42,39,0.2)' }}
        >
          <div
            className="w-96 border shadow-2xl rounded-sm p-6 space-y-5"
            style={{ backgroundColor: T.mainBg, borderColor: T.border }}
          >
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
              {t('exportDesignDoc')}
            </h3>
            {mdFiles.length === 0 ? (
              <p className="text-sm leading-relaxed" style={{ color: T.textPrimary }}>
                绑定目录中未找到 .md 文件
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                    选择输入文件
                  </label>
                  <select
                    value={selectedMdFile}
                    onChange={(e) => setSelectedMdFile(e.target.value)}
                    className="w-full border py-1.5 px-2 text-sm rounded-sm"
                    style={{ backgroundColor: T.sidebarBg, borderColor: T.border, color: T.textPrimary }}
                  >
                    {mdFiles.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                    输出文件名
                  </label>
                  <input
                    type="text"
                    value={designOutputName}
                    onChange={(e) => setDesignOutputName(e.target.value)}
                    placeholder="如 design.md"
                    className="w-full border-b py-1 text-sm bg-transparent"
                    style={{ borderColor: T.border, color: T.textPrimary }}
                  />
                </div>
              </>
            )}
            <div className="flex justify-end gap-6 pt-1">
              <button
                onClick={() => setShowDesignDocPanel(false)}
                className="text-[13px] transition-colors"
                style={{ color: T.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (!selectedMdFile || !designOutputName.trim()) return
                  const name = designOutputName.trim().endsWith('.md') ? designOutputName.trim() : designOutputName.trim() + '.md'
                  const result = await exportSelectedMdAsDesign(selectedMdFile, name)
                  if (result.success) {
                    alert(`已导出到 ${result.path}`)
                    setShowDesignDocPanel(false)
                  } else {
                    alert('转换失败：' + result.error)
                  }
                }}
                disabled={isExporting || mdFiles.length === 0}
                className="text-[13px] transition-colors disabled:opacity-50"
                style={{ color: T.textPrimary }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textPrimary)}
              >
                {isExporting ? '转换中...' : '开始转换'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手动上下文选择器 */}
      <ContextSelector
        isOpen={showContextSelector}
        onClose={() => setShowContextSelector(false)}
        onConfirm={handleContextSelectorConfirm}
      />

      {/* @ 引用档案条目选择器 */}
      <ArchiveMentionPicker
        show={showPicker}
        position={pickerPosition}
        entries={filteredEntries}
        selectedIndex={selectedIndex}
        onSelect={selectEntry}
      />
    </main>
  )
}
