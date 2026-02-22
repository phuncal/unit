import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import type { UpdateInfo, DownloadProgress } from '@/types/electron'

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // 监听更新可用事件
    const unsubscribeAvailable = window.api.updater.onAvailable((info: UpdateInfo) => {
      setUpdateInfo(info)
      setDismissed(false)
    })

    // 监听下载进度
    const unsubscribeProgress = window.api.updater.onProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress)
    })

    // 监听下载完成
    const unsubscribeDownloaded = window.api.updater.onDownloaded(() => {
      setIsDownloading(false)
      setUpdateReady(true)
    })

    // 监听错误（静默处理，不显示给用户）
    const unsubscribeError = window.api.updater.onError((error) => {
      console.log('[UpdateBanner] Update check error (silently ignored):', error)
      setIsDownloading(false)
      setDownloadProgress(null)
      // 404 错误是正常的（还没有发布 Release），不显示错误提示
    })

    return () => {
      unsubscribeAvailable()
      unsubscribeProgress()
      unsubscribeDownloaded()
      unsubscribeError()
    }
  }, [])

  // 下载更新
  const handleDownload = async () => {
    setIsDownloading(true)
    await window.api.updater.download()
  }

  // 安装更新
  const handleInstall = () => {
    window.api.updater.install()
  }

  // 不显示提示条的情况
  if (!updateInfo || dismissed) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-accent text-white shadow-lg">
      <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 flex-1">
          <Download className="w-5 h-5 flex-shrink-0" />

          {updateReady ? (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-medium">
                更新已准备就绪！
              </span>
              <button
                onClick={handleInstall}
                className="px-3 py-1 bg-white text-accent rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
              >
                重启并安装
              </button>
            </div>
          ) : isDownloading ? (
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  正在下载更新...
                </span>
                {downloadProgress && (
                  <span className="text-sm opacity-90">
                    {Math.round(downloadProgress.percent)}%
                  </span>
                )}
              </div>
              {downloadProgress && (
                <div className="mt-1.5 w-full max-w-xs bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-white h-full transition-all duration-300"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-medium">
                发现新版本 v{updateInfo.version}
              </span>
              <button
                onClick={handleDownload}
                className="px-3 py-1 bg-white text-accent rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
              >
                立即更新
              </button>
            </div>
          )}
        </div>

        {!isDownloading && !updateReady && (
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-white/10 rounded transition-colors ml-4"
            title="暂时关闭"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
