import { useState, useCallback } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { sendNonStreamMessage } from '@/api/client'

const ARCHIVE_UPDATE_PROMPT = `请分析以上对话，提取出新增的、已明确确认的设定结论。
要求：
- 只提取结论，不要过程和推论
- 按分类输出（世界规则 / 人物 / 事件 / 待确认）
- 每条结论独立一行，以"- "开头
- 如果没有新增结论，返回"无新增内容"`

const DESIGN_DOC_PROMPT = `请将以下设定档案转换为适合放入游戏开发项目目录、供 Claude Code 或 Cursor 读取的结构化策划文档。
使用 Markdown 格式，包含清晰的分类标题和数据化的属性描述。`

interface ArchiveEntry {
  category: string
  content: string
  confirmed?: boolean
}

function parseArchiveContent(text: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  const lines = text.split('\n')
  let currentCategory = ''

  for (const line of lines) {
    const trimmed = line.trim()

    // 检测分类标题
    if (trimmed.startsWith('## ')) {
      currentCategory = trimmed.slice(3).trim()
      continue
    }

    // 检测条目
    if (trimmed.startsWith('- ') && currentCategory) {
      entries.push({
        category: currentCategory,
        content: trimmed.slice(2),
      })
    }
  }

  return entries
}

export function useArchive() {
  const { currentConversation } = useConversationsStore()
  const { settings } = useSettingsStore()

  const [isUpdating, setIsUpdating] = useState(false)
  const [previewEntries, setPreviewEntries] = useState<ArchiveEntry[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const updateArchive = useCallback(async () => {
    if (!currentConversation || !currentConversation.projectPath) return

    setIsUpdating(true)

    try {
      // 1. 发送对话内容给 AI 提取设定
      const result = await sendNonStreamMessage(
        settings,
        currentConversation.messages,
        ARCHIVE_UPDATE_PROMPT
      )

      if (result === '无新增内容') {
        setIsUpdating(false)
        return { success: true, entries: [] }
      }

      // 2. 解析结果
      const entries = parseArchiveContent(result)
      setPreviewEntries(entries)
      setShowPreview(true)

      setIsUpdating(false)
      return { success: true, entries }
    } catch (error) {
      console.error('Failed to update archive:', error)
      setIsUpdating(false)
      return { success: false, error }
    }
  }, [currentConversation, settings])

  const confirmUpdate = useCallback(async (selectedEntries: ArchiveEntry[]) => {
    if (!currentConversation?.projectPath) return

    try {
      // 按分类组织条目
      const grouped: Record<string, string[]> = {}
      for (const entry of selectedEntries) {
        if (!grouped[entry.category]) {
          grouped[entry.category] = []
        }
        grouped[entry.category].push(entry.content)
      }

      // 生成要追加的内容
      let contentToAppend = '\n\n'
      for (const [category, items] of Object.entries(grouped)) {
        contentToAppend += `## ${category}\n`
        for (const item of items) {
          contentToAppend += `- ${item}\n`
        }
        contentToAppend += '\n'
      }

      // 追加到 archive.md
      await window.api.archive.append(currentConversation.projectPath, contentToAppend)

      setPreviewEntries([])
      setShowPreview(false)

      return { success: true }
    } catch (error) {
      console.error('Failed to confirm update:', error)
      return { success: false, error }
    }
  }, [currentConversation])

  const cancelUpdate = useCallback(() => {
    setPreviewEntries([])
    setShowPreview(false)
  }, [])

  const readArchive = useCallback(async () => {
    if (!currentConversation?.projectPath) return null

    try {
      const result = await window.api.archive.read(currentConversation.projectPath)
      if (result.success) {
        return parseArchiveContent(result.content || '')
      }
      return null
    } catch (error) {
      console.error('Failed to read archive:', error)
      return null
    }
  }, [currentConversation])

  const exportDesignDoc = useCallback(async () => {
    if (!currentConversation?.projectPath) return

    try {
      // 读取 archive.md
      const archiveResult = await window.api.archive.read(currentConversation.projectPath)
      if (!archiveResult.success || !archiveResult.content) {
        throw new Error('No archive content found')
      }

      // 发送给 AI 转换格式
      const designDoc = await sendNonStreamMessage(
        settings,
        [
          {
            id: 'temp',
            role: 'user',
            content: [{ type: 'text', text: archiveResult.content }],
            pinned: false,
            createdAt: Date.now(),
          },
        ],
        DESIGN_DOC_PROMPT
      )

      // 保存为 design.md
      await window.api.file.write(
        `${currentConversation.projectPath}/design.md`,
        designDoc
      )

      return { success: true }
    } catch (error) {
      console.error('Failed to export design doc:', error)
      return { success: false, error }
    }
  }, [currentConversation, settings])

  return {
    isUpdating,
    previewEntries,
    showPreview,
    updateArchive,
    confirmUpdate,
    cancelUpdate,
    readArchive,
    exportDesignDoc,
  }
}
