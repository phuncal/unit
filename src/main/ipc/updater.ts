import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

// 配置自动更新
autoUpdater.autoDownload = false // 不自动下载，用户手动触发
autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装

export function registerUpdaterHandlers() {
  // 检查更新
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        success: true,
        updateAvailable: result !== null,
        version: result?.updateInfo?.version,
      }
    } catch (error) {
      console.error('Check for updates failed:', error)
      return {
        success: false,
        error: (error as Error).message,
      }
    }
  })

  // 开始下载更新
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      console.error('Download update failed:', error)
      return {
        success: false,
        error: (error as Error).message,
      }
    }
  })

  // 退出并安装
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // 获取当前版本
  ipcMain.handle('updater:current-version', () => {
    return autoUpdater.currentVersion.version
  })

  // 监听更新事件，发送到渲染进程
  autoUpdater.on('checking-for-update', () => {
    sendToAllWindows('updater:checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendToAllWindows('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-not-available', () => {
    sendToAllWindows('updater:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToAllWindows('updater:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    sendToAllWindows('updater:downloaded')
  })

  autoUpdater.on('error', (error) => {
    sendToAllWindows('updater:error', {
      message: error.message,
    })
  })
}

function sendToAllWindows(channel: string, data?: any) {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
}
