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
  pricing: typeof MODEL_PRICING
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
    // 预估输出 token 为输入的 1/4
    const estimatedOutputTokens = Math.min(inputTokens / 4, 4096)
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
  isAnthropic?: boolean
): ChatMessage[] {
  const formatted: ChatMessage[] = []

  // 添加 system prompt
  if (systemPrompt) {
    const systemMessage: ChatMessage = {
      role: 'system',
      content: systemPrompt,
    }
    // Anthropic API 支持 cache_control
    if (isAnthropic) {
      systemMessage.cache_control = { type: 'ephemeral' }
    }
    formatted.push(systemMessage)
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
  callbacks: StreamCallbacks
): Promise<void> {
  console.log('[API] sendChatMessage called with:', {
    endpoint: settings.apiEndpoint,
    modelName: settings.modelName,
    hasApiKey: !!settings.apiKey,
    apiKeyPrefix: settings.apiKey ? settings.apiKey.substring(0, 8) + '...' : 'none',
    messageCount: messages.length,
    hasSystemPrompt: !!systemPrompt,
  })

  const isAnthropic = isAnthropicApi(settings.apiEndpoint)
  const formattedMessages = formatMessages(messages, systemPrompt, isAnthropic)

  try {
    // 只有 OpenAI 原生 API 支持 stream_options
    const isOpenaiNative = settings.apiEndpoint.includes('api.openai.com')

    // 检测是否是 Gemini 模型 + gptsapi.net - 该服务对 Gemini 流式响应有兼容性问题
    const isGeminiModel = settings.modelName.toLowerCase().includes('gemini')
    const isGptsApiNet = settings.apiEndpoint.includes('gptsapi.net')
    const disableStreaming = isGeminiModel && isGptsApiNet
    const useStreaming = !disableStreaming

    // 清理 endpoint 末尾的斜杠
    const cleanEndpoint = settings.apiEndpoint.replace(/\/+$/, '')

    const requestBody: Record<string, any> = {
      model: settings.modelName,
      messages: formattedMessages,
      max_tokens: settings.maxTokens,
      stream: useStreaming,
    }

    // 只对 OpenAI 原生 API 添加 stream_options
    if (isOpenaiNative && useStreaming) {
      requestBody.stream_options = { include_usage: true }
    }

    const url = `${cleanEndpoint}/chat/completions`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    }

    console.log('[API] Request details:', {
      url,
      model: settings.modelName,
      stream: useStreaming,
      messagesCount: formattedMessages.length,
    })

    // 非流式模式处理
    if (!useStreaming) {
      const response = await window.api.http.fetch({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      })

      if (response.status !== 200) {
        throw new Error(`API Error: ${response.status} - ${response.body}`)
      }

      const data = JSON.parse(response.body)
      const content = data.choices?.[0]?.message?.content || ''
      const usage: StreamUsage = {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      }

      callbacks.onToken(content)
      callbacks.onComplete(content, usage)
      return
    }

    // 流式模式处理 - 使用主进程 API
    let fullContent = ''
    let usage: StreamUsage = {}
    let errorBody = ''
    let hasError = false

    await window.api.http.fetchStream(
      {
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      },
      {
        onStatus: (status) => {
          console.log('[API] Response status:', status.status, status.statusText)
          if (status.status !== 200) {
            hasError = true
            console.error('[API] Non-200 status code:', status)
          }
        },
        onData: (line) => {
          const trimmed = line.trim()
          if (!trimmed) return

          // 处理两种格式：标准 SSE (data: {...}) 和纯 JSON 行
          let jsonStr = trimmed
          if (trimmed.startsWith('data: ')) {
            jsonStr = trimmed.slice(6)
            if (jsonStr === '[DONE]') return
          }

          try {
            const parsed = JSON.parse(jsonStr)

            // 检查是否是错误响应
            if (parsed.error) {
              hasError = true
              errorBody = parsed.error.message || JSON.stringify(parsed.error)
              return
            }

            // 处理内容 - 支持多种格式
            let content = parsed.choices?.[0]?.delta?.content

            // 某些中转服务可能使用不同的字段结构
            if (!content) {
              content = parsed.choices?.[0]?.message?.content
                || parsed.delta?.text
                || parsed.text
                || parsed.candidates?.[0]?.content?.parts?.[0]?.text
            }

            if (content) {
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
          } catch (e) {
            // 不是 JSON 且有错误状态，收集为错误信息
            if (hasError) {
              errorBody += trimmed
            }
          }
        },
        onEnd: () => {
          if (hasError || errorBody) {
            console.error('[API] Stream ended with error:', errorBody)
            callbacks.onError(new Error(errorBody || 'API请求失败'))
          } else if (!fullContent) {
            console.warn('[API] Stream completed but no content received')
            callbacks.onError(new Error('未收到响应内容，请检查模型名称是否正确'))
          } else {
            console.log('[API] Stream completed successfully. Content length:', fullContent.length)
            callbacks.onComplete(fullContent, usage)
          }
        },
        onError: (error) => {
          console.error('[API] Stream error:', error)
          callbacks.onError(new Error(error))
        },
      }
    )
  } catch (error) {
    console.error('[API] Caught exception in sendChatMessage:', error)
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function sendNonStreamMessage(
  settings: Settings,
  messages: Message[],
  systemPrompt: string | undefined
): Promise<string> {
  const isAnthropic = isAnthropicApi(settings.apiEndpoint)
  const formattedMessages = formatMessages(messages, systemPrompt, isAnthropic)

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
  return data.choices?.[0]?.message?.content || ''
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
    const rawModels = data.data || data.models || []

    const models: import('@/types').ModelInfo[] = rawModels.map((m: any) => ({
      id: m.id || m.name || m,
      name: m.name || m.id || m,
      contextLength: m.context_length || m.max_tokens || undefined,
      ownedBy: m.owned_by || m.provider || undefined,
    }))

    // 按名称排序
    models.sort((a, b) => (a.id || '').localeCompare(b.id || ''))

    return { success: true, models }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
