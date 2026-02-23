import { useState, useCallback } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { sendNonStreamMessage } from '@/api/client'

const ARCHIVE_UPDATE_PROMPT = `请分析以上对话，提取出新增的、已明确确认的结论或要点。
要求：
- 只提取结论，不要过程和推论
- 自由格式输出，内容是什么写什么，不强制分类
- 如果没有新增结论，返回"无新增内容"`

export function useArchive() {
  const { currentConversation } = useConversationsStore()
  const { settings } = useSettingsStore()

  const [isUpdating, setIsUpdating] = useState(false)
  const [previewText, setPreviewText] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)

  const updateArchive = useCallback(async () => {
    if (!currentConversation || !currentConversation.projectPath) return

    setIsUpdating(true)

    try {
      const result = await sendNonStreamMessage(
        settings,
        currentConversation.messages,
        ARCHIVE_UPDATE_PROMPT
      )

      if (result.trim() === '无新增内容') {
        setIsUpdating(false)
        return { success: true, empty: true }
      }

      setPreviewText(result)
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
