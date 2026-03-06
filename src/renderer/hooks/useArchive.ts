import { useState, useCallback } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { sendNonStreamMessage, applySlidingWindow } from '@/api/client'

const ARCHIVE_UPDATE_PROMPT = `请从“最近对话”里提取可写入项目记忆（archive.md）的新增结论。

要求：
- 已有项目记忆仅用于去重，不能原样重复输出
- 只提取已确认的结论，不要推论过程
- 每条结论单独一行，以"- "开头
- 自由格式，不强制分类
- 如果没有新增结论，只输出"无新增内容"`

export function useArchive() {
  const { currentConversation } = useConversationsStore()
  const { settings } = useSettingsStore()

  const [isUpdating, setIsUpdating] = useState(false)
  const [previewText, setPreviewText] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)

  const updateArchive = useCallback(async () => {
    if (!currentConversation || !currentConversation.projectPath) return
    if (currentConversation.messages.length < 2) {
      return { success: true, empty: true }
    }

    setIsUpdating(true)

    try {
      const archiveResult = await window.api.archive.read(currentConversation.projectPath)
      const existingArchive = archiveResult.success && archiveResult.content
        ? archiveResult.content.trim()
        : ''

      const systemPrompt = [
        ARCHIVE_UPDATE_PROMPT,
        '',
        '以下是已有项目记忆（用于去重，不要重复输出）：',
        existingArchive || '(空)',
      ].join('\n')

      // 应用滑动窗口，减少 archive 更新请求的 token 消耗
      const windowedMessages = applySlidingWindow(
        currentConversation.messages,
        settings.slidingWindowSize
      )

      if (import.meta.env.DEV) {
        console.log('[Archive update] windowed messages:', windowedMessages.length, '/', currentConversation.messages.length)
      }

      // 将分析指令作为最后一条 user 消息追加到对话末尾
      // 这里 system prompt 负责定义规则，最后一条 user 负责触发执行
      const messagesWithPrompt = [
        ...windowedMessages,
        {
          id: 'archive-prompt',
          role: 'user' as const,
          content: [{ type: 'text' as const, text: '请基于以上对话，输出可新增写入 archive.md 的结论。' }],
          pinned: false,
          createdAt: Date.now(),
        },
      ]

      const result = await sendNonStreamMessage(
        settings,
        messagesWithPrompt,
        systemPrompt,
        existingArchive || undefined
      )

      const normalized = result.trim().replace(/^```[\s\S]*?\n|```$/g, '').trim()
      if (!normalized || normalized.includes('无新增内容')) {
        setIsUpdating(false)
        return { success: true, empty: true }
      }

      setPreviewText(normalized)
      setShowPreview(true)

      setIsUpdating(false)
      return { success: true, empty: false }
    } catch (error) {
      console.error('Failed to update archive:', error)
      setIsUpdating(false)
      return { success: false, error }
    }
  }, [currentConversation, settings])

  const confirmUpdate = useCallback(async (text: string) => {
    if (!currentConversation?.projectPath) return

    try {
      const contentToAppend = '\n\n' + text.trim() + '\n'
      await window.api.archive.append(currentConversation.projectPath, contentToAppend)

      setPreviewText('')
      setShowPreview(false)

      return { success: true }
    } catch (error) {
      console.error('Failed to confirm update:', error)
      return { success: false, error }
    }
  }, [currentConversation])

  const cancelUpdate = useCallback(() => {
    setPreviewText('')
    setShowPreview(false)
  }, [])

  const readArchive = useCallback(async () => {
    if (!currentConversation?.projectPath) return null

    try {
      const result = await window.api.archive.read(currentConversation.projectPath)
      if (result.success) {
        return result.content || ''
      }
      return null
    } catch (error) {
      console.error('Failed to read archive:', error)
      return null
    }
  }, [currentConversation])

  return {
    isUpdating,
    previewText,
    showPreview,
    updateArchive,
    confirmUpdate,
    cancelUpdate,
    readArchive,
  }
}
