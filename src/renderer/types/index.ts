export type ReplyStyle = 'concise' | 'standard' | 'detailed'

export const API_CONNECTION_IDS = ['conn-1', 'conn-2', 'conn-3'] as const
export type ApiConnectionId = typeof API_CONNECTION_IDS[number]

export interface ApiConnection {
  id: ApiConnectionId
  name: string
  apiEndpoint: string
  apiKey: string
  modelName: string
}

export interface Settings {
  // 当前激活连接（向后兼容：保留顶层字段供现有调用方直接使用）
  apiEndpoint: string
  apiKey: string
  modelName: string
  activeConnectionId: ApiConnectionId
  apiConnections: ApiConnection[]
  maxTokens: number
  contextLimit: number
  slidingWindowSize: number      // 滑动窗口大小，默认 20
  replyStyle: ReplyStyle         // 回复风格
}

export interface Conversation {
  id: string
  name: string
  projectPath: string | null
  systemPrompt: string
  replyStyle?: ReplyStyle        // 对话级别的回复风格
  messages: Message[]
  tokenCount: number
  totalInputTokens: number       // 累计输入 token
  totalOutputTokens: number      // 累计输出 token
  totalCost: number              // 累计费用（美元）
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: ContentBlock[]
  pinned: boolean
  inputTokens?: number           // 输入 token 数
  outputTokens?: number          // 输出 token 数
  generationTime?: number        // 生成耗时（毫秒）
  cacheHit?: boolean             // 是否命中缓存
  cacheReadTokens?: number       // 缓存读取 token 数
  createdAt: number
}

export interface ContentBlock {
  type: 'text' | 'image'
  text?: string
  image?: {
    data: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  }
}

export interface ArchiveEntry {
  id: string
  category: string
  content: string
  confirmed: boolean
  addedAt: number
}

export interface UsageStats {
  todayCost: number
  weekCost: number
  totalCost: number
  todayInputTokens: number
  todayOutputTokens: number
}

// 模型信息（从 /models 接口获取）
export interface ModelInfo {
  id: string
  name?: string           // 显示名称
  contextLength?: number  // 上下文长度
  ownedBy?: string        // 所属厂商
}

// 模型列表缓存
export interface ModelsCache {
  endpoint: string        // 对应的 API endpoint
  models: ModelInfo[]
  fetchedAt: number       // 获取时间戳
}

export type ModelsCacheByConnection = Partial<Record<ApiConnectionId, ModelsCache>>

// 模型价格表（美元 / 1K tokens）
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
  'claude-opus-4-5': { input: 0.015, output: 0.075 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
}

const DEFAULT_CONNECTION_TEMPLATES: Array<
  Omit<ApiConnection, 'apiKey'>
> = [
  {
    id: 'conn-1',
    name: 'Connection 1',
    apiEndpoint: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
  },
  {
    id: 'conn-2',
    name: 'Connection 2',
    apiEndpoint: '',
    modelName: '',
  },
  {
    id: 'conn-3',
    name: 'Connection 3',
    apiEndpoint: '',
    modelName: '',
  },
]

export function createDefaultApiConnections(): ApiConnection[] {
  return DEFAULT_CONNECTION_TEMPLATES.map((conn) => ({
    ...conn,
    apiKey: '',
  }))
}

export function normalizeApiConnections(
  source?: Partial<ApiConnection>[]
): ApiConnection[] {
  const defaults = createDefaultApiConnections()
  const input = Array.isArray(source) ? source : []

  return API_CONNECTION_IDS.map((id, index) => {
    const byId = input.find((conn) => conn?.id === id)
    const byPosition = input[index]
    const raw = byId || byPosition || {}
    const fallback = defaults[index]

    return {
      id,
      name: (raw.name || fallback.name).trim() || fallback.name,
      apiEndpoint: (raw.apiEndpoint || fallback.apiEndpoint).trim(),
      apiKey: raw.apiKey || '',
      modelName: (raw.modelName || fallback.modelName).trim(),
    }
  })
}

export function getActiveApiConnection(
  settings: Pick<Settings, 'apiConnections' | 'activeConnectionId'>
): ApiConnection {
  const connections = normalizeApiConnections(settings.apiConnections)
  return connections.find((conn) => conn.id === settings.activeConnectionId) || connections[0]
}

export function syncSettingsWithActiveConnection(settings: Settings): Settings {
  const apiConnections = normalizeApiConnections(settings.apiConnections)
  const activeConnection = apiConnections.find((conn) => conn.id === settings.activeConnectionId) || apiConnections[0]

  return {
    ...settings,
    activeConnectionId: activeConnection.id,
    apiConnections,
    apiEndpoint: activeConnection.apiEndpoint,
    apiKey: activeConnection.apiKey,
    modelName: activeConnection.modelName,
  }
}

const DEFAULT_CONNECTIONS = createDefaultApiConnections()

export const DEFAULT_SETTINGS: Settings = {
  apiEndpoint: DEFAULT_CONNECTIONS[0].apiEndpoint,
  apiKey: DEFAULT_CONNECTIONS[0].apiKey,
  modelName: DEFAULT_CONNECTIONS[0].modelName,
  activeConnectionId: DEFAULT_CONNECTIONS[0].id,
  apiConnections: DEFAULT_CONNECTIONS,
  maxTokens: 4096,
  contextLimit: 100000,
  slidingWindowSize: 20,
  replyStyle: 'standard',
}

// 回复风格对应的 system prompt 片段
export const REPLY_STYLE_PROMPTS: Record<string, string> = {
  concise: '请保持回复简洁，控制在150字以内，除非用户要求展开。',
  standard: '',
  detailed: '请展开分析，提供详尽的信息和思考过程。',
}
