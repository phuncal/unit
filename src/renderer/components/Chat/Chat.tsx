import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import JSZip from 'jszip'

import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Send, Upload, Download, ChevronDown,
  Trash2, RefreshCw, Plus, GitBranch, ListFilter,
  Anchor, Cpu,
} from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { useUIStore } from '@/store/ui'
import { useChat } from '@/hooks/useChat'
import { useExport } from '@/hooks/useExport'
import { fetchModels } from '@/api/client'
import { ChatSearch } from './ChatSearch'
import { ContextSelector } from './ContextSelector'
import { useArchiveMention, ArchiveMentionPicker } from './useArchiveMention'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'
import {
  getActiveApiConnection,
  normalizeApiConnections,
  type ApiConnectionId,
  type Message,
  type ContentBlock,
} from '@/types'
import { ManualPanel } from '@/components/ManualPanel'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

interface PendingDocument {
  id: string
  name: string
  content: string
  originalLength: number
  truncated: boolean
}

const MAX_PENDING_DOC_CHARS = 12000

function countArchiveEntries(content: string): number {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ')).length
}

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

function applyHighlightToChildren(children: React.ReactNode, keyword?: string): React.ReactNode {
  if (!keyword || !keyword.trim()) return children
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') return highlightText(child, keyword)
    if (React.isValidElement(child) && (child.props as any).children) {
      return React.cloneElement(child, {
        ...(child.props as any),
        children: applyHighlightToChildren((child.props as any).children, keyword),
      })
    }
    return child
  })
}

function MarkdownRenderer({ content, highlightKeyword }: { content: string; highlightKeyword?: string }) {
  const components: Components = {
    p: ({ children }) => (
      <p style={{ marginBottom: 6 }}>
        {applyHighlightToChildren(children, highlightKeyword)}
      </p>
    ),
    h1: ({ children }) => (
      <h3 style={{ fontWeight: 700, marginBottom: 6, marginTop: 12 }}>{children}</h3>
    ),
    h2: ({ children }) => (
      <h3 style={{ fontWeight: 700, marginBottom: 6, marginTop: 12 }}>{children}</h3>
    ),
    h3: ({ children }) => (
      <h4 style={{ fontWeight: 600, marginBottom: 4, marginTop: 10 }}>{children}</h4>
    ),
    h4: ({ children }) => (
      <h4 style={{ fontWeight: 600, marginBottom: 4, marginTop: 10 }}>{children}</h4>
    ),
    h5: ({ children }) => (
      <h4 style={{ fontWeight: 600, marginBottom: 4, marginTop: 8 }}>{children}</h4>
    ),
    h6: ({ children }) => (
      <h4 style={{ fontWeight: 600, marginBottom: 4, marginTop: 8 }}>{children}</h4>
    ),
    code: ({ children, className }) => {
      const isBlock = className?.startsWith('language-')
      if (isBlock) return <code className={className}>{children}</code>
      return (
        <code
          style={{
            fontFamily: 'SF Mono, ui-monospace, monospace',
            backgroundColor: 'rgba(43,42,39,0.07)',
            padding: '1px 5px',
            borderRadius: 3,
            fontSize: '0.9em',
          }}
        >
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre
        style={{
          fontFamily: 'SF Mono, ui-monospace, monospace',
          backgroundColor: 'rgba(43,42,39,0.06)',
          border: '1px solid #D8D6D0',
          borderRadius: 4,
          padding: '8px 12px',
          overflowX: 'auto',
          marginBottom: 8,
          fontSize: '0.85em',
          lineHeight: 1.6,
        }}
      >
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: '2px solid #D8D6D0',
          color: '#8A8880',
          paddingLeft: 12,
          marginLeft: 0,
          marginBottom: 6,
        }}
      >
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <table style={{ borderCollapse: 'collapse', marginBottom: 8, width: '100%' }}>{children}</table>
    ),
    th: ({ children }) => (
      <th style={{ border: '1px solid #D8D6D0', padding: '3px 8px', fontWeight: 600 }}>{children}</th>
    ),
    td: ({ children }) => (
      <td style={{ border: '1px solid #D8D6D0', padding: '3px 8px' }}>{children}</td>
    ),
    hr: () => (
      <hr style={{ borderTop: '1px solid #D8D6D0', margin: '8px 0' }} />
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        style={{ color: '#3D6B5E' }}
        onClick={(e) => e.preventDefault()}
      >
        {children}
      </a>
    ),
    li: ({ children }) => (
      <li style={{ marginBottom: 2 }}>
        {applyHighlightToChildren(children, highlightKeyword)}
      </li>
    ),
    strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}

