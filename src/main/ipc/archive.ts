import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export function registerArchiveHandlers() {
  // 读取 archive.md
  ipcMain.handle('archive:read', async (_event, projectPath: string) => {
    const archivePath = path.join(projectPath, 'archive.md')
    try {
      const content = await fs.promises.readFile(archivePath, 'utf-8')
      return { success: true, content, exists: true }
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        return { success: true, content: '', exists: false }
      }
      return { success: false, error: err.message }
    }
  })

  // 追加写入 archive.md
  ipcMain.handle('archive:append', async (_event, projectPath: string, content: string) => {
    const archivePath = path.join(projectPath, 'archive.md')
    try {
      await fs.promises.appendFile(archivePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 创建 archive.md
  ipcMain.handle('archive:create', async (_event, projectPath: string, initialContent: string = '') => {
    const archivePath = path.join(projectPath, 'archive.md')
    try {
      await fs.promises.writeFile(archivePath, initialContent, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 检查 archive.md 是否存在
  ipcMain.handle('archive:exists', async (_event, projectPath: string) => {
    const archivePath = path.join(projectPath, 'archive.md')
    try {
      await fs.promises.access(archivePath)
      return true
    } catch {
      return false
    }
  })
}
