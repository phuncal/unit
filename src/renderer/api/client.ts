import type { Message, Settings, MODEL_PRICING } from '@/types'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
  cache_control?: { type: 'ephemeral' }
}

interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
  cache_control?: { type: 'ephemeral' }
}

interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (fullContent: string, usage?: StreamUsage) => void
  onError: (error: Error) => void
}

interface StreamUsage {
  promptTokens?: number
  completionTokens?: number
  cacheReadTokens?: number
}

interface CostEstimate {
  inputTokens: number
  estimatedCost: string
  hasPricing: boolean
}

interface ChatRequestBody {
  model: string
  messages: ChatMessage[]
  max_tokens: number
  stream: boolean
  stream_options?: { include_usage: boolean }
}

interface RawModelInfo {
  id?: string
  name?: string
  context_length?: number
  max_tokens?: number
  owned_by?: string
  provider?: string
}

const DEV_LOG = import.meta.env.DEV
type EndpointDeliveryMode = 'stream' | 'non-stream'
const endpointModeCache = new Map<string, EndpointDeliveryMode>()

function createAttemptError(message: string, canFallback = true): Error & { canFallback: boolean } {
  const error = new Error(message) as Error & { canFallback: boolean }
  error.canFallback = canFallback
  return error
}

function normalizeContentValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const part = item as { text?: unknown; type?: unknown }
          if (typeof part.text === 'string') return part.text
          if (typeof part.type === 'string' && part.type === 'text' && typeof (item as { value?: unknown }).value === 'string') {
            return (item as { value: string }).value
          }
        }
        return ''
      })
      .join('')
  }
  return ''
}

function extractContentFromChunk(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return ''
  const data = parsed as {
    choices?: Array<{
      delta?: { content?: unknown; text?: unknown }
      message?: { content?: unknown }
      text?: unknown
    }>
    delta?: { text?: unknown; content?: unknown }
    text?: unknown
    output_text?: unknown
    output?: Array<{ content?: unknown }>
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
  }

  return (
    normalizeContentValue(data.choices?.[0]?.delta?.content) ||
    normalizeContentValue(data.choices?.[0]?.delta?.text) ||
    normalizeContentValue(data.choices?.[0]?.message?.content) ||
    normalizeContentValue(data.choices?.[0]?.text) ||
    normalizeContentValue(data.delta?.text) ||
    normalizeContentValue(data.delta?.content) ||
    normalizeContentValue(data.output_text) ||
    normalizeContentValue(data.output?.[0]?.content) ||
    normalizeContentValue(data.text) ||
    normalizeContentValue(data.candidates?.[0]?.content?.parts?.[0]?.text)
  )
}

function extractContentFromResponseBody(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return ''
  const data = parsed as {
    choices?: Array<{
      message?: { content?: unknown }
      text?: unknown
    }>
    output_text?: unknown
    output?: Array<{ content?: unknown }>
    text?: unknown
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
  }

  return (
    normalizeContentValue(data.choices?.[0]?.message?.content) ||
    normalizeContentValue(data.choices?.[0]?.text) ||
    normalizeContentValue(data.output_text) ||
    normalizeContentValue(data.output?.[0]?.content) ||
    normalizeContentValue(data.text) ||
    normalizeContentValue(data.candidates?.[0]?.content?.parts?.[0]?.text)
  )
}

// 检查是否是 Anthropic API
function isAnthropicApi(endpoint: string): boolean {
  return endpoint.includes('anthropic.com')
}

// 计算文本 token 数（估算）
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = text
    .replace(/[\u4e00-\u9fa5]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0).length
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3)
}

// 估算消息的 token 数
export function estimateMessageTokens(message: Message): number {
  let count = 0
  for (const block of message.content) {
    if (block.type === 'text' && block.text) {
      count += estimateTokens(block.text)
    } else if (block.type === 'image' && block.image) {
      count += 85 // 图片估算为 85 tokens
    }
  }
  return count
}

// 应用滑动窗口：只保留最近 N 条 + 所有锚点消息
export function applySlidingWindow(
  messages: Message[],
  windowSize: number
): Message[] {
  if (messages.length <= windowSize) {
    return messages
  }

  // 获取所有锚点消息的索引
  const pinnedIndices = new Set(
    messages
      .map((m, idx) => (m.pinned ? idx : -1))
      .filter((idx) => idx >= 0)
  )

  // 获取最近的 N 条消息
  const recentStart = messages.length - windowSize
  const result: Message[] = []

  for (let i = 0; i < messages.length; i++) {
    // 包含：锚点消息 或 最近的 N 条消息
    if (pinnedIndices.has(i) || i >= recentStart) {
      result.push(messages[i])
    }
  }

  return result
}