// ============================================================
// PDF / DOCX extraction (module-level)
// ============================================================
async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pageCount = pdf.numPages
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      pdf.getPage(i + 1).then((p) => p.getTextContent()).then((tc) =>
        tc.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
      )
    )
  )
  return { text: pages.join('\n\n'), pageCount }
}

async function extractDocxText(file: File): Promise<{ text: string; wordCount: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  const text = result.value
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  return { text, wordCount }
}

async function extractPptxText(file: File): Promise<{ text: string; slideCount: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? '0')
      const nb = parseInt(b.match(/\d+/)?.[0] ?? '0')
      return na - nb
    })

  const texts: string[] = []
  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('text')
    // 提取所有 <a:t> 标签内的文本
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? []
    const slideText = matches
      .map((m) => m.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ')
    if (slideText) texts.push(slideText)
  }

  return { text: texts.join('\n\n'), slideCount: slideFiles.length }
}

// ============================================================
// MessageItem — 100% 照搬 UnitRedesign.jsx 消息结构
// ============================================================
function MessageItem({
  message,
  isStreaming,
  streamingContent,
  highlightKeyword,
  onPin,
  onDelete,
  onBranch,
}: {
  message: Message
  isStreaming?: boolean
  streamingContent?: string
  highlightKeyword?: string
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
        {isUser ? (
          <div
            className="text-sm leading-relaxed mb-3 whitespace-pre-wrap break-words"
            style={{ color: T.textPrimary }}
          >
            {highlightKeyword ? highlightText(content, highlightKeyword) : content}
          </div>
        ) : (
          <div
            className="text-sm leading-relaxed mb-3 break-words"
            style={{ color: T.textPrimary }}
          >
            <MarkdownRenderer content={content || ''} highlightKeyword={highlightKeyword} />
          </div>
        )}

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
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const modelsCacheByConnection = useSettingsStore((state) => state.modelsCacheByConnection)
  const setModelsCache = useSettingsStore((state) => state.setModelsCache)
  const isFetchingModels = useSettingsStore((state) => state.isFetchingModels)
  const setIsFetchingModels = useSettingsStore((state) => state.setIsFetchingModels)
  const pushToast = useUIStore((state) => state.pushToast)
  const { t } = useTranslation()

  const [archiveLoaded, setArchiveLoaded] = useState(false)
  const [archiveEntryCount, setArchiveEntryCount] = useState(0)
  const [showModelSwitcher, setShowModelSwitcher] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [quickModelInput, setQuickModelInput] = useState(settings.modelName)
  const [quickManualInput, setQuickManualInput] = useState(false)
  const [quickFetchError, setQuickFetchError] = useState<string | null>(null)

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
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([])
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [highlightKeyword, setHighlightKeyword] = useState<string | undefined>(undefined)
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
  const shouldStickToBottomRef = useRef(true)

  const parentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelSwitcherRef = useRef<HTMLDivElement>(null)

  const apiConnections = useMemo(
    () => normalizeApiConnections(settings.apiConnections),
    [settings.apiConnections]
  )
  const activeConnection = useMemo(
    () => getActiveApiConnection({
      apiConnections,
      activeConnectionId: settings.activeConnectionId,
    }),
    [apiConnections, settings.activeConnectionId]
  )
  const activeModelsCache = modelsCacheByConnection[activeConnection.id]
  const activeModels = useMemo(() => {
    const endpoint = activeConnection.apiEndpoint.replace(/\/+$/, '')
    if (!endpoint || !activeModelsCache) return []
    const cachedEndpoint = activeModelsCache.endpoint.replace(/\/+$/, '')
    return cachedEndpoint === endpoint ? activeModelsCache.models : []
  }, [activeConnection.apiEndpoint, activeModelsCache])
  const filteredQuickModels = useMemo(() => {
    if (!modelSearch.trim()) return activeModels
    const keyword = modelSearch.toLowerCase()
    return activeModels.filter((model) =>
      model.id.toLowerCase().includes(keyword) ||
      (model.name && model.name.toLowerCase().includes(keyword))
    )
  }, [activeModels, modelSearch])

  const getConnectionLabel = useCallback((name: string, index: number): string => {
    const fallback = t('connectionDefaultName').replace('{{index}}', String(index + 1))
    if (!name.trim()) return fallback
    if (/^Connection\s+\d+$/i.test(name.trim())) return fallback
    return name.trim()
  }, [t])
  const activeConnectionIndex = apiConnections.findIndex((conn) => conn.id === activeConnection.id)
  const activeConnectionLabel = getConnectionLabel(activeConnection.name, activeConnectionIndex >= 0 ? activeConnectionIndex : 0)
  const canEditInput = Boolean(currentConversation && activeConnection.apiEndpoint && activeConnection.apiKey)

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
    setArchiveEntryCount(0)
    if (!currentConversation?.projectPath) return

    window.api.archive.read(currentConversation.projectPath).then((result) => {
      if (result.success && result.content && result.content.trim()) {
        setArchiveLoaded(true)
        setArchiveEntryCount(countArchiveEntries(result.content))
      }
    }).catch(() => {})
  }, [currentConversation?.id, currentConversation?.projectPath])

  useEffect(() => {
    setQuickModelInput(settings.modelName)
  }, [settings.modelName, activeConnection.id])

  useEffect(() => {
    if (!showModelSwitcher) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!modelSwitcherRef.current) return
      if (!modelSwitcherRef.current.contains(event.target as Node)) {
        setShowModelSwitcher(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelSwitcher])

  const handleQuickSwitchConnection = useCallback(async (connectionId: ApiConnectionId) => {
    setQuickFetchError(null)
    setQuickManualInput(false)
    setModelSearch('')
    await setSettings({ activeConnectionId: connectionId })
  }, [setSettings])

  const handleQuickApplyModel = useCallback(async (modelName: string) => {
    const nextModel = modelName.trim()
    if (!nextModel) return
    setQuickFetchError(null)
    await setSettings({ modelName: nextModel })
  }, [setSettings])

  const handleQuickFetchModels = useCallback(async () => {
    if (!activeConnection.apiEndpoint || !activeConnection.apiKey) {
      setQuickFetchError(t('fillApiFirst'))
      return
    }
    setQuickFetchError(null)
    setIsFetchingModels(true)
    const result = await fetchModels(activeConnection.apiEndpoint, activeConnection.apiKey)
    setIsFetchingModels(false)
    if (result.success) {
      const cleanEndpoint = activeConnection.apiEndpoint.replace(/\/+$/, '')
      setModelsCache(activeConnection.id, {
        endpoint: cleanEndpoint,
        models: result.models,
        fetchedAt: Date.now(),
      })
      setQuickManualInput(false)
      pushToast(t('modelsUpdated'), 'success')
    } else {
      setQuickFetchError(result.error)
      setQuickManualInput(true)
    }
  }, [
    activeConnection.apiEndpoint,
    activeConnection.apiKey,
    activeConnection.id,
    setIsFetchingModels,
    setModelsCache,
    pushToast,
    t,
  ])

  // 滚动到高亮消息
  const handleHighlight = useCallback((messageId: string, keyword?: string) => {
    setHighlightMessageId(messageId)
    setHighlightKeyword(keyword)
    const element = document.getElementById(`message-${messageId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    // 3秒后取消高亮
    setTimeout(() => {
      setHighlightMessageId(null)
      setHighlightKeyword(undefined)
    }, 3000)
  }, [])

  const messages = currentConversation?.messages || []

  // 虚拟滚动器
  const virtualizer = useVirtualizer({
    count: messages.length + (isStreaming ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // 保守估算，减少滚动位置跳动
    overscan: 5, // 预渲染前后各5条
  })

  const updateStickToBottomState = useCallback(() => {
    const scrollContainer = parentRef.current
    if (!scrollContainer) return
    const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
    shouldStickToBottomRef.current = distanceToBottom < 120
  }, [])

  const scrollToBottom = useCallback((force = false) => {
    const scrollContainer = parentRef.current
    if (!scrollContainer) return
    if (!force && !shouldStickToBottomRef.current) return
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'auto',
    })
  }, [])

  useEffect(() => {
    const scrollContainer = parentRef.current
    if (!scrollContainer) return
    const handleScroll = () => updateStickToBottomState()
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    updateStickToBottomState()
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [updateStickToBottomState])

  // 新消息到达时：若用户在底部附近，自动贴底
  useEffect(() => {
    if (messages.length === 0) return
    const frame = window.requestAnimationFrame(() => {
      scrollToBottom()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages.length, isStreaming, scrollToBottom])

  // 流式内容更新时也滚动到底部
  useEffect(() => {
    if (!isStreaming) return
    scrollToBottom()
  }, [isStreaming, streamingContent, scrollToBottom])

  const isTextDocumentFile = useCallback((file: File) => {
    const name = file.name.toLowerCase()
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
    const textExts = ['.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.rtf']
    const docExts = ['.pdf', '.docx', '.pptx', '.ppt']
    return (
      file.type.startsWith('text/') ||
      file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      file.type === 'application/vnd.ms-powerpoint' ||
      file.type === 'application/json' ||
      file.type === 'application/xml' ||
      file.type === 'application/rtf' ||
      textExts.includes(ext) ||
      docExts.includes(ext)
    )
  }, [])

  const addImageToPending = useCallback((file: File) => {
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
  }, [])

  const addDocumentToPending = useCallback(async (file: File) => {
    setIsProcessingFile(true)
    setFileError(null)
    try {
      const name = file.name.toLowerCase()
      let rawText: string
      let metaInfo = ''

      if (name.endsWith('.pdf') || file.type === 'application/pdf') {
        const { text, pageCount } = await extractPdfText(file)
        rawText = text
        metaInfo = ` (${pageCount} 页)`
      } else if (
        name.endsWith('.docx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const { text, wordCount } = await extractDocxText(file)
        rawText = text
        metaInfo = ` (${wordCount} 字)`
      } else if (
        name.endsWith('.pptx') ||
        name.endsWith('.ppt') ||
        file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        file.type === 'application/vnd.ms-powerpoint'
      ) {
        const { text, slideCount } = await extractPptxText(file)
        rawText = text
        metaInfo = ` (${slideCount} 页)`
      } else {
        rawText = await file.text()
      }

      if (!rawText.trim()) {
        setFileError(`「${file.name}」未能提取到文本内容`)
        return
      }
      const originalLength = rawText.length
      const truncated = originalLength > MAX_PENDING_DOC_CHARS
      const trimmedContent = truncated
        ? `${rawText.slice(0, MAX_PENDING_DOC_CHARS)}\n\n[文档已截断，原始长度 ${originalLength} 字]`
        : rawText

      setPendingDocs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: file.name + metaInfo,
          content: trimmedContent,
          originalLength,
          truncated,
        },
      ])
    } catch (error) {
      console.error('Failed to read file:', error)
      setFileError(`「${file.name}」读取失败，请检查文件格式`)
    } finally {
      setIsProcessingFile(false)
    }
  }, [])

  const buildPendingContent = useCallback((): ContentBlock[] => {
    const content: ContentBlock[] = [...pendingImages]
    if (pendingDocs.length > 0) {
      const docsText = pendingDocs
        .map((doc) => `【文档：${doc.name}】\n${doc.content}`)
        .join('\n\n')
      content.push({ type: 'text', text: docsText })
    }
    if (input.trim()) {
      content.push({ type: 'text', text: input.trim() })
    }
    return content
  }, [pendingImages, pendingDocs, input])

  const clearPendingInputs = useCallback(() => {
    setInput('')
    setPendingImages([])
    setPendingDocs([])
    setManualContextIds(null)
  }, [])

  const handleSend = async () => {
    if (!input.trim() && pendingImages.length === 0 && pendingDocs.length === 0) return
    if (!canSend) return
    const content = buildPendingContent()
    await sendMessage(content, manualContextIds ?? undefined)
    clearPendingInputs()
  }

  const handleContextSelectorConfirm = async (selectedIds: string[]) => {
    setManualContextIds(selectedIds)
    setShowContextSelector(false)
    if (!input.trim() && pendingImages.length === 0 && pendingDocs.length === 0) return
    if (!canSend) return
    const content = buildPendingContent()
    await sendMessage(content, selectedIds)
    clearPendingInputs()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        addImageToPending(file)
        continue
      }

      if (isTextDocumentFile(file)) {
        await addDocumentToPending(file)
      }
    }

    e.target.value = ''
  }

  const handleRemovePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemovePendingDoc = (id: string) => {
    setPendingDocs((prev) => prev.filter((doc) => doc.id !== id))
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
      if (file.type.startsWith('image/')) {
        addImageToPending(file)
        continue
      }

      if (isTextDocumentFile(file)) {
        await addDocumentToPending(file)
      }
    }
  }, [addDocumentToPending, addImageToPending, isTextDocumentFile])

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
          <span
            className="text-[10px] font-mono truncate max-w-[260px]"
            style={{ color: T.textMuted, opacity: 0.75 }}
            title={`${activeConnectionLabel} · ${settings.modelName}`}
          >
            {activeConnectionLabel} · {settings.modelName || t('modelUnconfigured')}
          </span>
          {/* 上下文统计 */}
          {contextStats && (
            <span className="text-[10px] font-mono" style={{ color: T.textMuted, opacity: 0.6 }}>
              携带 {contextStats.carried} / {contextStats.total} · ≈{contextStats.sentTokens}t
              {contextStats.pinned > 0 && (
                <span
                  style={{ color: contextStats.pinnedTokens > 8000 ? T.warning : 'inherit' }}
                  title={contextStats.pinnedTokens > 8000
                    ? `锚点消息共 ~${contextStats.pinnedTokens}t，建议取消部分锚点`
                    : undefined}
                >
                  {' · '}{contextStats.pinned}⚓
                </span>
              )}
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
          <div className="relative" ref={modelSwitcherRef}>
            <button
              type="button"
              onClick={() => setShowModelSwitcher((prev) => !prev)}
              className="flex items-center gap-2 border rounded-sm px-2 py-1 transition-colors"
              style={{ borderColor: T.border, color: T.textMuted, backgroundColor: 'rgba(43,42,39,0.02)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
              title={t('modelSwitcher')}
            >
              <Cpu size={14} strokeWidth={1.5} />
              <span className="text-[10px] font-bold uppercase tracking-wider max-w-[150px] truncate">
                {activeConnectionLabel} · {settings.modelName || t('modelUnconfigured')}
              </span>
              <ChevronDown size={12} strokeWidth={1.5} className={showModelSwitcher ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {showModelSwitcher && (
              <div
                className="absolute right-0 top-full mt-2 z-50 w-[320px] border rounded-sm p-3 space-y-3 shadow-xl"
                style={{
                  backgroundColor: T.mainBg,
                  borderColor: T.border,
                  boxShadow: '0 8px 30px rgba(43,42,39,0.08)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                    {t('modelSwitcher')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickManualInput((prev) => !prev)}
                    className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                    style={{ color: T.textMuted }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                  >
                    {quickManualInput ? t('selectModel') : t('manualInput')}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {apiConnections.map((conn, index) => {
                    const isActive = conn.id === activeConnection.id
                    const isReady = Boolean(conn.apiEndpoint && conn.apiKey)
                    return (
                      <button
                        key={conn.id}
                        type="button"
                        onClick={() => handleQuickSwitchConnection(conn.id)}
                        className="border rounded-sm p-2 text-left transition-colors"
                        style={{
                          borderColor: isActive ? T.accent : T.border,
                          backgroundColor: isActive ? 'rgba(71,92,77,0.08)' : 'transparent',
                        }}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider truncate" style={{ color: T.textPrimary }}>
                            {getConnectionLabel(conn.name, index)}
                          </span>
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: isReady ? T.statusGreen : T.textMuted,
                              boxShadow: isReady ? `0 0 4px ${T.statusGreen}4d` : 'none',
                            }}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleQuickFetchModels}
                    disabled={isFetchingModels || !activeConnection.apiEndpoint || !activeConnection.apiKey}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    style={{ color: T.textMuted }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                  >
                    <RefreshCw size={10} className={isFetchingModels ? 'animate-spin' : ''} />
                    {isFetchingModels ? t('checking') : t('fetchModels')}
                  </button>
                  <span className="text-[10px]" style={{ color: T.textMuted, opacity: 0.75 }}>
                    {activeModels.length > 0
                      ? t('cachedModels').replace('{{count}}', String(activeModels.length))
                      : t('noModelsFetched')}
                  </span>
                </div>

                {quickManualInput || activeModels.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={quickModelInput}
                      onChange={(e) => setQuickModelInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key !== 'Enter') return
                        await handleQuickApplyModel(quickModelInput)
                        setShowModelSwitcher(false)
                      }}
                      placeholder={t('modelName')}
                      className="flex-1 bg-transparent border-b py-1 text-xs outline-none"
                      style={{ borderColor: T.border, color: T.textPrimary }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await handleQuickApplyModel(quickModelInput)
                        setShowModelSwitcher(false)
                      }}
                      className="text-[10px] font-bold uppercase tracking-wider transition-colors"
                      style={{ color: T.accent }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = T.accent)}
                    >
                      {t('applyModel')}
                    </button>
                  </div>
                ) : (
                  <div className="border rounded-sm overflow-hidden" style={{ borderColor: T.border }}>
                    <div className="p-2 border-b" style={{ borderColor: T.border }}>
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder={t('searchModel')}
                        className="w-full bg-transparent text-xs outline-none"
                        style={{ color: T.textPrimary }}
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {filteredQuickModels.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs" style={{ color: T.textMuted }}>
                          {modelSearch ? t('modelNotFound') : t('noModelsFetched')}
                        </div>
                      ) : (
                        filteredQuickModels.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={async () => {
                              await handleQuickApplyModel(model.id)
                              setShowModelSwitcher(false)
                            }}
                            className="w-full px-3 py-2 text-left transition-colors"
                            style={{ backgroundColor: settings.modelName === model.id ? T.hoverBg : 'transparent' }}
                            onMouseEnter={(e) => { if (settings.modelName !== model.id) e.currentTarget.style.backgroundColor = T.hoverBg }}
                            onMouseLeave={(e) => { if (settings.modelName !== model.id) e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            <div className="text-xs" style={{ color: T.textPrimary }}>{model.id}</div>
                            {model.contextLength && (
                              <div className="text-[10px]" style={{ color: T.textMuted }}>
                                {t('contextLength')}: {(model.contextLength / 1000).toFixed(0)}K
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {quickFetchError && (
                  <p className="text-[11px]" style={{ color: T.warning }}>
                    {quickFetchError}
                  </p>
                )}
              </div>
            )}
          </div>

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
                  {
                    label: t('exportMarkdown'),
                    action: async () => {
                      const r = await exportAsMarkdown()
                      if (r.success) pushToast('导出成功', 'success')
                      else pushToast('导出失败: ' + r.error, 'error')
                    },
                  },
                  {
                    label: t('exportPinned'),
                    action: async () => {
                      const r = await exportAsMarkdown({ onlyPinned: true })
                      if (r.success) pushToast('导出成功', 'success')
                      else pushToast('导出失败: ' + r.error, 'error')
                    },
                  },
                  {
                    label: t('exportText'),
                    action: async () => {
                      const r = await exportAsText()
                      if (r.success) pushToast('导出成功', 'success')
                      else pushToast('导出失败: ' + r.error, 'error')
                    },
                  },
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
          {/* 项目记忆状态提示 */}
          <div className="w-full text-center">
            <span className="text-[11px] italic tracking-wide" style={{ color: T.textMuted }}>
              {!currentConversation.projectPath
                ? t('memoryUnbound')
                : archiveLoaded
                  ? t('memoryLoaded').replace('{{count}}', String(archiveEntryCount))
                  : t('systemReady')}
            </span>
          </div>

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
                        highlightKeyword={highlightMessageId === message.id ? highlightKeyword : undefined}
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
                拖放图片或文档到这里（PDF、DOCX、PPTX、TXT、MD、JSON、CSV、XML）
              </p>
            </div>
          )}

          {/* 文件处理错误提示 */}
          {fileError && (
            <div
              className="flex items-center justify-between text-[11px] px-2 py-1 mb-2 rounded-sm"
              style={{ backgroundColor: `${T.warning}18`, color: T.warning }}
            >
              <span>{fileError}</span>
              <button onClick={() => setFileError(null)} className="ml-2 opacity-70 hover:opacity-100">×</button>
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

          {/* 待发送的文档预览 */}
          {pendingDocs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="relative border rounded-sm px-2 py-1 pr-6 text-[11px] max-w-[240px]"
                  style={{ borderColor: T.border, backgroundColor: T.mainBg, color: T.textPrimary }}
                  title={doc.name}
                >
                  <span className="block truncate">
                    {doc.name}
                    {doc.truncated ? ' · 已截断' : ''}
                  </span>
                  <button
                    onClick={() => handleRemovePendingDoc(doc.id)}
                    className="absolute top-0.5 right-1 text-xs"
                    style={{ color: T.warning }}
                    title="移除文档"
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
            placeholder={canEditInput ? t('placeholder') : t('placeholderNoApi')}
            disabled={!canEditInput}
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
                {/* Upload — 图片/文档上传 */}
                <label
                  className="cursor-pointer transition-colors relative"
                  title="上传图片或文档（支持 PDF、DOCX、PPTX、TXT、MD 等）"
                  onMouseEnter={(e) => { if (!isProcessingFile) e.currentTarget.style.color = T.orange }}
                  onMouseLeave={(e) => { if (!isProcessingFile) e.currentTarget.style.color = T.textMuted }}
                  style={{ color: isProcessingFile ? T.accent : undefined }}
                >
                  {isProcessingFile ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-spin" style={{ color: T.accent }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : (
                    <Upload size={18} strokeWidth={1.5} />
                  )}
                  <input
                    type="file"
                    accept="image/*,.txt,.md,.markdown,.pdf,.docx,.pptx,.ppt,.json,.csv,.xml,.rtf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/json,text/csv,application/xml,text/xml,application/rtf"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={!canEditInput || isProcessingFile}
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
                disabled={!canSend || isStreaming || (!input.trim() && pendingImages.length === 0 && pendingDocs.length === 0)}
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
                    pushToast(`已导出到 ${result.path}`, 'success')
                  } else {
                    pushToast('导出失败：' + result.error, 'error')
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
                    pushToast(`已导出到 ${result.path}`, 'success')
                    setShowDesignDocPanel(false)
                  } else {
                    pushToast('转换失败：' + result.error, 'error')
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
