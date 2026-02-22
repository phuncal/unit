import { app, BrowserWindow, ipcMain, safeStorage, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { registerFileHandlers } from './ipc/file'
import { registerArchiveHandlers } from './ipc/archive'
import { registerApiHandlers } from './ipc/api'
import { registerUpdaterHandlers } from './ipc/updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
console.log('__dirname:', __dirname)

// 正确计算项目根目录
// __dirname = dist-electron, 根目录 = ..
process.env.APP_ROOT = path.join(__dirname, '..')
console.log('APP_ROOT calculated:', process.env.APP_ROOT)

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js')
  console.log('Preload path:', preloadPath)
  console.log('Preload exists:', fs.existsSync(preloadPath))

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
}

// API Key 加密存储
ipcMain.handle('settings:encrypt', async (_event, value: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value)
    return encrypted.toString('base64')
  }
  return value
})

ipcMain.handle('settings:decrypt', async (_event, encryptedValue: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encryptedValue, 'base64')
    return safeStorage.decryptString(buffer)
  }
  return encryptedValue
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
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // 设置 Dock 图标 (macOS)
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(process.env.APP_ROOT!, 'resources', 'icon.png')
    console.log('APP_ROOT:', process.env.APP_ROOT)
    console.log('Dock icon path:', iconPath)
    console.log('Icon exists:', fs.existsSync(iconPath))
    if (fs.existsSync(iconPath)) {
      const iconImage = nativeImage.createFromPath(iconPath)
      app.dock.setIcon(iconImage)
      console.log('Dock icon set')
    }
  }

  createWindow()

  // 启动后 5 秒自动检查更新（生产环境）
  if (!VITE_DEV_SERVER_URL) {
    setTimeout(() => {
      const { autoUpdater } = require('electron-updater')
      console.log('[Auto Update] Checking for updates...')
      autoUpdater.checkForUpdates().catch((err: Error) => {
        console.error('[Auto Update] Check failed:', err.message)
      })
    }, 5000)
  }
})
