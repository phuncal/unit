export interface FileResult {
  success: boolean
  content?: string
  error?: string
}

export interface FileListResult {
  success: boolean
  files?: Array<{
    name: string
    isDirectory: boolean
    isFile: boolean
  }>
  error?: string
}

export interface ArchiveResult {
  success: boolean
  content?: string
  exists?: boolean
  error?: string
}

export interface FetchOptions {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface FetchResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export interface StreamCallbacks {
  onStatus: (status: { status: number; statusText: string; headers: Record<string, string> }) => void
  onData: (line: string) => void
  onEnd: () => void
  onError: (error: string) => void
}

export interface UpdaterResult {
  success: boolean
  updateAvailable?: boolean
  version?: string
  error?: string
}

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface ElectronAPI {
  settings: {
    encrypt: (value: string) => Promise<string>
    decrypt: (value: string) => Promise<string>
  }
  file: {
    selectDirectory: () => Promise<string | null>
    read: (filePath: string) => Promise<FileResult>
    write: (filePath: string, content: string) => Promise<FileResult>
    append: (filePath: string, content: string) => Promise<FileResult>
    exists: (filePath: string) => Promise<boolean>
    mkdir: (dirPath: string) => Promise<FileResult>
    listDirectory: (dirPath: string) => Promise<FileListResult>
  }
  archive: {
    read: (projectPath: string) => Promise<ArchiveResult>
    append: (projectPath: string, content: string) => Promise<ArchiveResult>
    create: (projectPath: string, initialContent?: string) => Promise<ArchiveResult>
    exists: (projectPath: string) => Promise<boolean>
  }
  updater: {
    check: () => Promise<UpdaterResult>
    download: () => Promise<{ success: boolean; error?: string }>
    install: () => Promise<void>
    getCurrentVersion: () => Promise<string>
    onChecking: (callback: () => void) => () => void
    onAvailable: (callback: (info: UpdateInfo) => void) => () => void
    onNotAvailable: (callback: () => void) => () => void
    onProgress: (callback: (progress: DownloadProgress) => void) => () => void
    onDownloaded: (callback: () => void) => () => void
    onError: (callback: (error: { message: string }) => void) => () => void
  }
  http: {
    fetch: (options: FetchOptions) => Promise<FetchResponse>
    fetchStream: (options: FetchOptions, callbacks: StreamCallbacks) => Promise<string>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
