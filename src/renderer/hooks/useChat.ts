import { useCallback, useMemo } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import {
  sendChatMessage,
  isVisionModel,
  applySlidingWindow,
  estimateCost,
} from '@/api/client'
import {
  type ContentBlock,
  MODEL_PRICING,
  REPLY_STYLE_PROMPTS,
} from '@/types'

export function useChat() {
  // 使用单独的 selector 确保正确订阅
  const currentConversation = useConversationsStore((state) => state.currentConversation)
  const addMessage = useConversationsStore((state) => state.addMessage)
  const setStreaming = useConversationsStore((state) => state.setStreaming)
  const appendStreamingContent = useConversationsStore((state) => state.appendStreamingContent)
  const clearStreamingContent = useConversationsStore((state) => state.clearStreamingContent)
  const updateConversationTokenCount = useConversationsStore((state) => state.updateConversationTokenCount)
  const isStreaming = useConversationsStore((state) => state.isStreaming)
  const streamingContent = useConversationsStore((state) => state.streamingContent)

  const settings = useSettingsStore((state) => state.settings)

  // 计算滑动窗口后的消息
  const contextMessages = useMemo(() => {
    if (!currentConversation) return []

    const allMessages = currentConversation.messages
    const windowSize = settings.slidingWindowSize

    return applySlidingWindow(allMessages, windowSize)
  }, [currentConversation?.messages, settings.slidingWindowSize])

  // 计算上下文统计
  const contextStats = useMemo(() => {
    if (!currentConversation) return null

    const totalMessages = currentConversation.messages.length
    const carriedMessages = contextMessages.length
    const pinnedCount = currentConversation.messages.filter((m) => m.pinned).length

    return {
      total: totalMessages,
      carried: carriedMessages,
      pinned: pinnedCount,
    }
  }, [currentConversation, contextMessages])

  // 构建完整的 system prompt（包括档案内容和回复风格）
  const buildSystemPrompt = useCallback(async (): Promise<string | undefined> => {
    if (!currentConversation) return undefined

    // 获取回复风格（对话级别 > 全局设置）
    const replyStyle = currentConversation.replyStyle || settings.replyStyle
    const stylePrompt = REPLY_STYLE_PROMPTS[replyStyle] || ''

    let systemPrompt = currentConversation.systemPrompt || ''

    // 添加回复风格提示
    if (stylePrompt) {
      systemPrompt = stylePrompt + '\n\n' + systemPrompt
    }

    // 如果有绑定目录，尝试读取 archive.md
    if (currentConversation.projectPath) {
      try {
        const result = await window.api.archive.read(currentConversation.projectPath)
        if (result.success && result.content && result.content.trim()) {
          // 将档案内容作为 system prompt 的一部分
          const archiveSection = `\n\n---\n\n以下是与本次讨论相关的设定档案：\n\n${result.content}`
          systemPrompt = systemPrompt + archiveSection
        }
      } catch (error) {
        console.warn('Failed to read archive:', error)
      }
    }

    return systemPrompt.trim() || undefined
  }, [currentConversation?.id, currentConversation?.systemPrompt, currentConversation?.projectPath, currentConversation?.replyStyle, settings.replyStyle])

  // 计算预估费用
  const costEstimate = useMemo(() => {
    if (!currentConversation || contextMessages.length === 0) {
      return null
    }

    // 这里我们用空字符串作为 system prompt 的简化估算
    // 实际发送时会包含完整内容
    return estimateCost(
      contextMessages,
      '',
      settings.modelName,
      MODEL_PRICING
    )
  }, [contextMessages, settings.modelName])

  const sendMessage = useCallback(async (content: ContentBlock[], overrideContextIds?: string[]) => {
    if (!currentConversation || isStreaming) return

    // 检查是否包含图片且模型不支持视觉
    const hasImage = content.some((block) => block.type === 'image')
    if (hasImage && !isVisionModel(settings.modelName)) {
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

      // 4. 构建包含档案的 system prompt
      const fullSystemPrompt = await buildSystemPrompt()

      // 5. 开始流式响应
      setStreaming(true, '')

      await sendChatMessage(
        settings,
        messagesToSend,
        fullSystemPrompt,
        {
          onToken: (token) => {
            appendStreamingContent(token)
          },
          onComplete: async (fullContent, usage) => {
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

            // 8. 更新 token 计数和费用统计
            await updateConversationTokenCount()
          },
          onError: (error) => {
            console.error('Chat error:', error)
            // 清除流式状态
            clearStreamingContent()

            // 显示错误提示给用户
            alert(`发送消息失败：${error.message}\n\n请检查：\n1. API Endpoint 是否正确\n2. API Key 是否有效\n3. 模型名称是否正确\n4. 网络连接是否正常\n\n详细信息请查看控制台日志。`)
          },
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      // 清除流式状态
      clearStreamingContent()

      // 显示错误提示给用户
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`发送消息时发生错误：${errorMessage}\n\n请检查控制台日志获取详细信息。`)
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
