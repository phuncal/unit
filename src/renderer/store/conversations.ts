import { create } from 'zustand'
import { conversationDB, messageDB, templateDB } from '@/db'
import type { Conversation, Message, ContentBlock } from '@/types'

interface MessageMetadata {
  inputTokens?: number
  outputTokens?: number
  generationTime?: number
  cacheHit?: boolean
  cacheReadTokens?: number
}

interface ConversationsStore {
  // 状态
  conversations: Array<{
    id: string
    name: string
    projectPath: string | null
    tokenCount: number
    totalCost: number
    updatedAt: number
  }>
  currentConversation: Conversation | null
  templates: Array<{
    id: string
    name: string
    systemPrompt: string
  }>
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string

  // 对话操作
  loadConversations: () => Promise<void>
  createConversation: (name: string, projectPath?: string, systemPrompt?: string) => Promise<string>
  selectConversation: (id: string) => Promise<void>
  updateConversation: (id: string, data: { name?: string; systemPrompt?: string; projectPath?: string | null; replyStyle?: 'concise' | 'standard' | 'detailed' }) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  createBranch: (conversationId: string, messageId: string) => Promise<string>

  // 消息操作
  addMessage: (role: 'user' | 'assistant', content: ContentBlock[], metadata?: MessageMetadata) => Promise<string>
  updateMessage: (messageId: string, content: ContentBlock[]) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  toggleMessagePinned: (messageId: string) => Promise<void>
  searchMessages: (keyword: string) => Promise<Message[]>

  // 流式响应
  setStreaming: (streaming: boolean, content?: string) => void
  appendStreamingContent: (content: string) => void
  clearStreamingContent: () => void

  // Token 计算
  calculateTokenCount: (content: ContentBlock[]) => number
  updateConversationTokenCount: () => Promise<void>

  // 模板操作
  loadTemplates: () => Promise<void>
  createTemplate: (name: string, systemPrompt: string) => Promise<string>
  deleteTemplate: (id: string) => Promise<void>
}

