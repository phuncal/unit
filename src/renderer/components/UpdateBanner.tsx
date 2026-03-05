import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
  downloadUrl?: string
}

export function UpdateBanner() {
  const { t } = useTranslation()
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.updater.onAvailable((info: UpdateInfo) => {
      setUpdateInfo(info)
      setDismissed(false)
    })
    const unsubscribeError = window.api.updater.onError((error) => {
      console.warn('[UpdateBanner] Update check error (silently ignored):', error)
    })
    return () => { unsubscribe(); unsubscribeError() }
  }, [])

  const handleDownload = async () => {
    await window.api.updater.download(updateInfo?.downloadUrl)
  }

  if (!updateInfo || dismissed) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 shadow-md"
      style={{ backgroundColor: T.accent }}
    >
      <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 flex-1">
          <Download size={16} style={{ color: T.mainBg, flexShrink: 0 }} />
          <div className="flex items-center gap-3 flex-1">
            <span
              className="text-[12px] font-bold uppercase tracking-widest"
              style={{ color: T.mainBg }}
            >
              {t('newVersion')} v{updateInfo.version}
            </span>
            <button
              onClick={handleDownload}
              className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all rounded-sm active:translate-y-px"
              style={{
                backgroundColor: T.mainBg,
                color: T.accent,
              }}
            >
              {t('downloadDMG')}
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 transition-opacity opacity-70 hover:opacity-100 ml-4"
          style={{ color: T.mainBg }}
          title={t('dismissUpdate')}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
