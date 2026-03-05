import { ipcRenderer, contextBridge } from 'electron'

const DEV_LOG = Boolean(process.env.VITE_DEV_SERVER_URL)
if (DEV_LOG) {
  console.log('Preload script running...')
}

type UpdaterInfo = Record<string, unknown>
type UpdaterProgress = Record<string, unknown>
type UpdaterError = { message?: string } | string
type StreamStatus = { status: number; statusText: string; headers: Record<string, string> }
type FetchStreamResult = { requestId: string }

// 暴露给渲染进程的 API
const api = {
  // 设置相关
  settings: {
    encrypt: (value: string) => ipcRenderer.invoke('settings:encrypt', value),
    decrypt: (value: string) => ipcRenderer.invoke('settings:decrypt', value),
  },

  // 文件操作
  file: {
    selectDirectory: () => {
      if (DEV_LOG) {
        console.log('selectDirectory called')
      }
      return ipcRenderer.invoke('file:selectDirectory')
    },
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
    append: (filePath: string, content: string) => ipcRenderer.invoke('file:append', filePath, content),
    exists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
    mkdir: (dirPath: string) => ipcRenderer.invoke('file:mkdir', dirPath),
    listDirectory: (dirPath: string) => ipcRenderer.invoke('file:listDirectory', dirPath),
  },

  // 档案操作
  archive: {
    read: (projectPath: string) => ipcRenderer.invoke('archive:read', projectPath),
    append: (projectPath: string, content: string) => ipcRenderer.invoke('archive:append', projectPath, content),
    create: (projectPath: string, initialContent?: string) => ipcRenderer.invoke('archive:create', projectPath, initialContent),
    exists: (projectPath: string) => ipcRenderer.invoke('archive:exists', projectPath),
  },

  // 更新相关
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: (downloadUrl?: string) => ipcRenderer.invoke('updater:download', downloadUrl),
    install: () => ipcRenderer.invoke('updater:install'),
    getCurrentVersion: () => ipcRenderer.invoke('updater:current-version'),
    onChecking: (callback: () => void) => {
      ipcRenderer.on('updater:checking', callback)
      return () => ipcRenderer.removeListener('updater:checking', callback)
    },
    onAvailable: (callback: (info: UpdaterInfo) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: UpdaterInfo) => callback(info)
      ipcRenderer.on('updater:available', handler)
      return () => ipcRenderer.removeListener('updater:available', handler)
    },
    onNotAvailable: (callback: () => void) => {
      ipcRenderer.on('updater:not-available', callback)
      return () => ipcRenderer.removeListener('updater:not-available', callback)
    },
    onProgress: (callback: (progress: UpdaterProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: UpdaterProgress) => callback(progress)
      ipcRenderer.on('updater:progress', handler)
      return () => ipcRenderer.removeListener('updater:progress', handler)
    },
    onDownloaded: (callback: () => void) => {
      ipcRenderer.on('updater:downloaded', callback)
      return () => ipcRenderer.removeListener('updater:downloaded', callback)
    },
    onError: (callback: (error: UpdaterError) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: UpdaterError) => callback(error)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.removeListener('updater:error', handler)
    },
  },

  // API 请求（绕过 CORS）
  http: {
    // 非流式请求
    fetch: (options: {
      url: string
      method: string
      headers: Record<string, string>
      body?: string
    }) => ipcRenderer.invoke('api:fetch', options),

    // 流式请求
    fetchStream: (options: {
      url: string
      method: string
      headers: Record<string, string>
      body?: string
    }, callbacks: {
      onStatus: (status: StreamStatus) => void
      onData: (line: string) => void
      onEnd: () => void
      onError: (error: string) => void
    }) => {
      return new Promise((resolve, reject) => {
        ipcRenderer.invoke('api:fetchStream', options).then((result: FetchStreamResult) => {
          const { requestId } = result

          // 清理监听器的辅助函数
          const cleanupListeners = () => {
            ipcRenderer.removeListener(`api:stream:${requestId}:status`, statusHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:data`, dataHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:end`, endHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:error`, errorHandler)
          }

          // 监听事件
          const statusHandler = (_event: Electron.IpcRendererEvent, status: StreamStatus) => callbacks.onStatus(status)
          const dataHandler = (_event: Electron.IpcRendererEvent, line: string) => callbacks.onData(line)
          const endHandler = () => {
            cleanupListeners()
            callbacks.onEnd()
          }
          const errorHandler = (_event: Electron.IpcRendererEvent, error: string) => {
            cleanupListeners()
            callbacks.onError(error)
            reject(new Error(error))
          }

          ipcRenderer.on(`api:stream:${requestId}:status`, statusHandler)
          ipcRenderer.on(`api:stream:${requestId}:data`, dataHandler)
          ipcRenderer.on(`api:stream:${requestId}:end`, endHandler)
          ipcRenderer.on(`api:stream:${requestId}:error`, errorHandler)

          resolve(requestId)
        }).catch(reject)
      })
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
if (DEV_LOG) {
  console.log('API exposed to main world')
}
