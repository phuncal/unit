import { useState, useEffect, useRef, useMemo } from 'react'
import { RefreshCw, ChevronDown, Search, Download } from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import {
  DEFAULT_SETTINGS,
  getActiveApiConnection,
  normalizeApiConnections,
  syncSettingsWithActiveConnection,
  type ApiConnectionId,
  type ModelInfo,
} from '@/types'
import { fetchModels } from '@/api/client'
import type { UpdateInfo, DownloadProgress } from '@/types/electron'
import { useUIStore } from '@/store/ui'
import { T } from '@/lib/tokens'
import { Overlay } from '@/components/Overlay'
import { useTranslation } from '@/lib/i18n'

export function SettingsPanel() {
  const { t, lang } = useTranslation()
  const setLang = useSettingsStore((state) => state.setLang)
  const upToDateText = useMemo(() => t('upToDate'), [t])

  const settings = useSettingsStore((state) => state.settings)
  const pushToast = useUIStore((state) => state.pushToast)
  const modelsCacheByConnection = useSettingsStore((state) => state.modelsCacheByConnection)
  const isFetchingModels = useSettingsStore((state) => state.isFetchingModels)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const setSettingsPanelOpen = useSettingsStore((state) => state.setSettingsPanelOpen)
  const setModelsCache = useSettingsStore((state) => state.setModelsCache)
  const setIsFetchingModels = useSettingsStore((state) => state.setIsFetchingModels)
  const isSettingsPanelOpen = useSettingsStore((state) => state.isSettingsPanelOpen)

  const [localSettings, setLocalSettings] = useState(settings)
  const [showApiKey, setShowApiKey] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [useManualInput, setUseManualInput] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    if (isSettingsPanelOpen) {
      setLocalSettings(syncSettingsWithActiveConnection({
        ...settings,
        apiConnections: normalizeApiConnections(settings.apiConnections),
      }))
      window.api.updater.getCurrentVersion().then(setCurrentVersion)
    }
  }, [isSettingsPanelOpen, settings])

  useEffect(() => {
    const unsubscribeChecking = window.api.updater.onChecking(() => {
      setIsCheckingUpdate(true)
      setUpdateError(null)
    })
    const unsubscribeAvailable = window.api.updater.onAvailable((info: UpdateInfo) => {
      setIsCheckingUpdate(false)
      setUpdateInfo(info)
    })
    const unsubscribeNotAvailable = window.api.updater.onNotAvailable(() => {
      setIsCheckingUpdate(false)
      setUpdateInfo(null)
      pushToast(upToDateText, 'info')
    })
    const unsubscribeProgress = window.api.updater.onProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress)
    })
    const unsubscribeDownloaded = window.api.updater.onDownloaded(() => {
      setIsDownloading(false)
      setUpdateReady(true)
    })
    const unsubscribeError = window.api.updater.onError((error: { message: string }) => {
      setIsCheckingUpdate(false)
      setIsDownloading(false)
      setUpdateError(error.message)
    })
    return () => {
      unsubscribeChecking()
      unsubscribeAvailable()
      unsubscribeNotAvailable()
      unsubscribeProgress()
      unsubscribeDownloaded()
      unsubscribeError()
    }
  }, [pushToast, upToDateText])

  const localConnections = normalizeApiConnections(localSettings.apiConnections)
  const activeConnection = getActiveApiConnection({
    apiConnections: localConnections,
    activeConnectionId: localSettings.activeConnectionId,
  })
  const activeConnectionCache = modelsCacheByConnection[activeConnection.id]
  const normalizedEndpoint = activeConnection.apiEndpoint.replace(/\/+$/, '')
  const cachedEndpoint = activeConnectionCache?.endpoint?.replace(/\/+$/, '')
  const availableModels = cachedEndpoint === normalizedEndpoint && activeConnectionCache
    ? activeConnectionCache.models
    : []
  const isActiveConnectionReady = Boolean(activeConnection.apiEndpoint && activeConnection.apiKey)

  const filteredModels = useMemo(() =>
    modelSearch
      ? availableModels.filter(m =>
          m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
          (m.name && m.name.toLowerCase().includes(modelSearch.toLowerCase()))
        )
      : availableModels,
    [availableModels, modelSearch]
  )

  const getConnectionLabel = (name: string, index: number): string => {
    const fallback = t('connectionDefaultName').replace('{{index}}', String(index + 1))
    if (!name.trim()) return fallback
    if (/^Connection\s+\d+$/i.test(name.trim())) return fallback
    return name.trim()
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const patchConnection = (connectionId: ApiConnectionId, patch: Partial<(typeof localConnections)[number]>) => {
    const nextConnections = localConnections.map((conn) =>
      conn.id === connectionId ? { ...conn, ...patch } : conn
    )

    setLocalSettings(syncSettingsWithActiveConnection({
      ...localSettings,
      apiConnections: nextConnections,
      activeConnectionId: localSettings.activeConnectionId,
    }))
  }

  const switchActiveConnection = (connectionId: ApiConnectionId) => {
    setFetchError(null)
    setShowModelDropdown(false)
    setModelSearch('')
    setLocalSettings(syncSettingsWithActiveConnection({
      ...localSettings,
      apiConnections: localConnections,
      activeConnectionId: connectionId,
    }))
  }

  const handleFetchModels = async () => {
    if (!activeConnection.apiEndpoint || !activeConnection.apiKey) {
      setFetchError(t('fillApiFirst'))
      return
    }
    setFetchError(null)
    setIsFetchingModels(true)
    const result = await fetchModels(activeConnection.apiEndpoint, activeConnection.apiKey)
    setIsFetchingModels(false)
    if (result.success) {
      const cleanEndpoint = activeConnection.apiEndpoint.replace(/\/+$/, '')
      setModelsCache(activeConnection.id, { endpoint: cleanEndpoint, models: result.models, fetchedAt: Date.now() })
      setUseManualInput(false)
    } else {
      setFetchError(result.error)
      setUseManualInput(true)
    }
  }

  const handleSelectModel = (model: ModelInfo) => {
    patchConnection(activeConnection.id, { modelName: model.id })
    setShowModelDropdown(false)
    setModelSearch('')
  }

  const handleCheckUpdate = async () => {
    setUpdateError(null)
    const result = await window.api.updater.check()
    if (!result.success && result.error) {
      let userFriendlyError = result.error
      if (result.error.includes('404')) {
        userFriendlyError = '无法检查更新，可能原因：\n1. GitHub 仓库尚未发布任何 Release\n2. 网络连接问题\n\n请稍后重试或手动访问项目页面。'
      } else if (result.error.includes('ENOTFOUND') || result.error.includes('network')) {
        userFriendlyError = '网络连接失败，请检查网络设置后重试。'
      } else if (result.error.includes('timeout')) {
        userFriendlyError = '请求超时，请稍后重试。'
      }
      setUpdateError(userFriendlyError)
    }
  }

  const handleDownloadUpdate = async () => {
    setIsDownloading(true)
    setUpdateError(null)
    const result = await window.api.updater.download()
    if (!result.success && result.error) {
      setIsDownloading(false)
      setUpdateError(result.error)
    }
  }

  const handleInstallUpdate = () => {
    window.api.updater.install()
  }

  if (!isSettingsPanelOpen) return null

  const handleClose = () => setSettingsPanelOpen(false)
  const handleSave = async () => {
    await setSettings(syncSettingsWithActiveConnection({
      ...localSettings,
      apiConnections: localConnections,
      activeConnectionId: localSettings.activeConnectionId,
    }))
  }
  const handleReset = () => setLocalSettings(DEFAULT_SETTINGS)

  const inputBase = "w-full bg-transparent border-b py-1 text-sm outline-none transition-colors placeholder:opacity-40"

  return (
    <>
      <Overlay
        title={t('titleSettings')}
        onClose={handleClose}
        onConfirm={handleSave}
        onRestore={handleReset}
        confirmLabel={t('confirmSave')}
        restoreLabel={t('restore')}
      >
        <div className="space-y-8 pb-4">
          {/* ── 双语切换 — 100% 照搬 UnitRedesign.jsx SettingsPanel 顶部 ── */}
          <section className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest block" style={{ color: T.textMuted }}>
              {t('language')}
            </label>
            <div className="flex border w-fit overflow-hidden rounded-sm" style={{ borderColor: T.border }}>
              <button
                onClick={() => setLang('zh')}
                className="px-8 py-1.5 text-[11px] font-bold transition-all"
                style={{
                  backgroundColor: lang === 'zh' ? T.textPrimary : 'transparent',
                  color: lang === 'zh' ? T.mainBg : T.textPrimary,
                }}
              >
                中文
              </button>
              <button
                onClick={() => setLang('en')}
                className="px-8 py-1.5 text-[11px] font-bold transition-all border-l"
                style={{
                  borderColor: T.border,
                  backgroundColor: lang === 'en' ? T.textPrimary : 'transparent',
                  color: lang === 'en' ? T.mainBg : T.textPrimary,
                }}
              >
                ENGLISH
              </button>
            </div>
          </section>

          {/* ── API 连接池（最多 3 组） ── */}
          <section className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest block" style={{ color: T.textMuted }}>
                {t('apiConnections')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {localConnections.map((conn, idx) => {
                  const isActive = conn.id === localSettings.activeConnectionId
                  const isReady = Boolean(conn.apiEndpoint && conn.apiKey)
                  return (
                    <button
                      key={conn.id}
                      type="button"
                      onClick={() => switchActiveConnection(conn.id)}
                      className="border rounded-sm px-2 py-2 text-left transition-all"
                      style={{
                        borderColor: isActive ? T.accent : T.border,
                        backgroundColor: isActive ? 'rgba(71,92,77,0.08)' : 'rgba(43,42,39,0.02)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: T.textPrimary }}>
                          {getConnectionLabel(conn.name, idx)}
                        </span>
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isReady ? T.statusGreen : T.textMuted,
                            boxShadow: isReady ? `0 0 4px ${T.statusGreen}4d` : 'none',
                          }}
                        />
                      </div>
                      <p className="text-[9px] mt-1 truncate" style={{ color: T.textMuted, opacity: 0.8 }}>
                        {conn.modelName || t('modelUnconfigured')}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-0.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                {t('connectionName')}
              </label>
              <input
                type="text"
                value={activeConnection.name}
                onChange={(e) => patchConnection(activeConnection.id, { name: e.target.value })}
                placeholder={t('connectionNamePlaceholder')}
                className={inputBase}
                style={{ borderColor: T.border, color: T.textPrimary }}
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                  {t('apiEndpoint')}
                </label>
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: isActiveConnectionReady ? T.statusGreen : T.textMuted,
                    boxShadow: isActiveConnectionReady ? `0 0 4px ${T.statusGreen}4d` : 'none',
                  }}
                />
              </div>
              <input
                type="text"
                value={activeConnection.apiEndpoint}
                onChange={(e) => patchConnection(activeConnection.id, { apiEndpoint: e.target.value })}
                placeholder={DEFAULT_SETTINGS.apiEndpoint}
                className={inputBase}
                style={{ borderColor: T.border, color: T.textPrimary }}
              />
            </div>

            <div className="space-y-0.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                {t('apiKey')}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={activeConnection.apiKey}
                  onChange={(e) => patchConnection(activeConnection.id, { apiKey: e.target.value })}
                  placeholder="sk-..."
                  className={`${inputBase} pr-12 font-mono`}
                  style={{ borderColor: T.border, color: T.textPrimary }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-1.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: T.orange }}
                >
                  {showApiKey ? t('hide') : t('show')}
                </button>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                  {t('modelName')}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels || !activeConnection.apiEndpoint || !activeConnection.apiKey}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    style={{ color: T.textMuted }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                  >
                    <RefreshCw size={10} className={isFetchingModels ? 'animate-spin' : ''} />
                    {isFetchingModels ? t('checking') : t('fetchModels')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseManualInput(!useManualInput)}
                    className="text-[10px] font-bold uppercase tracking-wider transition-colors"
                    style={{ color: T.textMuted }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                  >
                    {useManualInput ? t('selectModel') : t('manualInput')}
                  </button>
                </div>
              </div>

              {useManualInput || availableModels.length === 0 ? (
                <input
                  type="text"
                  value={activeConnection.modelName}
                  onChange={(e) => patchConnection(activeConnection.id, { modelName: e.target.value })}
                  placeholder={DEFAULT_SETTINGS.modelName}
                  className={inputBase}
                  style={{ borderColor: T.border, color: T.textPrimary }}
                />
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="w-full border p-2 rounded-sm text-left flex items-center justify-between text-xs"
                    style={{
                      borderColor: T.border,
                      backgroundColor: 'rgba(43,42,39,0.02)',
                      color: T.textPrimary,
                    }}
                  >
                    <span style={{ color: activeConnection.modelName ? T.textPrimary : T.textMuted }}>
                      {activeConnection.modelName || t('selectModel')}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`}
                      style={{ color: T.textMuted }}
                    />
                  </button>

                  {showModelDropdown && (
                    <div
                      className="absolute z-10 w-full mt-1 border shadow-lg max-h-56 overflow-hidden rounded-sm"
                      style={{ backgroundColor: T.mainBg, borderColor: T.border }}
                    >
                      <div className="p-2 border-b" style={{ borderColor: T.border }}>
                        <div className="relative">
                          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: T.textMuted }} />
                          <input
                            type="text"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            placeholder={t('searchModel')}
                            className="w-full pl-7 pr-3 py-1 text-xs rounded-sm"
                            style={{ backgroundColor: T.sidebarBg, color: T.textPrimary }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-44">
                        {filteredModels.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs" style={{ color: T.textMuted }}>
                            {modelSearch ? t('modelNotFound') : t('noModelsFetched')}
                          </div>
                        ) : (
                          filteredModels.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => handleSelectModel(model)}
                              className="w-full px-3 py-2 text-left transition-colors"
                              style={{
                                backgroundColor: activeConnection.modelName === model.id ? T.hoverBg : 'transparent',
                              }}
                              onMouseEnter={(e) => { if (activeConnection.modelName !== model.id) e.currentTarget.style.backgroundColor = T.hoverBg }}
                              onMouseLeave={(e) => { if (activeConnection.modelName !== model.id) e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                              <div className="text-xs" style={{ color: T.textPrimary }}>{model.id}</div>
                              {model.contextLength && (
                                <div className="text-[10px]" style={{ color: T.textMuted }}>
                                  {t('contextLength')}: {(model.contextLength / 1000).toFixed(0)}K
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {fetchError && (
                <p className="text-[11px]" style={{ color: T.warning }}>{fetchError}</p>
              )}
              {availableModels.length > 0 && !useManualInput && (
                <p className="text-[10px]" style={{ color: T.textMuted, opacity: 0.7 }}>
                  {t('cachedModels').replace('{{count}}', String(availableModels.length))}
                </p>
              )}
            </div>
          </section>

          {/* ── 参数调节 — range 滑块 ── */}
          <section className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                  {t('maxTokens')}
                </label>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-sm shadow-inner"
                  style={{ backgroundColor: 'rgba(43,42,39,0.05)', color: T.textPrimary }}
                >
                  {localSettings.maxTokens}
                </span>
              </div>
              <input
                type="range" min={1000} max={32000} step={100}
                value={localSettings.maxTokens}
                onChange={(e) => setLocalSettings({ ...localSettings, maxTokens: parseInt(e.target.value) || DEFAULT_SETTINGS.maxTokens })}
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                  {t('contextLimit')}
                </label>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-sm shadow-inner"
                  style={{ backgroundColor: 'rgba(43,42,39,0.05)', color: T.textPrimary }}
                >
                  {localSettings.contextLimit.toLocaleString()}
                </span>
              </div>
              <input
                type="range" min={10000} max={200000} step={1000}
                value={localSettings.contextLimit}
                onChange={(e) => setLocalSettings({ ...localSettings, contextLimit: parseInt(e.target.value) || DEFAULT_SETTINGS.contextLimit })}
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
                  {t('slidingWindow')}
                </label>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-sm shadow-inner"
                  style={{ backgroundColor: 'rgba(43,42,39,0.05)', color: T.textPrimary }}
                >
                  {localSettings.slidingWindowSize || DEFAULT_SETTINGS.slidingWindowSize}
                </span>
              </div>
              <input
                type="range" min={1} max={100} step={1}
                value={localSettings.slidingWindowSize || DEFAULT_SETTINGS.slidingWindowSize}
                onChange={(e) => setLocalSettings({ ...localSettings, slidingWindowSize: parseInt(e.target.value) || DEFAULT_SETTINGS.slidingWindowSize })}
              />
            </div>
          </section>

          {/* ── 回复风格 — 三段式切换 ── */}
          <section className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
              {t('replyStyle')}
            </label>
            <div className="flex border w-full overflow-hidden rounded-sm" style={{ borderColor: T.border }}>
              {(['concise', 'standard', 'detailed'] as const).map((style, i) => {
                const labels: Record<string, string> = {
                  concise: t('concise'),
                  standard: t('standard'),
                  detailed: t('detailed'),
                }
                const isActive = (localSettings.replyStyle || 'standard') === style
                return (
                  <button
                    key={style}
                    onClick={() => setLocalSettings({ ...localSettings, replyStyle: style })}
                    className={`flex-1 py-1.5 text-[11px] font-bold transition-all ${i > 0 ? 'border-l' : ''}`}
                    style={{
                      borderColor: T.border,
                      backgroundColor: isActive ? T.textPrimary : 'transparent',
                      color: isActive ? T.mainBg : T.textPrimary,
                    }}
                  >
                    {labels[style]}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── 版本与更新 ── */}
          <section className="space-y-4 pt-4">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>
              {t('checkUpdate')}
            </label>
            <div
              className="flex items-center justify-between p-4 border rounded-sm"
              style={{ borderColor: T.border, backgroundColor: 'rgba(43,42,39,0.02)' }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold font-mono tracking-widest" style={{ color: T.textPrimary }}>
                  VERSION {currentVersion || '1.0.0'}
                </span>
                {!updateInfo && !updateReady && (
                  <span className="text-[9px] uppercase tracking-tighter" style={{ color: T.textMuted }}>
                    {isCheckingUpdate ? t('checking') : t('upToDate')}
                  </span>
                )}
              </div>
              {!updateInfo && !updateReady && (
                <button
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  className="px-5 py-2 border text-[10px] font-bold uppercase transition-all active:translate-y-px disabled:opacity-50"
                  style={{ borderColor: T.textPrimary, color: T.textPrimary }}
                >
                  {t('check')}
                </button>
              )}
            </div>

            {updateInfo && !updateReady && (
              <div
                className="p-4 border rounded-sm space-y-3"
                style={{ borderColor: 'rgba(71,92,77,0.3)', backgroundColor: 'rgba(71,92,77,0.06)' }}
              >
                <p className="text-[11px] font-bold" style={{ color: T.textPrimary }}>
                  {t('newVersion')}: v{updateInfo.version}
                </p>
                {updateInfo.releaseNotes && (
                  <p className="text-[11px] line-clamp-2" style={{ color: T.textMuted }}>
                    {updateInfo.releaseNotes}
                  </p>
                )}
                <button
                  onClick={handleDownloadUpdate}
                  disabled={isDownloading}
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-sm shadow-sm active:translate-y-px disabled:opacity-50 transition-all"
                  style={{ backgroundColor: T.accent, color: T.mainBg }}
                >
                  <Download size={12} className={isDownloading ? 'animate-pulse' : ''} />
                  {isDownloading
                    ? `${t('downloading')} ${downloadProgress ? Math.round(downloadProgress.percent) + '%' : '...'}`
                    : t('downloadUpdate')}
                </button>
              </div>
            )}

            {updateReady && (
              <div
                className="p-4 border rounded-sm space-y-3"
                style={{ borderColor: 'rgba(71,92,77,0.3)', backgroundColor: 'rgba(71,92,77,0.06)' }}
              >
                <p className="text-[11px] font-bold" style={{ color: T.textPrimary }}>
                  {t('updateReady')}
                </p>
                <button
                  onClick={handleInstallUpdate}
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-sm shadow-sm active:translate-y-px transition-all"
                  style={{ backgroundColor: T.accent, color: T.mainBg }}
                >
                  <Download size={12} />
                  {t('restartInstall')}
                </button>
              </div>
            )}

            {updateError && (
              <div
                className="p-3 border rounded-sm"
                style={{ borderColor: 'rgba(184,92,56,0.3)', backgroundColor: 'rgba(184,92,56,0.06)' }}
              >
                <p className="text-[11px] whitespace-pre-line" style={{ color: T.warning }}>
                  {updateError}
                </p>
              </div>
            )}
          </section>
        </div>
      </Overlay>

    </>
  )
}