// 计算预估费用
export function estimateCost(
  messages: Message[],
  systemPrompt: string,
  modelName: string,
  pricing: typeof MODEL_PRICING,
  avgOutputTokens?: number
): CostEstimate {
  let inputTokens = 0

  // 计算系统提示词
  inputTokens += estimateTokens(systemPrompt)

  // 计算消息
  for (const msg of messages) {
    inputTokens += estimateMessageTokens(msg)
  }

  // 查找价格
  const modelPricing = Object.entries(pricing).find(([name]) =>
    modelName.toLowerCase().includes(name.toLowerCase())
  )

  if (modelPricing) {
    const [, prices] = modelPricing
    // 若提供历史均值则使用，否则 fallback 到输入的 1/4
    const estimatedOutputTokens = avgOutputTokens !== undefined
      ? avgOutputTokens
      : Math.min(inputTokens / 4, 4096)
    const cost = (inputTokens * prices.input + estimatedOutputTokens * prices.output) / 1000

    return {
      inputTokens,
      estimatedCost: cost < 0.01 ? `< $0.01` : `≈ $${cost.toFixed(2)}`,
      hasPricing: true,
    }
  }

  return {
    inputTokens,
    estimatedCost: '',
    hasPricing: false,
  }
}

function formatMessages(
  messages: Message[],
  systemPrompt?: string,
  isAnthropic?: boolean,
  archiveContent?: string
): ChatMessage[] {
  const formatted: ChatMessage[] = []

  // 添加 system prompt
  if (isAnthropic) {
    // Anthropic：base prompt 和 archive 各独立一条 system message
    if (systemPrompt) {
      // base system prompt — 不加 cache_control
      formatted.push({
        role: 'system',
        content: systemPrompt,
      })
    }
    if (archiveContent) {
      // archive 内容 — 加 cache_control，独立缓存
      const archiveSection = `以下是与本次讨论相关的设定档案：\n\n${archiveContent}`
      formatted.push({
        role: 'system',
        content: archiveSection,
        cache_control: { type: 'ephemeral' },
      })
    }
  } else {
    // 非 Anthropic：拼接成一个字符串
    const parts: string[] = []
    if (systemPrompt) parts.push(systemPrompt)
    if (archiveContent) parts.push(`\n\n---\n\n以下是与本次讨论相关的设定档案：\n\n${archiveContent}`)
    if (parts.length > 0) {
      formatted.push({
        role: 'system',
        content: parts.join(''),
      })
    }
  }

  // 添加对话消息
  for (const msg of messages) {
    const content: ContentPart[] = []

    for (const block of msg.content) {
      if (block.type === 'text' && block.text) {
        content.push({
          type: 'text',
          text: block.text,
        })
      } else if (block.type === 'image' && block.image) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${block.image.mimeType};base64,${block.image.data}`,
          },
        })
      }
    }

    // 跳过空内容消息（如纯图片消息在不支持视觉的模型下）
    if (content.length === 0) continue

    formatted.push({
      role: msg.role,
      content: content.length === 1 && content[0].type === 'text'
        ? content[0].text!
        : content,
    })
  }

  return formatted
}

export async function sendChatMessage(
  settings: Settings,
  messages: Message[],
  systemPrompt: string | undefined,
  callbacks: StreamCallbacks,
  archiveContent?: string
): Promise<void> {
  if (DEV_LOG) {
    console.log('[API] sendChatMessage called with:', {
      endpoint: settings.apiEndpoint,
      modelName: settings.modelName,
      hasApiKey: !!settings.apiKey,
      messageCount: messages.length,
      hasSystemPrompt: !!systemPrompt,
      hasArchive: !!archiveContent,
    })
  }

  const isAnthropic = isAnthropicApi(settings.apiEndpoint)
  const formattedMessages = formatMessages(messages, systemPrompt, isAnthropic, archiveContent)
  const cleanEndpoint = settings.apiEndpoint.replace(/\/+$/, '')

  const preferredMode = endpointModeCache.get(cleanEndpoint) || 'stream'
  const attemptModes: EndpointDeliveryMode[] = preferredMode === 'stream'
    ? ['stream', 'non-stream']
    : ['non-stream', 'stream']

  let lastError: Error | null = null

  for (const mode of attemptModes) {
    try {
      if (mode === 'stream') {
        const streamResult = await new Promise<{ content: string; usage: StreamUsage }>((resolve, reject) => {
          // 只有 OpenAI 原生 API 支持 stream_options
          const isOpenaiNative = settings.apiEndpoint.includes('api.openai.com')
          const requestBody: ChatRequestBody = {
            model: settings.modelName,
            messages: formattedMessages,
            max_tokens: settings.maxTokens,
            stream: true,
          }
          if (isOpenaiNative) {
            requestBody.stream_options = { include_usage: true }
          }

          const url = `${cleanEndpoint}/chat/completions`
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`,
          }

          if (DEV_LOG) {
            console.log('[API] Request details:', {
              url,
              model: settings.modelName,
              stream: true,
              messagesCount: formattedMessages.length,
            })
          }

          let fullContent = ''
          const usage: StreamUsage = {}
          let errorBody = ''
          let hasError = false
          let hasToken = false
          let settled = false
          const startedAt = performance.now()
          let firstTokenAt: number | null = null

          const safeReject = (message: string, canFallback = true) => {
            if (settled) return
            settled = true
            reject(createAttemptError(message, canFallback))
          }

          const safeResolve = () => {
            if (settled) return
            if (hasError || errorBody) {
              safeReject(errorBody || 'API请求失败', !hasToken)
              return
            }
            if (!fullContent.trim()) {
              safeReject('EMPTY_STREAM_RESPONSE', true)
              return
            }
            if (DEV_LOG) {
              console.log('[API] Stream total(ms):', Math.round(performance.now() - startedAt), cleanEndpoint)
            }
            settled = true
            resolve({ content: fullContent, usage })
          }

          window.api.http.fetchStream(
            {
              url,
              method: 'POST',
              headers,
              body: JSON.stringify(requestBody),
            },
            {
              onStatus: (status) => {
                if (DEV_LOG) {
                  console.log('[API] Response status:', status.status, status.statusText)
                }
                if (status.status !== 200) {
                  hasError = true
                  console.error('[API] Non-200 status code:', status)
                }
              },
              onData: (line) => {
                if (settled) return
                const trimmed = line.trim()
                if (!trimmed) return

                // 兼容 data:[DONE] / data: [DONE] / [DONE]
                if (/^data:\s*\[DONE\]\s*$/i.test(trimmed) || trimmed === '[DONE]') {
                  safeResolve()
                  return
                }

                // 处理两种格式：标准 SSE (data: {...}) 和纯 JSON 行
                let jsonStr = trimmed
                let isDataLine = false
                if (trimmed.startsWith('data:')) {
                  isDataLine = true
                  jsonStr = trimmed.replace(/^data:\s*/, '')
                  if (jsonStr === '[DONE]') {
                    safeResolve()
                    return
                  }
                }

                try {
                  const parsed = JSON.parse(jsonStr) as {
                    error?: { message?: string }
                    usage?: {
                      prompt_tokens?: number
                      completion_tokens?: number
                      cache_read_input_tokens?: number
                    }
                    message?: {
                      usage?: {
                        prompt_tokens?: number
                        completion_tokens?: number
                      }
                    }
                  }

                  // 检查是否是错误响应
                  if (parsed.error) {
                    hasError = true
                    errorBody = parsed.error.message || JSON.stringify(parsed.error)
                    return
                  }

                  // 处理内容 - 支持多种平台/中转格式
                  const content = extractContentFromChunk(parsed)
                  if (content) {
                    if (firstTokenAt === null) {
                      firstTokenAt = performance.now()
                      if (DEV_LOG) {
                        console.log('[API] Stream TTFT(ms):', Math.round(firstTokenAt - startedAt), cleanEndpoint)
                      }
                    }
                    hasToken = true
                    fullContent += content
                    callbacks.onToken(content)
                  }

                  // 处理 token 用量（在最后一个 chunk 中）
                  if (parsed.usage) {
                    usage.promptTokens = parsed.usage.prompt_tokens
                    usage.completionTokens = parsed.usage.completion_tokens
                    if (parsed.usage.cache_read_input_tokens) {
                      usage.cacheReadTokens = parsed.usage.cache_read_input_tokens
                    }
                  }

                  // OpenAI 格式的 usage（可能在 message 字段中）
                  if (parsed.message?.usage) {
                    usage.promptTokens = parsed.message.usage.prompt_tokens
                    usage.completionTokens = parsed.message.usage.completion_tokens
                  }
                } catch {
                  if (isDataLine && jsonStr && !jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
                    // 某些服务端会把纯文本 token 放在 data: 后面
                    if (firstTokenAt === null) {
                      firstTokenAt = performance.now()
                      if (DEV_LOG) {
                        console.log('[API] Stream TTFT(ms):', Math.round(firstTokenAt - startedAt), cleanEndpoint)
                      }
                    }
                    hasToken = true
                    fullContent += jsonStr
                    callbacks.onToken(jsonStr)
                    return
                  }
                  // 不是 JSON 且有错误状态，收集为错误信息
                  if (hasError) {
                    errorBody += trimmed
                  }
                }
              },
              onEnd: () => {
                safeResolve()
              },
              onError: (error) => {
                safeReject(error, !hasToken)
              },
            }
          ).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            safeReject(message, true)
          })
        })

        endpointModeCache.set(cleanEndpoint, 'stream')
        callbacks.onComplete(streamResult.content, streamResult.usage)
        return
      }

      const content = await sendNonStreamMessage(settings, messages, systemPrompt, archiveContent)
      if (DEV_LOG) {
        console.log('[API] Non-stream completed:', cleanEndpoint)
      }
      if (!content.trim()) {
        throw createAttemptError('未收到响应内容，请检查模型名称是否正确', false)
      }
      endpointModeCache.set(cleanEndpoint, 'non-stream')
      callbacks.onToken(content)
      callbacks.onComplete(content)
      return
    } catch (error) {
      const attemptError = error instanceof Error ? error : new Error(String(error))
      const canFallback = (attemptError as Error & { canFallback?: boolean }).canFallback ?? true
      lastError = attemptError

      if (DEV_LOG) {
        const reason = attemptError.message === 'EMPTY_STREAM_RESPONSE'
          ? 'empty-stream'
          : attemptError.message
        console.warn(`[API] ${mode} attempt failed for ${cleanEndpoint}:`, reason)
      }

      if (!canFallback) break
    }
  }

  console.error('[API] Caught exception in sendChatMessage:', lastError)
  callbacks.onError(lastError || new Error('未收到模型响应，请重试'))
}

