const { contextBridge, ipcRenderer } = require('electron')

console.log('Preload script running...')

const api = {
  settings: {
    encrypt: (value) => ipcRenderer.invoke('settings:encrypt', value),
    decrypt: (value) => ipcRenderer.invoke('settings:decrypt', value),
  },
  file: {
    selectDirectory: () => {
      console.log('selectDirectory called')
      return ipcRenderer.invoke('file:selectDirectory')
    },
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
    append: (filePath, content) => ipcRenderer.invoke('file:append', filePath, content),
    exists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('file:mkdir', dirPath),
    listDirectory: (dirPath) => ipcRenderer.invoke('file:listDirectory', dirPath),
  },
  archive: {
    read: (projectPath) => ipcRenderer.invoke('archive:read', projectPath),
    append: (projectPath, content) => ipcRenderer.invoke('archive:append', projectPath, content),
    create: (projectPath, initialContent) => ipcRenderer.invoke('archive:create', projectPath, initialContent),
    exists: (projectPath) => ipcRenderer.invoke('archive:exists', projectPath),
  },
  // 更新相关
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getCurrentVersion: () => ipcRenderer.invoke('updater:current-version'),
    onChecking: (callback) => {
      ipcRenderer.on('updater:checking', callback)
      return () => ipcRenderer.removeListener('updater:checking', callback)
    },
    onAvailable: (callback) => {
      ipcRenderer.on('updater:available', (_event, info) => callback(info))
      return () => ipcRenderer.removeListener('updater:available', callback)
    },
    onNotAvailable: (callback) => {
      ipcRenderer.on('updater:not-available', callback)
      return () => ipcRenderer.removeListener('updater:not-available', callback)
    },
    onProgress: (callback) => {
      ipcRenderer.on('updater:progress', (_event, progress) => callback(progress))
      return () => ipcRenderer.removeListener('updater:progress', callback)
    },
    onDownloaded: (callback) => {
      ipcRenderer.on('updater:downloaded', callback)
      return () => ipcRenderer.removeListener('updater:downloaded', callback)
    },
    onError: (callback) => {
      ipcRenderer.on('updater:error', (_event, error) => callback(error))
      return () => ipcRenderer.removeListener('updater:error', callback)
    },
  },
  // API 请求（绕过 CORS）
  http: {
    // 非流式请求
    fetch: (options) => ipcRenderer.invoke('api:fetch', options),

    // 流式请求
    fetchStream: (options, callbacks) => {
      return new Promise((resolve, reject) => {
        ipcRenderer.invoke('api:fetchStream', options).then((result) => {
          const { requestId } = result

          // 监听事件
          const statusHandler = (_, status) => callbacks.onStatus(status)
          const dataHandler = (_, line) => callbacks.onData(line)
          const endHandler = () => {
            callbacks.onEnd()
            // 清理监听器
            ipcRenderer.removeListener(`api:stream:${requestId}:status`, statusHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:data`, dataHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:end`, endHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:error`, errorHandler)
          }
          const errorHandler = (_, error) => {
            callbacks.onError(error)
            // 清理监听器
            ipcRenderer.removeListener(`api:stream:${requestId}:status`, statusHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:data`, dataHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:end`, endHandler)
            ipcRenderer.removeListener(`api:stream:${requestId}:error`, errorHandler)
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
console.log('API exposed to main world')
