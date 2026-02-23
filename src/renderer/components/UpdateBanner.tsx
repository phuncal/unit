import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
  downloadUrl?: string
}

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.updater.onAvailable((info: UpdateInfo) => {
      setUpdateInfo(info)
      setDismissed(false)
    })

    // 静默忽略更新相关错误（404 = 尚无 Release，正常情况）
    const unsubscribeError = window.api.updater.onError((error) => {
      console.log('[UpdateBanner] Update check error (silently ignored):', error)
    })

    return () => {
      unsubscribe()
      unsubscribeError()
    }
  }, [])

  const handleDownload = async () => {
    // 在浏览器中打开 DMG 下载链接，用户手动安装
    await window.api.updater.download(updateInfo?.downloadUrl)
  }

  if (!updateInfo || dismissed) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-accent text-white shadow-lg">
      <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 flex-1">
          <Download className="w-5 h-5 flex-shrink-0" />
          <div className="flex items-center gap-3 flex-1">
            <span className="text-sm font-medium">
              发现新版本 v{updateInfo.version}
            </span>
            <button
              onClick={handleDownload}
              className="px-3 py-1 bg-white text-accent rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
            >
              下载 DMG 安装
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-white/10 rounded transition-colors ml-4"
          title="暂时关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
