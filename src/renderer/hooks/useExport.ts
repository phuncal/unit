import { useCallback, useState } from 'react'
import { useConversationsStore } from '@/store/conversations'
import { useSettingsStore } from '@/store/settings'
import { sendNonStreamMessage } from '@/api/client'
import type { Message } from '@/types'

const DESIGN_DOC_PROMPT = `请将以下设定档案转换为适合放入游戏开发项目目录、供 Claude Code 或 Cursor 读取的结构化策划文档。
使用 Markdown 格式，包含清晰的分类标题和数据化的属性描述。`

function formatMessageForExport(message: Message): string {
  const parts: string[] = []

  for (const block of message.content) {
    if (block.type === 'text' && block.text) {
      parts.push(block.text)
    } else if (block.type === 'image' && block.image) {
      parts.push(`[图片: ${block.image.mimeType}]`)
    }
  }

  return parts.join('\n')
}

function formatConversationAsMarkdown(
  conversationName: string,
  messages: Message[],
  options?: {
    onlyPinned?: boolean
    includeTimestamps?: boolean
  }
): string {
  const filteredMessages = options?.onlyPinned
    ? messages.filter((m) => m.pinned)
    : messages

  let content = `# ${conversationName}\n\n`

  for (const message of filteredMessages) {
    const role = message.role === 'user' ? '用户' : 'AI'
    const timestamp = options?.includeTimestamps
      ? ` (${new Date(message.createdAt).toLocaleString('zh-CN')})`
      : ''

    content += `## ${role}${timestamp}\n\n`
    content += formatMessageForExport(message)
    content += '\n\n'

    if (message.pinned) {
      content += `*📌 已标记为锚点*\n\n`
    }
  }

  return content
}

export function useExport() {
  const { currentConversation } = useConversationsStore()
  const { settings } = useSettingsStore()

  const [isExporting, setIsExporting] = useState(false)

  const exportAsMarkdown = useCallback(async (
    options?: {
      onlyPinned?: boolean
      includeTimestamps?: boolean
      outputPath?: string
    }
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    if (!currentConversation) {
      return { success: false, error: '没有选中的对话' }
    }

    try {
      const content = formatConversationAsMarkdown(
        currentConversation.name,
        currentConversation.messages,
        options
      )

      const defaultPath = options?.outputPath ||
        `${currentConversation.projectPath || '.'}/${currentConversation.name}.md`

      // 使用 Electron 的保存对话框
      const result = await window.api.file.write(defaultPath, content)

      if (result.success) {
        return { success: true, path: defaultPath }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }, [currentConversation])

  const exportAsText = useCallback(async (
    options?: {
      onlyPinned?: boolean
      outputPath?: string
    }
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    if (!currentConversation) {
      return { success: false, error: '没有选中的对话' }
    }

    try {
      const filteredMessages = options?.onlyPinned
        ? currentConversation.messages.filter((m) => m.pinned)
        : currentConversation.messages

      let content = `${currentConversation.name}\n${'='.repeat(currentConversation.name.length)}\n\n`

      for (const message of filteredMessages) {
        const role = message.role === 'user' ? '用户' : 'AI'
        content += `[${role}]\n`
        content += formatMessageForExport(message)
        content += '\n\n'
      }

      const defaultPath = options?.outputPath ||
        `${currentConversation.projectPath || '.'}/${currentConversation.name}.txt`

      const result = await window.api.file.write(defaultPath, content)

      if (result.success) {
        return { success: true, path: defaultPath }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }, [currentConversation])

  const exportDesignDoc = useCallback(async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    if (!currentConversation?.projectPath) {
      return { success: false, error: '没有绑定项目目录' }
    }

    setIsExporting(true)

    try {
      // 读取 archive.md
      const archiveResult = await window.api.archive.read(currentConversation.projectPath)
      if (!archiveResult.success || !archiveResult.content) {
        setIsExporting(false)
        return { success: false, error: '档案内容为空或读取失败' }
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
      const outputPath = `${currentConversation.projectPath}/design.md`
      const result = await window.api.file.write(outputPath, designDoc)

      setIsExporting(false)

      if (result.success) {
        return { success: true, path: outputPath }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      setIsExporting(false)
      return { success: false, error: (error as Error).message }
    }
  }, [currentConversation, settings])

  const saveToFile = useCallback(async (
    content: string,
    defaultFileName: string
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const basePath = currentConversation?.projectPath || '.'
      const fullPath = `${basePath}/${defaultFileName}`

      const result = await window.api.file.write(fullPath, content)

      if (result.success) {
        return { success: true, path: fullPath }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }, [currentConversation])

  return {
    isExporting,
    exportAsMarkdown,
    exportAsText,
    exportDesignDoc,
    saveToFile,
  }
}