export const useConversationsStore = create<ConversationsStore>()((set, get) => ({
  conversations: [],
  currentConversation: null,
  templates: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',

  loadConversations: async () => {
    set({ isLoading: true })
    try {
      const conversations = await conversationDB.getAll()
      set({ conversations, isLoading: false })
    } catch (error) {
      console.error('Failed to load conversations:', error)
      set({ isLoading: false })
    }
  },

  createConversation: async (name, projectPath, systemPrompt) => {
    const id = await conversationDB.create({
      name,
      projectPath: projectPath || null,
      systemPrompt: systemPrompt || '',
      tokenCount: 0,
    })

    await get().loadConversations()
    await get().selectConversation(id)
    return id
  },

  selectConversation: async (id) => {
    set({ isLoading: true })
    try {
      const conversation = await conversationDB.getById(id)
      set({ currentConversation: conversation, isLoading: false })
    } catch (error) {
      console.error('Failed to select conversation:', error)
      set({ currentConversation: null, isLoading: false })
    }
  },

  updateConversation: async (id, data) => {
    await conversationDB.update(id, data)
    await get().loadConversations()

    const { currentConversation } = get()
    if (currentConversation?.id === id) {
      const updated = await conversationDB.getById(id)
      set({ currentConversation: updated })
    }
  },

  deleteConversation: async (id) => {
    await conversationDB.delete(id)
    await get().loadConversations()

    const { currentConversation } = get()
    if (currentConversation?.id === id) {
      set({ currentConversation: null })
    }
  },

  createBranch: async (conversationId, messageId) => {
    const conversation = await conversationDB.getById(conversationId)
    if (!conversation) throw new Error('Conversation not found')

    const messageIndex = conversation.messages.findIndex((m) => m.id === messageId)
    if (messageIndex === -1) throw new Error('Message not found')

    const messagesToCopy = conversation.messages.slice(0, messageIndex + 1)

    const newId = await conversationDB.create({
      name: `${conversation.name} (分支)`,
      projectPath: conversation.projectPath,
      systemPrompt: conversation.systemPrompt,
      tokenCount: 0,
    })

    for (const msg of messagesToCopy) {
      await messageDB.create(newId, {
        role: msg.role,
        content: msg.content,
        pinned: msg.pinned,
      })
    }

    await get().loadConversations()
    return newId
  },

  addMessage: async (role, content, metadata) => {
    const { currentConversation } = get()
    if (!currentConversation) throw new Error('No conversation selected')

    const messageId = await messageDB.create(currentConversation.id, {
      role,
      content,
      pinned: false,
      inputTokens: metadata?.inputTokens,
      outputTokens: metadata?.outputTokens,
      generationTime: metadata?.generationTime,
      cacheHit: metadata?.cacheHit,
      cacheReadTokens: metadata?.cacheReadTokens,
    })

    // 只更新当前对话，不重新加载所有对话列表
    const updated = await conversationDB.getById(currentConversation.id)
    set({ currentConversation: updated })

    // 异步更新对话列表，不阻塞
    get().loadConversations()

    return messageId
  },

  updateMessage: async (messageId, content) => {
    await messageDB.update(messageId, { content })

    const { currentConversation } = get()
    if (currentConversation) {
      const updated = await conversationDB.getById(currentConversation.id)
      set({ currentConversation: updated })
    }
  },

  deleteMessage: async (messageId) => {
    await messageDB.delete(messageId)

    const { currentConversation } = get()
    if (currentConversation) {
      const updated = await conversationDB.getById(currentConversation.id)
      set({ currentConversation: updated })
    }
  },

  toggleMessagePinned: async (messageId) => {
    await messageDB.togglePinned(messageId)

    const { currentConversation } = get()
    if (currentConversation) {
      const updated = await conversationDB.getById(currentConversation.id)
      set({ currentConversation: updated })
    }
  },

  searchMessages: async (keyword) => {
    const { currentConversation } = get()
    if (!currentConversation) return []

    return messageDB.search(currentConversation.id, keyword)
  },

  setStreaming: (streaming, content = '') => {
    console.log('[Store] setStreaming:', streaming, 'content length:', content.length)
    set({ isStreaming: streaming, streamingContent: content })
  },

  appendStreamingContent: (content) => {
    set((state) => ({
      streamingContent: state.streamingContent + content,
    }))
  },

  clearStreamingContent: () => {
    console.log('[Store] Clearing streaming state')
    set({ isStreaming: false, streamingContent: '' })
  },

  calculateTokenCount: (content) => {
    let count = 0
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        // 中文约 1.5 token/字，英文约 1.3 token/词
        const chineseChars = (block.text.match(/[\u4e00-\u9fa5]/g) || []).length
        const englishWords = block.text
          .replace(/[\u4e00-\u9fa5]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 0).length
        count += Math.ceil(chineseChars * 1.5 + englishWords * 1.3)
      } else if (block.type === 'image' && block.image) {
        // 图片估算为 85 tokens（OpenAI 低分辨率图片）
        count += 85
      }
    }
    return count
  },

  updateConversationTokenCount: async () => {
    const { currentConversation } = get()
    if (!currentConversation) return

    let totalTokens = 0

    // 计算 system prompt
    if (currentConversation.systemPrompt) {
      totalTokens += get().calculateTokenCount([
        { type: 'text', text: currentConversation.systemPrompt },
      ])
    }

    // 计算所有消息
    for (const msg of currentConversation.messages) {
      totalTokens += get().calculateTokenCount(msg.content)
    }

    await conversationDB.updateTokenCount(currentConversation.id, totalTokens)

    // 只更新当前对话，优化性能
    const updated = await conversationDB.getById(currentConversation.id)
    set({ currentConversation: updated })

    // 异步更新对话列表，不阻塞
    get().loadConversations()
  },

  loadTemplates: async () => {
    const templates = await templateDB.getAll()
    set({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        systemPrompt: t.systemPrompt,
      })),
    })
  },

  createTemplate: async (name, systemPrompt) => {
    const id = await templateDB.create({ name, systemPrompt })
    await get().loadTemplates()
    return id
  },

  deleteTemplate: async (id) => {
    await templateDB.delete(id)
    await get().loadTemplates()
  },
}))
