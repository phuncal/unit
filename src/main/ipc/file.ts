import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'

export function registerFileHandlers() {
  // 选择目录
  ipcMain.handle('file:selectDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // 读取文件
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 写入文件
  ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 追加写入文件
  ipcMain.handle('file:append', async (_event, filePath: string, content: string) => {
    try {
      await fs.promises.appendFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 检查文件是否存在
  ipcMain.handle('file:exists', async (_event, filePath: string) => {
    try {
      await fs.promises.access(filePath)
      return true
    } catch {
      return false
    }
  })

  // 创建目录
  ipcMain.handle('file:mkdir', async (_event, dirPath: string) => {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取目录下的文件列表
  ipcMain.handle('file:listDirectory', async (_event, dirPath: string) => {
    try {
      const files = await fs.promises.readdir(dirPath, { withFileTypes: true })
      return {
        success: true,
        files: files.map((f) => ({
          name: f.name,
          isDirectory: f.isDirectory(),
          isFile: f.isFile(),
        })),
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
