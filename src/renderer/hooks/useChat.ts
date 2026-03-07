import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { useUIStore } from '@/store/ui'
import {
  sendChatMessage,
  isVisionModel,
  applySlidingWindow,
  estimateCost,
  estimateMessageTokens,
} from '@/api/client'
import {
  type ContentBlock,
  MODEL_PRICING,
  REPLY_STYLE_PROMPTS,
} from '@/types'
import { conversationDB } from '@/db'

const STREAM_TIMEOUT_MS = 300000  // 5 分钟，适应 DeepSeek R1 等慢速长回复模型

// 模块级 archive 内存缓存（跨渲染保留）
let archiveCacheRef: { content: string; hash: string; conversationId: string } | null = null

function archiveHash(content: string): string {
  return `${content.length}:${content.slice(0, 64)}`
}

export function useChat() {
  // 使用单独的 selector 确保正确订阅
  const currentConversation = useConversationsStore((state) => state.currentConversation)
  const addMessage = useConversationsStore((state) => state.addMessage)
  const setStreaming = useConversationsStore((state) => state.setStreaming)
  const appendStreamingContent = useConversationsStore((state) => state.appendStreamingContent)
  const clearStreamingContent = useConversationsStore((state) => state.clearStreamingContent)
  const updateConversationTokenCount = useConversationsStore((state) => state.updateConversationTokenCount)
  const loadConversations = useConversationsStore((state) => state.loadConversations)
  const isStreaming = useConversationsStore((state) => state.isStreaming)
  const streamingContent = useConversationsStore((state) => state.streamingContent)
  const pushToast = useUIStore((state) => state.pushToast)

  const settings = useSettingsStore((state) => state.settings)

  // 缓存最近一次构建的 system prompt 字符串（用于费用预估）
  const lastSystemPromptRef = useRef<string>('')

  // 对话切换时清空 archive 缓存
  useEffect(() => {
    if (currentConversation?.id && archiveCacheRef?.conversationId !== currentConversation.id) {
      archiveCacheRef = null
    }
  }, [currentConversation?.id])

  // 计算滑动窗口后的消息
  const contextMessages = useMemo(() => {
    if (!currentConversation) return []

    const allMessages = currentConversation.messages
    const windowSize = settings.slidingWindowSize

    return applySlidingWindow(allMessages, windowSize)
  }, [currentConversation, settings.slidingWindowSize])

  // 计算上下文统计（含实际发送 token 数 + pinned token 数）
  const contextStats = useMemo(() => {
    if (!currentConversation) return null

    const totalMessages = currentConversation.messages.length
    const carriedMessages = contextMessages.length
    const pinnedCount = currentConversation.messages.filter((m) => m.pinned).length
    const sentTokens = contextMessages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
    const pinnedTokens = currentConversation.messages
      .filter((m) => m.pinned)
      .reduce((sum, m) => sum + estimateMessageTokens(m), 0)

    return {
      total: totalMessages,
      carried: carriedMessages,
      pinned: pinnedCount,
      sentTokens,
      pinnedTokens,
    }
  }, [currentConversation, contextMessages])

  // 构建 system prompt，返回拆分结果 { base, archive }
  const buildSystemPrompt = useCallback(async (): Promise<{ base: string; archive: string }> => {
    if (!currentConversation) return { base: '', archive: '' }

    // 获取回复风格（对话级别 > 全局设置）
    const replyStyle = currentConversation.replyStyle || settings.replyStyle
    const stylePrompt = REPLY_STYLE_PROMPTS[replyStyle] || ''

    let base = currentConversation.systemPrompt || ''

    // 添加回复风格提示
    if (stylePrompt) {
      base = stylePrompt + '\n\n' + base
    }

    let archive = ''

    // 如果有绑定目录，尝试读取 archive.md（带内存缓存）
    if (currentConversation.projectPath) {
      const convId = currentConversation.id
      if (archiveCacheRef && archiveCacheRef.conversationId === convId) {
        // 命中缓存，跳过磁盘读
        archive = archiveCacheRef.content
      } else {
        try {
          const result = await window.api.archive.read(currentConversation.projectPath)
          if (result.success && result.content && result.content.trim()) {
            archive = result.content.trim()
            archiveCacheRef = {
              content: archive,
              hash: archiveHash(archive),
              conversationId: convId,
            }
            if (import.meta.env.DEV) {
              console.log('[Archive] Read from disk, hash:', archiveHash(archive))
            }
          }
        } catch (error) {
          if (import.meta.env.DEV) console.warn('Failed to read archive:', error)
        }
      }
    }

    return { base: base.trim(), archive }
  }, [currentConversation, settings.replyStyle])

  // 计算历史 assistant 消息输出 token 均值
  const avgOutputTokens = useMemo(() => {
    const msgs = currentConversation?.messages ?? []
    const asstMsgs = msgs.filter((m) => m.role === 'assistant' && (m.outputTokens ?? 0) > 0)
    if (asstMsgs.length === 0) return undefined
    return Math.round(asstMsgs.reduce((s, m) => s + (m.outputTokens ?? 0), 0) / asstMsgs.length)
  }, [currentConversation?.messages])

  // 计算预估费用
  const costEstimate = useMemo(() => {
    if (!currentConversation || contextMessages.length === 0) {
      return null
    }

    return estimateCost(
      contextMessages,
      lastSystemPromptRef.current,
      settings.modelName,
      MODEL_PRICING,
      avgOutputTokens
    )
  }, [currentConversation, contextMessages, settings.modelName, avgOutputTokens])

  const sendMessage = useCallback(async (content: ContentBlock[], overrideContextIds?: string[]) => {
    if (!currentConversation || isStreaming) return

    // 检查是否包含图片且模型不支持视觉
    const hasImage = content.some((block) => block.type === 'image')
    if (hasImage && !isVisionModel(settings.modelName) && import.meta.env.DEV) {
      console.warn('Model may not support images:', settings.modelName)
    }

    const startTime = Date.now()

    // 在添加新消息之前，先快照当前历史消息
    const historyMessages = currentConversation.messages

    try {
      // 1. 添加用户消息（持久化到 DB，同时更新 store 用于 UI 渲染）
      await addMessage('user', content)

      // 2. 构建发送给 AI 的消息列表：历史消息 + 刚写入的新用户消息
      //    直接用快照 + 新构造的消息对象，不依赖 addMessage 后的 store 状态
      const newUserMessage = {
        id: 'pending',
        role: 'user' as const,
        content,
        pinned: false,
        createdAt: Date.now(),
      }
      const allMessages = [...historyMessages, newUserMessage]

      // 3. 应用上下文：若用户手动选择了消息 ID，则按选择过滤；否则走滑动窗口
      let messagesToSend
      if (overrideContextIds) {
        const idSet = new Set(overrideContextIds)
        // 历史消息按 ID 过滤，新用户消息始终包含
        messagesToSend = [
          ...allMessages.slice(0, -1).filter((m) => idSet.has(m.id)),
          newUserMessage,
        ]
      } else {
        messagesToSend = applySlidingWindow(allMessages, settings.slidingWindowSize)
      }

      // 4. 构建包含档案的 system prompt（拆分为 base + archive）
      const { base: basePrompt, archive: archivePrompt } = await buildSystemPrompt()
      // 用于费用预估的完整字符串
      lastSystemPromptRef.current = [basePrompt, archivePrompt].filter(Boolean).join('\n\n---\n\n')

      // 5. 开始流式响应
      setStreaming(true, '')

      let settled = false
      const savePartialAndClear = async (hint: string) => {
        const partial = streamingContent
        clearStreamingContent()
        if (partial.trim()) {
          await addMessage('assistant', [{ type: 'text', text: partial + `\n\n*[${hint}]*` }])
          await updateConversationTokenCount()
        }
      }

      const streamTimeout = window.setTimeout(async () => {
        if (settled) return
        settled = true
        await savePartialAndClear('回复未完成，请求超时')
        pushToast('请求超时，已保存已生成内容。', 'error')
      }, STREAM_TIMEOUT_MS)

      await sendChatMessage(
        settings,
        messagesToSend,
        basePrompt || undefined,
        {
          onToken: (token) => {
            if (settled) return
            appendStreamingContent(token)
          },
          onComplete: async (fullContent, usage) => {
            if (settled) return
            settled = true
            window.clearTimeout(streamTimeout)
            const generationTime = Date.now() - startTime

            // 6. 立即清除流式状态，避免和新消息重叠
            clearStreamingContent()

            // 7. 添加 AI 回复消息（包含 token 用量和生成耗时）
            await addMessage('assistant', [{ type: 'text', text: fullContent }], {
              inputTokens: usage?.promptTokens,
              outputTokens: usage?.completionTokens,
              generationTime,
              cacheHit: usage?.cacheReadTokens ? usage.cacheReadTokens > 0 : undefined,
              cacheReadTokens: usage?.cacheReadTokens,
            })

            // 8. 更新 token 计数
            await updateConversationTokenCount()


            // 9. 写入累计费用统计（仅当有 token 数据时）
            const inputTokens = usage?.promptTokens || 0
            const outputTokens = usage?.completionTokens || 0
            if ((inputTokens > 0 || outputTokens > 0) && currentConversation) {
              const modelEntry = Object.entries(MODEL_PRICING).find(([name]) =>
                settings.modelName.toLowerCase().includes(name.toLowerCase())
              )
              const cost = modelEntry
                ? (inputTokens * modelEntry[1].input + outputTokens * modelEntry[1].output) / 1000
                : 0
              await conversationDB.updateUsageStats(currentConversation.id, inputTokens, outputTokens, cost)
              // 刷新 store 中的对话列表，让费用统计 UI 立即看到更新
              await loadConversations()
            }
          },
          onError: async (error) => {
            if (settled) return
            settled = true
            window.clearTimeout(streamTimeout)
            if (import.meta.env.DEV) console.error('Chat error:', error)
            await savePartialAndClear('回复中断')
            pushToast(`发送失败：${error.message}`, 'error')
          },
        },
        archivePrompt || undefined
      )

      if (!settled) {
        settled = true
        window.clearTimeout(streamTimeout)
        await savePartialAndClear('回复中断')
        pushToast('未收到模型响应，请重试。', 'error')
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to send message:', error)
      // 清除流式状态
      clearStreamingContent()

      const errorMessage = error instanceof Error ? error.message : String(error)
      pushToast(`发送失败：${errorMessage}`, 'error')
    }
  }, [
    currentConversation,
    isStreaming,
    settings,
    addMessage,
    setStreaming,
    appendStreamingContent,
    clearStreamingContent,
    updateConversationTokenCount,
    buildSystemPrompt,
    pushToast,
  ])

  const regenerateLastMessage = useCallback(async () => {
    if (!currentConversation || isStreaming) return

    const messages = currentConversation.messages
    if (messages.length === 0) return

    // 找到最后一条用户消息
    let lastUserMessageIndex = messages.length - 1
    while (lastUserMessageIndex >= 0 && messages[lastUserMessageIndex].role !== 'user') {
      lastUserMessageIndex--
    }

    if (lastUserMessageIndex < 0) return

    // 删除该用户消息之后的所有消息
    const messagesToDelete = messages.slice(lastUserMessageIndex + 1)
    for (const msg of messagesToDelete) {
      await useConversationsStore.getState().deleteMessage(msg.id)
    }

    // 重新发送最后一条用户消息
    const lastUserMessage = messages[lastUserMessageIndex]
    await sendMessage(lastUserMessage.content)
  }, [currentConversation, isStreaming, sendMessage])

  const canSend = useCallback(() => {
    return currentConversation && !isStreaming && settings.apiKey && settings.apiEndpoint
  }, [currentConversation, isStreaming, settings])

  return {
    sendMessage,
    regenerateLastMessage,
    canSend: canSend(),
    isStreaming,
    streamingContent,
    // 新增
    contextMessages,
    contextStats,
    costEstimate,
  }
}
