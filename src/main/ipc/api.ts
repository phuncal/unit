import { ipcMain } from 'electron'
import https from 'node:https'
import http from 'node:http'

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

    // 添加必要的请求头
    const finalHeaders = {
      'User-Agent': 'Unit/1.0',
      ...headers,
    }

    return new Promise((resolve, reject) => {
      const req = client.request(url, {
        method,
        headers: finalHeaders,
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: data,
          })
        })
      })

      req.on('error', (error) => {
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

    console.log('[Main] API Stream Request:', {
      requestId,
      url,
      method,
      hasAuthorization: !!headers.Authorization,
      authPrefix: headers.Authorization ? headers.Authorization.substring(0, 15) + '...' : 'none',
    })

    // 添加必要的请求头
    const finalHeaders = {
      'User-Agent': 'Unit/1.0',
      'Accept': 'text/event-stream',
      ...headers,
    }

    return new Promise((resolve) => {
      const req = client.request(url, {
        method,
        headers: finalHeaders,
      }, (res) => {
        // 收集错误响应体
        let errorBody = ''
        const isOk = res.statusCode && res.statusCode >= 200 && res.statusCode < 300

        console.log('[Main] API Stream Response:', {
          requestId,
          status: res.statusCode,
          statusText: res.statusMessage,
          isOk,
        })

        // 发送状态
        event.sender.send(`api:stream:${requestId}:status`, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
        })

        let buffer = ''
        res.on('data', (chunk) => {
          const text = chunk.toString()
          if (!isOk) {
            errorBody += text
          }
          buffer += text
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim()) {
              event.sender.send(`api:stream:${requestId}:data`, line)
            }
          }
        })

        res.on('end', () => {
          if (!isOk && errorBody) {
            event.sender.send(`api:stream:${requestId}:data`, errorBody)
          } else if (buffer.trim()) {
            event.sender.send(`api:stream:${requestId}:data`, buffer)
          }
          event.sender.send(`api:stream:${requestId}:end`)
        })
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