export async function sendNonStreamMessage(
  settings: Settings,
  messages: Message[],
  systemPrompt: string | undefined,
  archiveContent?: string
): Promise<string> {
  const isAnthropic = isAnthropicApi(settings.apiEndpoint)
  const formattedMessages = formatMessages(messages, systemPrompt, isAnthropic, archiveContent)

  const cleanEndpoint = settings.apiEndpoint.replace(/\/+$/, '')
  const url = `${cleanEndpoint}/chat/completions`

  const response = await window.api.http.fetch({
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.modelName,
      messages: formattedMessages,
      max_tokens: settings.maxTokens,
      stream: false,
    }),
  })

  if (response.status !== 200) {
    throw new Error(`API Error: ${response.status} - ${response.body}`)
  }

  const data = JSON.parse(response.body)
  return extractContentFromResponseBody(data)
}

// 检查模型是否支持视觉
export function isVisionModel(modelName: string): boolean {
  const visionKeywords = ['vision', 'gpt-4o', 'gpt-4-turbo', 'claude-3', 'gemini', 'glm-4v']
  const lowerName = modelName.toLowerCase()
  return visionKeywords.some((keyword) => lowerName.includes(keyword))
}

// 获取可用模型列表
export async function fetchModels(
  endpoint: string,
  apiKey: string
): Promise<{ success: true; models: import('@/types').ModelInfo[] } | { success: false; error: string }> {
  // 清理 endpoint 末尾的斜杠
  const cleanEndpoint = endpoint.replace(/\/+$/, '')
  const url = `${cleanEndpoint}/models`

  try {
    const response = await window.api.http.fetch({
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (response.status !== 200) {
      return { success: false, error: `API Error: ${response.status}` }
    }

    const data = JSON.parse(response.body)

    // OpenAI 格式：{ data: [{ id, object, created, owned_by, ... }] }
    // 部分平台可能有不同的格式
    const rawModels: unknown[] = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.models)
        ? data.models
        : []

    const models: import('@/types').ModelInfo[] = rawModels.map((m) => {
      if (typeof m === 'string') {
        return { id: m, name: m }
      }
      const model = (m ?? {}) as RawModelInfo
      return {
        id: model.id || model.name || '',
        name: model.name || model.id || '',
        contextLength: model.context_length || model.max_tokens || undefined,
        ownedBy: model.owned_by || model.provider || undefined,
      }
    }).filter((m) => m.id)

    // 按名称排序
    models.sort((a, b) => (a.id || '').localeCompare(b.id || ''))

    return { success: true, models }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
