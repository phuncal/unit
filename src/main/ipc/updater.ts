import { ipcMain, BrowserWindow, shell, app } from 'electron'
import https from 'node:https'

// 无签名应用的更新方案：
// 不使用 electron-updater / Squirrel.Mac（会因 ad-hoc 签名每次不同而验证失败）
// 改为手动检查 GitHub Releases API，发现新版本时引导用户打开下载页面
// 用户通过 DMG 手动安装新版本，彻底绕过 ShipIt 的签名验证

const GITHUB_OWNER = 'phuncal'
const GITHUB_REPO = 'unit'

interface ReleaseInfo {
  version: string
  releaseDate: string
  releaseNotes: string
  downloadUrl: string
}

function fetchLatestRelease(): Promise<ReleaseInfo> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'Unit-App-Updater',
        'Accept': 'application/vnd.github.v3+json',
      },
    }

    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const release = JSON.parse(data)
          if (release.message) {
            reject(new Error(release.message))
            return
          }
          const version = release.tag_name?.replace(/^v/, '') ?? ''
          const dmgAsset = release.assets?.find((a: any) =>
            a.name?.endsWith('.dmg') && a.name?.includes('universal')
          )
          resolve({
            version,
            releaseDate: release.published_at ?? '',
            releaseNotes: typeof release.body === 'string' ? release.body.slice(0, 500) : '',
            downloadUrl: dmgAsset?.browser_download_url ?? release.html_url,
          })
        } catch (e) {
          reject(e)
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// 供主进程启动时直接调用
export async function checkForUpdates(): Promise<void> {
  try {
    const latest = await fetchLatestRelease()
    const current = app.getVersion()
    const updateAvailable = compareVersions(latest.version, current) > 0

    if (updateAvailable) {
      sendToAllWindows('updater:available', {
        version: latest.version,
        releaseDate: latest.releaseDate,
        releaseNotes: latest.releaseNotes,
        downloadUrl: latest.downloadUrl,
      })
    }
  } catch (error) {
    console.error('[Updater] Auto check failed:', error)
  }
}

export function registerUpdaterHandlers() {
  // 检查更新（渲染进程手动触发）
  ipcMain.handle('updater:check', async () => {
    try {
      const latest = await fetchLatestRelease()
      const current = app.getVersion()
      const updateAvailable = compareVersions(latest.version, current) > 0

      if (updateAvailable) {
        sendToAllWindows('updater:available', {
          version: latest.version,
          releaseDate: latest.releaseDate,
          releaseNotes: latest.releaseNotes,
          downloadUrl: latest.downloadUrl,
        })
      } else {
        sendToAllWindows('updater:not-available')
      }

      return {
        success: true,
        updateAvailable,
        version: latest.version,
      }
    } catch (error) {
      console.error('[Updater] Check failed:', error)
      return {
        success: false,
        error: (error as Error).message,
      }
    }
  })

  // 打开下载页面（由渲染进程传入 downloadUrl）
  ipcMain.handle('updater:download', async (_event, downloadUrl?: string) => {
    try {
      const latest = downloadUrl ? { downloadUrl } : await fetchLatestRelease()
      await shell.openExternal(latest.downloadUrl)
      return { success: true }
    } catch (error) {
      console.error('[Updater] Open download URL failed:', error)
      return {
        success: false,
        error: (error as Error).message,
      }
    }
  })

  // 保留接口兼容性，无实际操作（用户通过 DMG 手动安装）
  ipcMain.handle('updater:install', () => {
    app.quit()
  })

  // 获取当前版本
  ipcMain.handle('updater:current-version', () => {
    return app.getVersion()
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
