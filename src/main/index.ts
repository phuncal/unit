import { app, BrowserWindow, ipcMain, safeStorage, nativeImage, Menu, clipboard } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { registerFileHandlers } from './ipc/file'
import { registerArchiveHandlers } from './ipc/archive'
import { registerApiHandlers } from './ipc/api'
import { registerUpdaterHandlers, checkForUpdates } from './ipc/updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 正确计算项目根目录
// __dirname = dist-electron, 根目录 = ..
process.env.APP_ROOT = path.join(__dirname, '..')

const rawDevServerUrl = process.env['VITE_DEV_SERVER_URL']?.trim()
const useDevServer = process.env['UNIT_USE_DEV_SERVER'] === '1' && !!rawDevServerUrl
export const VITE_DEV_SERVER_URL = useDevServer ? rawDevServerUrl : undefined
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const DEV_LOG = Boolean(VITE_DEV_SERVER_URL)

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  const existingWindow = win && !win.isDestroyed()
    ? win
    : BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) || null

  if (existingWindow) {
    win = existingWindow
    if (win.isMinimized()) win.restore()
    win.focus()
    return
  }

  const preloadPath = path.join(__dirname, 'preload.js')
  if (DEV_LOG) {
    console.log('Preload path:', preloadPath)
    console.log('Preload exists:', fs.existsSync(preloadPath))
  }

  // 加载图标
  const iconPath = path.join(process.env.APP_ROOT || '', 'resources', 'icon.png')
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: icon,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#F5F5F0',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: true,
      spellcheck: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // 右键菜单：可编辑区域 + 有选中文字时
  win.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params
    const hasSelection = selectionText.trim().length > 0

    if (!isEditable && !hasSelection) return

    const template: Electron.MenuItemConstructorOptions[] = []

    if (isEditable) {
      template.push(
        { label: '撤销', role: 'undo', enabled: editFlags.canUndo },
        { label: '重做', role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
      )
    }

    template.push(
      { label: '剪切', role: 'cut', enabled: isEditable && editFlags.canCut },
      { label: '复制', role: 'copy', enabled: editFlags.canCopy || hasSelection },
      { label: '粘贴', role: 'paste', enabled: isEditable && editFlags.canPaste },
    )

    if (isEditable) {
      // 粘贴为纯文本：去除富文本格式
      const clipText = clipboard.readText()
      template.push({
        label: '粘贴为纯文本',
        enabled: isEditable && clipText.length > 0,
        click: () => win?.webContents.insertText(clipText),
      })
      template.push(
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
        { type: 'separator' },
        {
          label: '清空输入框',
          enabled: true,
          click: () => win?.webContents.executeJavaScript(
            `(()=>{ const el = document.activeElement; if(el && (el.tagName==='TEXTAREA'||el.tagName==='INPUT')){ el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); } })()`
          ),
        },
      )
    }

    Menu.buildFromTemplate(template).popup({ window: win! })
  })

  win.on('closed', () => {
    win = null
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  createWindow()
})

// API Key 加密存储
ipcMain.handle('settings:encrypt', async (_event, value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is not available on this system')
  }
  const encrypted = safeStorage.encryptString(value)
  return encrypted.toString('base64')
})

ipcMain.handle('settings:decrypt', async (_event, encryptedValue: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage decryption is not available on this system')
  }
  const buffer = Buffer.from(encryptedValue, 'base64')
  return safeStorage.decryptString(buffer)
})

// 注册 IPC 处理器
registerFileHandlers()
registerArchiveHandlers()
registerApiHandlers()
registerUpdaterHandlers()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  createWindow()
})

app.whenReady().then(() => {
  // 设置 Dock 图标 (macOS)
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(process.env.APP_ROOT!, 'resources', 'icon.png')
    if (DEV_LOG) {
      console.log('APP_ROOT:', process.env.APP_ROOT)
      console.log('Dock icon path:', iconPath)
      console.log('Icon exists:', fs.existsSync(iconPath))
    }
    if (fs.existsSync(iconPath)) {
      const iconImage = nativeImage.createFromPath(iconPath)
      app.dock.setIcon(iconImage)
      if (DEV_LOG) {
        console.log('Dock icon set')
      }
    }
  }

  createWindow()

  // 启动后 5 秒自动检查更新（生产环境）
  if (!VITE_DEV_SERVER_URL) {
    setTimeout(() => {
      checkForUpdates().catch((err: Error) => {
        console.error('[Auto Update] Check failed:', err.message)
      })
    }, 5000)
  }
})
