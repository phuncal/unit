import { ipcMain } from 'electron'
import https from 'node:https'
import http from 'node:http'

const DEV_LOG = process.env.NODE_ENV !== 'production'
const REQUEST_TIMEOUT_MS = 300000  // 5 分钟，适应 DeepSeek R1 等长回复模型
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
  keepAliveMsecs: 15000,
})
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 32,
  keepAliveMsecs: 15000,
})

// 在主进程中发起 API 请求（绕过 CORS）
export function registerApiHandlers() {
  // 非流式请求
  ipcMain.handle('api:fetch', async (_event, options: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }) => {
    const { url, method, headers, body } = options
    const client = url.startsWith('https') ? https : http
    const requestId = Date.now().toString()

    if (DEV_LOG) {
      console.log('[Main] API Request:', {
        requestId,
        url,
        method,
        hasAuthorization: !!headers.Authorization,
      })
    }

    // 添加必要的请求头
    const finalHeaders = {
      'User-Agent': 'Unit/1.0',
      ...headers,
    }

    return new Promise((resolve, reject) => {
      const req = client.request(url, {
        method,
        agent: url.startsWith('https') ? httpsAgent : httpAgent,
        headers: finalHeaders,
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          if (DEV_LOG) {
            console.log('[Main] API Response:', {
              requestId,
              status: res.statusCode,
              statusText: res.statusMessage,
              bodyLength: data.length,
            })
          }
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: data,
          })
        })
      })

      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        const timeoutError = new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`)
        if (DEV_LOG) {
          console.error('[Main] API Request Timeout:', requestId, url)
        }
        req.destroy(timeoutError)
      })

      req.on('error', (error) => {
        if (DEV_LOG) {
          console.error('[Main] API Request Error:', requestId, error.message)
        }
        reject(error)
      })

      if (body) {
        req.write(body)
      }
      req.end()
    })
  })

  // 流式请求 - 返回一个端口用于通信
  ipcMain.handle('api:fetchStream', async (event, options: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }) => {
    const { url, method, headers, body } = options
    const client = url.startsWith('https') ? https : http
    const requestId = Date.now().toString()

    if (DEV_LOG) {
      console.log('[Main] API Stream Request:', {
        requestId,
        url,
        method,
        hasAuthorization: !!headers.Authorization,
      })
    }

    // 添加必要的请求头
    const finalHeaders = {
      'User-Agent': 'Unit/1.0',
      'Accept': 'text/event-stream',
      ...headers,
    }

    return new Promise((resolve) => {
      const req = client.request(url, {
        method,
        agent: url.startsWith('https') ? httpsAgent : httpAgent,
        headers: finalHeaders,
      }, (res) => {
        // 收集错误响应体
        let errorBody = ''
        const isOk = res.statusCode && res.statusCode >= 200 && res.statusCode < 300
        let streamEnded = false

        const endStreamOnce = () => {
          if (streamEnded) return
          streamEnded = true
          event.sender.send(`api:stream:${requestId}:end`)
        }

        if (DEV_LOG) {
          console.log('[Main] API Stream Response:', {
            requestId,
            status: res.statusCode,
            statusText: res.statusMessage,
            isOk,
          })
        }

        // 发送状态
        event.sender.send(`api:stream:${requestId}:status`, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
        })

        let buffer = ''
        res.on('data', (chunk) => {
          if (streamEnded) return
          const text = chunk.toString()
          if (!isOk) {
            errorBody += text
          }
          buffer += text
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed) {
              event.sender.send(`api:stream:${requestId}:data`, line)
              // 某些 SSE 服务在 [DONE] 后保持连接，主动结束避免前端悬挂
              if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]' || trimmed === '[DONE]') {
                endStreamOnce()
                req.destroy()
                return
              }
            }
          }
        })

        res.on('end', () => {
          if (streamEnded) return
          if (!isOk && errorBody) {
            event.sender.send(`api:stream:${requestId}:data`, errorBody)
          } else if (buffer.trim()) {
            event.sender.send(`api:stream:${requestId}:data`, buffer)
          }
          endStreamOnce()
        })
      })

      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        const timeoutError = new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`)
        if (DEV_LOG) {
          console.error('[Main] API Stream Timeout:', requestId, url)
        }
        req.destroy(timeoutError)
      })

      req.on('error', (error) => {
        console.error('[Main] API Stream Request Error:', requestId, error)
        event.sender.send(`api:stream:${requestId}:error`, error.message)
      })

      if (body) {
        req.write(body)
      }
      req.end()

      // 返回 requestId 供渲染进程监听
      resolve({ requestId })
    })
  })
}
