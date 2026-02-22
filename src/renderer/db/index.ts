import Dexie, { type EntityTable } from 'dexie'
import type { ContentBlock } from '@/types'

// 数据库表结构
interface DBConversation {
  id: string
  name: string
  projectPath: string | null
  systemPrompt: string
  replyStyle?: 'concise' | 'standard' | 'detailed'
  tokenCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  createdAt: number
  updatedAt: number
}

interface DBMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: ContentBlock[]
  pinned: boolean
  inputTokens?: number
  outputTokens?: number
  generationTime?: number
  cacheHit?: boolean
  cacheReadTokens?: number
  createdAt: number
}

interface ConversationTemplate {
  id: string
  name: string
  systemPrompt: string
  createdAt: number
}

// 导出类型供外部使用
export type { DBConversation, DBMessage, ConversationTemplate }

// 创建数据库
const db = new Dexie('UnitDB') as Dexie & {
  conversations: EntityTable<DBConversation, 'id'>
  messages: EntityTable<DBMessage, 'id'>
  templates: EntityTable<ConversationTemplate, 'id'>
}

db.version(2).stores({
  conversations: 'id, name, projectPath, createdAt, updatedAt',
  messages: 'id, conversationId, createdAt, pinned',
  templates: 'id, name, createdAt',
})

// 对话操作
export const conversationDB = {
  async create(data: Omit<DBConversation, 'id' | 'createdAt' | 'updatedAt' | 'totalInputTokens' | 'totalOutputTokens' | 'totalCost'>): Promise<string> {
    const now = Date.now()
    const id = crypto.randomUUID()
    await db.conversations.add({
      ...data,
      id,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      createdAt: now,
      updatedAt: now,
    })
    return id
  },

  async getById(id: string) {
    const conv = await db.conversations.get(id)
    if (!conv) return null

    const messages = await this.getMessages(id)
    return {
      ...conv,
      messages,
    }
  },

  async getAll(): Promise<DBConversation[]> {
    return db.conversations.orderBy('updatedAt').reverse().toArray()
  },

  async update(id: string, data: Partial<Omit<DBConversation, 'id' | 'createdAt'>>): Promise<void> {
    await db.conversations.update(id, {
      ...data,
      updatedAt: Date.now(),
    })
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.conversations, db.messages], async () => {
      await db.messages.where('conversationId').equals(id).delete()
      await db.conversations.delete(id)
    })
  },

  async getMessages(conversationId: string) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt')

    return msgs.map(({ conversationId: _, ...msg }) => msg)
  },

  async updateTokenCount(id: string, tokenCount: number): Promise<void> {
    await db.conversations.update(id, {
      tokenCount,
      updatedAt: Date.now(),
    })
  },

  async updateUsageStats(id: string, inputTokens: number, outputTokens: number, cost: number): Promise<void> {
    const conv = await db.conversations.get(id)
    if (!conv) return

    await db.conversations.update(id, {
      totalInputTokens: (conv.totalInputTokens || 0) + inputTokens,
      totalOutputTokens: (conv.totalOutputTokens || 0) + outputTokens,
      totalCost: (conv.totalCost || 0) + cost,
      updatedAt: Date.now(),
    })
  },
}

// 消息操作
export const messageDB = {
  async create(conversationId: string, data: Omit<DBMessage, 'id' | 'createdAt' | 'conversationId'>): Promise<string> {
    const id = crypto.randomUUID()
    const now = Date.now()

    // 使用事务批量操作，减少数据库访问次数
    await db.transaction('rw', [db.messages, db.conversations], async () => {
      await db.messages.add({
        ...data,
        id,
        conversationId,
        createdAt: now,
      })

      // 更新对话的 updatedAt
      await db.conversations.update(conversationId, {
        updatedAt: now,
      })
    })

    return id
  },

  async getById(id: string) {
    const msg = await db.messages.get(id)
    if (!msg) return null
    const { conversationId: _, ...message } = msg
    return message
  },

  async getByConversation(conversationId: string, options?: {
    limit?: number
    offset?: number
  }) {
    let query = db.messages
      .where('conversationId')
      .equals(conversationId)

    const msgs = await query.sortBy('createdAt')

    if (options?.offset || options?.limit) {
      const start = options.offset || 0
      const end = options.limit ? start + options.limit : undefined
      return msgs.slice(start, end).map(({ conversationId: _, ...msg }) => msg)
    }

    return msgs.map(({ conversationId: _, ...msg }) => msg)
  },

  async update(id: string, data: Partial<Omit<DBMessage, 'id' | 'conversationId' | 'createdAt'>>): Promise<void> {
    await db.messages.update(id, data)
  },

  async delete(id: string): Promise<void> {
    const msg = await db.messages.get(id)
    if (msg) {
      const now = Date.now()
      // 使用事务批量操作
      await db.transaction('rw', [db.messages, db.conversations], async () => {
        await db.messages.delete(id)
        await db.conversations.update(msg.conversationId, {
          updatedAt: now,
        })
      })
    }
  },

  async deleteByConversation(conversationId: string): Promise<void> {
    await db.messages.where('conversationId').equals(conversationId).delete()
  },

  async togglePinned(id: string): Promise<boolean> {
    const msg = await db.messages.get(id)
    if (!msg) return false
    const newPinned = !msg.pinned
    await db.messages.update(id, { pinned: newPinned })
    return newPinned
  },

  async search(conversationId: string, keyword: string) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .toArray()

    const lowerKeyword = keyword.toLowerCase()
    return msgs
      .filter((msg) =>
        msg.content.some((block) =>
          block.type === 'text' && block.text?.toLowerCase().includes(lowerKeyword)
        )
      )
      .map(({ conversationId: _, ...msg }) => msg)
  },

  async getPinned(conversationId: string) {
    const msgs = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .filter((msg) => msg.pinned)
      .toArray()

    return msgs
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ conversationId: _, ...msg }) => msg)
  },
}

// 对话模板操作
export const templateDB = {
  async create(data: Omit<ConversationTemplate, 'id' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID()
    await db.templates.add({
      ...data,
      id,
      createdAt: Date.now(),
    })
    return id
  },

  async getAll(): Promise<ConversationTemplate[]> {
    return db.templates.orderBy('createdAt').reverse().toArray()
  },

  async delete(id: string): Promise<void> {
    await db.templates.delete(id)
  },

  async update(id: string, data: Partial<Omit<ConversationTemplate, 'id' | 'createdAt'>>): Promise<void> {
    await db.templates.update(id, data)
  },
}

export { db }
