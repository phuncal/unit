import { useRef, useEffect, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Send, Image as ImageIcon, Pin, Trash2, RefreshCw, Settings, FileText, Download, ChevronDown, GitBranch, Paperclip } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { useChat } from '@/hooks/useChat'
import { useExport } from '@/hooks/useExport'
import { ChatSearch } from './ChatSearch'
import type { Message, ContentBlock } from '@/types'

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
      <mark key={index} className="bg-warning/30 text-inherit rounded px-0.5">
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

function MessageItem({
  message,
  isStreaming,
  streamingContent,
  highlightKeyword,
  isHighlighted,
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
  const content = isStreaming ? streamingContent : message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('')

  return (
    <div
      id={`message-${message.id}`}
      className={`px-6 py-3 group transition-colors duration-120 ${isHighlighted ? 'bg-accent/5' : ''}`}
    >
      <div className={`${isUser ? 'ml-auto max-w-[65%]' : 'mr-auto max-w-[80%]'}`}>
        <div
          className={`px-5 py-4 transition-all duration-120 rounded-2xl ${
            isUser
              ? 'bg-bg-tertiary text-text-primary rounded-tr-sm'
              : 'bg-bg-secondary text-text-primary rounded-tl-sm'
          }`}
        >
          <div className="whitespace-pre-wrap break-words text-[14px] leading-[1.7]">
            {highlightKeyword ? highlightText(content, highlightKeyword) : content}
          </div>
          {/* 图片显示 */}
          {!isStreaming && message.content.some((b) => b.type === 'image') && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.content
                .filter((b) => b.type === 'image')
                .map((block, idx) => (
                  <img
                    key={idx}
                    src={`data:${block.image!.mimeType};base64,${block.image!.data}`}
                    alt=""
                    className="max-w-[200px] max-h-[200px] rounded"
                  />
                ))}
            </div>
          )}
        </div>
        {/* 元信息和操作按钮 */}
        <div className={`flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-120 ${isUser ? 'justify-end' : ''}`}>
          {/* 生成耗时 */}
          {!isUser && !isStreaming && message.generationTime && (
            <span className="text-[11px] text-text-secondary/70 font-mono">
              {(message.generationTime / 1000).toFixed(1)}s
            </span>
          )}
          {/* 缓存命中 */}
          {!isUser && message.cacheHit && (
            <span className="text-[11px] text-accent/80 font-mono" title={`缓存读取 ${message.cacheReadTokens} tokens`}>
              cache
            </span>
          )}
          {/* Token 用量 */}
          {!isUser && message.outputTokens && (
            <span className="text-[11px] text-text-secondary/70 font-mono">
              {message.outputTokens}t
            </span>
          )}
          {onPin && (
            <button
              onClick={onPin}
              className={`p-1.5 rounded-md hover:bg-bg-tertiary transition-colors duration-120 ${message.pinned ? 'text-accent' : 'text-text-secondary/60 hover:text-text-secondary'}`}
              title={message.pinned ? '取消锚点' : '标记为锚点'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}
          {onBranch && (
            <button
              onClick={onBranch}
              className="p-1.5 rounded-md hover:bg-bg-tertiary transition-colors duration-120 text-text-secondary/60 hover:text-text-secondary"
              title="从此处分叉对话"
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-warning/10 transition-colors duration-120 text-text-secondary/60 hover:text-warning"
              title="删除消息"
            >
              <Trash2 className="w-3.5 h-3.5" />
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
  const setSettingsPanelOpen = useSettingsStore((state) => state.setSettingsPanelOpen)
  const [archiveLoaded, setArchiveLoaded] = useState(false)

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
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)

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

  // Textarea 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = '24px'
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = `${Math.min(scrollHeight, 200)}px`
  }, [input])

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

    await sendMessage(content)
    setInput('')
    setPendingImages([])
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

  const handleTextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) continue
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

    e.target.value = ''
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

  // 没有选择对话时显示欢迎界面
  if (!currentConversation) {
    return (
      <div className="flex-1 flex flex-col h-full bg-bg-primary">
        <div className="h-12 drag-region flex items-center justify-center border-b border-border">
          <span className="text-sm text-text-secondary">选择或新建一个对话</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <div>
              <p className="text-text-primary text-[15px] font-medium tracking-wide">Unit</p>
              <p className="text-[13px] text-text-secondary/80 mt-3 leading-relaxed max-w-[320px] mx-auto">
                专注于游戏、影视、文学作品<br/>设定内容的深度讨论
              </p>
            </div>
            <button
              onClick={() => setSettingsPanelOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-bg-secondary active:scale-95 transition-all duration-120 text-sm text-text-secondary hover:text-text-primary"
            >
              <Settings className="w-4 h-4" />
              配置 API
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-primary">
      {/* 标题栏 */}
      <div className="h-12 drag-region flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2 no-drag">
          <span className="text-[13px] font-medium text-text-primary truncate max-w-[300px]">
            {currentConversation.name}
          </span>
          {currentConversation.projectPath && (
            <span title={currentConversation.projectPath}>
              <FileText className="w-[13px] h-[13px] text-text-secondary/60" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 no-drag">
          {/* 上下文统计 */}
          {contextStats && (
            <span className="text-[11px] text-text-secondary/70 font-mono">
              {contextStats.carried}/{contextStats.total}
              {contextStats.pinned > 0 && ` · ${contextStats.pinned}📌`}
            </span>
          )}

          {/* 费用预估 */}
          {costEstimate && costEstimate.hasPricing && (
            <span className="text-[11px] text-text-secondary/70 font-mono">
              {costEstimate.estimatedCost}
            </span>
          )}

          {/* 累计费用 */}
          {currentConversation.totalCost > 0 && (
            <span className="text-[11px] text-text-secondary/70 font-mono">
              ${(currentConversation.totalCost || 0).toFixed(3)}
            </span>
          )}

          {/* 搜索 */}
          {messages.length > 0 && (
            <ChatSearch onHighlight={handleHighlight} />
          )}

          {/* 导出菜单 */}
          {messages.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-bg-secondary transition-colors text-text-secondary"
              >
                <Download className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 z-50 min-w-[180px] bg-bg-primary rounded-xl shadow-xl border border-border py-1">
                    <button
                      onClick={async () => {
                        const result = await exportAsMarkdown()
                        setShowExportMenu(false)
                        if (result.success) {
                          alert('导出成功')
                        } else {
                          alert('导出失败: ' + result.error)
                        }
                      }}
                      className="w-full py-2 text-left text-sm hover:bg-bg-secondary/80 rounded-lg transition-all duration-120 text-text-secondary hover:text-text-primary"
                      style={{ paddingLeft: '14px', paddingRight: '12px' }}
                    >
                      导出为 Markdown
                    </button>
                    <button
                      onClick={async () => {
                        const result = await exportAsMarkdown({ onlyPinned: true })
                        setShowExportMenu(false)
                        if (result.success) {
                          alert('导出成功')
                        } else {
                          alert('导出失败: ' + result.error)
                        }
                      }}
                      className="w-full py-2 text-left text-sm hover:bg-bg-secondary/80 rounded-lg transition-all duration-120 text-text-secondary hover:text-text-primary"
                      style={{ paddingLeft: '14px', paddingRight: '12px' }}
                    >
                      仅导出锚点消息
                    </button>
                    <button
                      onClick={async () => {
                        const result = await exportAsText()
                        setShowExportMenu(false)
                        if (result.success) {
                          alert('导出成功')
                        } else {
                          alert('导出失败: ' + result.error)
                        }
                      }}
                      className="w-full py-2 text-left text-sm hover:bg-bg-secondary/80 rounded-lg transition-all duration-120 text-text-secondary hover:text-text-primary"
                      style={{ paddingLeft: '14px', paddingRight: '12px' }}
                    >
                      导出为纯文本
                    </button>
                    {currentConversation.projectPath && (
                      <button
                        onClick={async () => {
                          setShowExportMenu(false)
                          const files = await listMdFiles()
                          setMdFiles(files)
                          setSelectedMdFile(files[0] || '')
                          setDesignOutputName('design-' + Date.now() + '.md')
                          setShowDesignDocPanel(true)
                        }}
                        className="w-full py-2 text-left text-sm hover:bg-bg-secondary/80 rounded-lg transition-all duration-120 text-text-secondary hover:text-text-primary"
                        style={{ paddingLeft: '14px', paddingRight: '12px' }}
                      >
                        策划文档转换
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
            <button
              onClick={regenerateLastMessage}
              className="p-2 rounded-lg hover:bg-bg-secondary transition-all duration-120 text-text-secondary/60 hover:text-text-secondary"
              title="重新生成"
            >
              <RefreshCw className="w-[16px] h-[16px]" />
            </button>
          )}
        </div>
      </div>

      {/* 消息区域 */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex items-center justify-center h-full">
            {archiveLoaded ? (
              <p className="text-accent text-sm">已读取项目档案，了解之前的讨论内容，可以开始新的对话。</p>
            ) : (
              <p className="text-text-secondary text-sm">开始对话吧</p>
            )}
          </div>
        ) : (
          <>
          {archiveLoaded && (
            <div className="px-6 pt-4 pb-2">
              <p className="text-[12px] text-accent/80 text-center">已读取项目档案，了解之前的讨论内容，可以开始新的对话。</p>
            </div>
          )}
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
          </>
        )}
      </div>

      {/* 输入区域 */}
      <div
        className={`border-t border-border p-4 transition-colors ${isDragging ? 'bg-accent/10' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="max-w-3xl mx-auto relative">
          {/* 拖放提示 */}
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80 rounded-lg z-10 pointer-events-none">
              <p className="text-accent font-medium">拖放图片或文本文件到这里</p>
            </div>
          )}
          {/* 待发送的图片预览 */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingImages.map((block, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={`data:${block.image!.mimeType};base64,${block.image!.data}`}
                    alt=""
                    className="w-16 h-16 object-cover rounded"
                  />
                  <button
                    onClick={() => handleRemovePendingImage(idx)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-warning text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3 bg-bg-secondary rounded-2xl px-5 py-4 border border-border/40 focus-within:border-accent/30 transition-colors duration-120">
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
              placeholder={canSend ? "输入消息，⌘↩ 发送..." : "请先配置 API"}
              rows={1}
              disabled={!canSend || isStreaming}
              className="flex-1 resize-none min-h-[24px] max-h-[200px] text-[14px] leading-[1.6] text-text-primary placeholder:text-text-secondary/60 disabled:opacity-50"
            />
            <div className="flex items-center gap-2">
              <label className="p-2 rounded-lg hover:bg-bg-tertiary transition-all duration-120 text-text-secondary/60 hover:text-text-secondary cursor-pointer" title="上传文本文件 (.txt / .md)">
                <Paperclip className="w-[18px] h-[18px]" />
                <input
                  type="file"
                  accept=".txt,.md"
                  multiple
                  onChange={handleTextFileUpload}
                  className="hidden"
                  disabled={!canSend || isStreaming}
                />
              </label>
              <label className="p-2 rounded-lg hover:bg-bg-tertiary transition-all duration-120 text-text-secondary/60 hover:text-text-secondary cursor-pointer" title="上传图片">
                <ImageIcon className="w-[18px] h-[18px]" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={!canSend || isStreaming}
                />
              </label>
              <button
                onClick={handleSend}
                disabled={!canSend || isStreaming || (!input.trim() && pendingImages.length === 0)}
                className="p-2 rounded-xl hover:bg-bg-tertiary active:scale-95 transition-all duration-120 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 text-text-secondary/60 hover:text-text-secondary"
                title="发送"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 长内容导出提示 */}
      {longContentPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-80 bg-bg-primary rounded-xl shadow-2xl p-5 border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-2">内容较长，是否导出为 md 文件？</h3>
            <p className="text-xs text-text-secondary mb-4">内容共 {longContentPrompt.content.length} 字，可导出到绑定目录</p>
            <input
              type="text"
              value={exportFileName}
              onChange={(e) => setExportFileName(e.target.value)}
              placeholder="文件名（如 output.md）"
              className="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded-lg mb-3 focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
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
                className="flex-1 px-3 py-2 text-sm rounded-xl bg-accent/10 hover:bg-accent/20 transition-all duration-120 text-accent font-medium"
              >
                导出
              </button>
              <button
                onClick={() => setLongContentPrompt(null)}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-border/60 hover:bg-bg-secondary transition-all duration-120 text-text-secondary"
              >
                在对话中显示
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 策划文档转换面板 */}
      {showDesignDocPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-96 bg-bg-primary rounded-xl shadow-2xl p-5 border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-4">策划文档转换</h3>
            {mdFiles.length === 0 ? (
              <p className="text-sm text-text-secondary mb-4">绑定目录中未找到 .md 文件</p>
            ) : (
              <>
                <div className="mb-3">
                  <label className="text-xs text-text-secondary mb-1 block">选择输入文件</label>
                  <select
                    value={selectedMdFile}
                    onChange={(e) => setSelectedMdFile(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent"
                  >
                    {mdFiles.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="text-xs text-text-secondary mb-1 block">输出文件名</label>
                  <input
                    type="text"
                    value={designOutputName}
                    onChange={(e) => setDesignOutputName(e.target.value)}
                    placeholder="如 design.md"
                    className="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-accent"
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
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
                className="flex-1 px-3 py-2 text-sm rounded-xl bg-accent/10 hover:bg-accent/20 transition-all duration-120 text-accent font-medium disabled:opacity-50"
              >
                {isExporting ? '转换中...' : '开始转换'}
              </button>
              <button
                onClick={() => setShowDesignDocPanel(false)}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-border/60 hover:bg-bg-secondary transition-all duration-120 text-text-secondary"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
