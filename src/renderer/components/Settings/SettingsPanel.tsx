import { useState, useEffect, useRef } from 'react'
import { X, FileText, RefreshCw, ChevronDown, Search, Download } from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import { DEFAULT_SETTINGS, type ModelInfo } from '@/types'
import { TemplateManager } from '@/components/TemplateManager'
import { fetchModels } from '@/api/client'
import type { UpdateInfo, DownloadProgress } from '@/types/electron'

export function SettingsPanel() {
  // 分别获取状态和操作，确保正确订阅
  const settings = useSettingsStore((state) => state.settings)
  const modelsCache = useSettingsStore((state) => state.modelsCache)
  const isFetchingModels = useSettingsStore((state) => state.isFetchingModels)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const setSettingsPanelOpen = useSettingsStore((state) => state.setSettingsPanelOpen)
  const setModelsCache = useSettingsStore((state) => state.setModelsCache)
  const setIsFetchingModels = useSettingsStore((state) => state.setIsFetchingModels)
  const isSettingsPanelOpen = useSettingsStore((state) => state.isSettingsPanelOpen)
  const [localSettings, setLocalSettings] = useState(settings)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [useManualInput, setUseManualInput] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 更新相关状态
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  // 打开设置面板时，同步全局 settings 到本地状态
  useEffect(() => {
    if (isSettingsPanelOpen) {
      // settings 已经在 store 初始化时被解密，直接使用
      setLocalSettings(settings)

      // 获取当前版本号
      window.api.updater.getCurrentVersion().then(setCurrentVersion)
    }
  }, [isSettingsPanelOpen, settings])

  // 监听更新事件
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
      alert('当前已是最新版本')
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
  }, [])

  // 当前可用的模型列表（比较时清理末尾斜杠）
  const normalizedEndpoint = localSettings.apiEndpoint.replace(/\/+$/, '')
  const cachedEndpoint = modelsCache?.endpoint?.replace(/\/+$/, '')
  const availableModels = cachedEndpoint === normalizedEndpoint && modelsCache
    ? modelsCache.models
    : []

  // 过滤模型列表
  const filteredModels = modelSearch
    ? availableModels.filter(m =>
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        (m.name && m.name.toLowerCase().includes(modelSearch.toLowerCase()))
      )
    : availableModels

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 获取模型列表
  const handleFetchModels = async () => {
    if (!localSettings.apiEndpoint || !localSettings.apiKey) {
      setFetchError('请先填写 API Endpoint 和 API Key')
      return
    }

    setFetchError(null)
    setIsFetchingModels(true)

    const result = await fetchModels(localSettings.apiEndpoint, localSettings.apiKey)
    setIsFetchingModels(false)

    if (result.success) {
      // 存储时清理末尾斜杠，确保比较时一致
      const cleanEndpoint = localSettings.apiEndpoint.replace(/\/+$/, '')
      setModelsCache({
        endpoint: cleanEndpoint,
        models: result.models,
        fetchedAt: Date.now(),
      })
      setUseManualInput(false)
    } else {
      setFetchError(result.error)
      setUseManualInput(true)
    }
  }

  // 选择模型
  const handleSelectModel = (model: ModelInfo) => {
    setLocalSettings({ ...localSettings, modelName: model.id })
    setShowModelDropdown(false)
    setModelSearch('')
  }

  // 检查更新
  const handleCheckUpdate = async () => {
    setUpdateError(null)
    const result = await window.api.updater.check()
    if (!result.success && result.error) {
      // 将技术错误转换为用户友好的提示
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

  // 下载更新
  const handleDownloadUpdate = async () => {
    setIsDownloading(true)
    setUpdateError(null)
    const result = await window.api.updater.download()
    if (!result.success && result.error) {
      setIsDownloading(false)
      setUpdateError(result.error)
    }
  }

  // 安装更新
  const handleInstallUpdate = () => {
    window.api.updater.install()
  }

  if (!isSettingsPanelOpen) return null

  const handleClose = () => {
    setSettingsPanelOpen(false)
  }

  const handleSave = async () => {
    await setSettings(localSettings)
    // 不再自动关闭面板，让用户手动通过 X 关闭
  }

  const handleReset = () => {
    setLocalSettings(DEFAULT_SETTINGS)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-[480px] max-h-[80vh] bg-bg-primary rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">设置</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 min-h-0 p-6 space-y-6 overflow-y-auto">
          {/* API Endpoint */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">API Endpoint</label>
            <input
              type="text"
              value={localSettings.apiEndpoint}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, apiEndpoint: e.target.value })
              }
              placeholder={DEFAULT_SETTINGS.apiEndpoint}
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
            />
            <p className="text-xs text-text-secondary">
              支持 OpenAI 格式的 API，如 OpenRouter、DeepSeek 等
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={localSettings.apiKey}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, apiKey: e.target.value })
                }
                placeholder="sk-..."
                className="w-full px-3 py-2 pr-16 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              使用系统钥匙串加密存储，不会明文保存
            </p>
          </div>

          {/* Model Name */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm text-text-primary">模型名称</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={isFetchingModels || !localSettings.apiEndpoint || !localSettings.apiKey}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                  获取模型
                </button>
                <button
                  type="button"
                  onClick={() => setUseManualInput(!useManualInput)}
                  className="text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  {useManualInput ? '选择模型' : '手动输入'}
                </button>
              </div>
            </div>

            {useManualInput || availableModels.length === 0 ? (
              // 手动输入模式
              <>
                <input
                  type="text"
                  value={localSettings.modelName}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, modelName: e.target.value })
                  }
                  placeholder={DEFAULT_SETTINGS.modelName}
                  className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
                />
                <p className="text-xs text-text-secondary">
                  手动输入模型 ID，如 gpt-4o、claude-sonnet-4-5、glm-4
                </p>
              </>
            ) : (
              // 下拉选择模式
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors text-left flex items-center justify-between"
                >
                  <span className={localSettings.modelName ? 'text-text-primary' : 'text-text-secondary'}>
                    {localSettings.modelName || '选择模型...'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showModelDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-bg-primary rounded-lg border border-border shadow-lg max-h-60 overflow-hidden">
                    {/* 搜索框 */}
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                        <input
                          type="text"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          placeholder="搜索模型..."
                          className="w-full pl-8 pr-3 py-1.5 bg-bg-secondary rounded text-sm"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* 模型列表 */}
                    <div className="overflow-y-auto max-h-48">
                      {filteredModels.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-text-secondary">
                          {modelSearch ? '没有匹配的模型' : '暂无模型列表，请点击"获取模型"'}
                        </div>
                      ) : (
                        filteredModels.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => handleSelectModel(model)}
                            className={`w-full px-3 py-2 text-left hover:bg-bg-secondary transition-colors ${
                              localSettings.modelName === model.id ? 'bg-accent/10' : ''
                            }`}
                          >
                            <div className="text-sm text-text-primary">{model.id}</div>
                            {model.contextLength && (
                              <div className="text-xs text-text-secondary">
                                上下文: {(model.contextLength / 1000).toFixed(0)}K
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

            {/* 错误提示 */}
            {fetchError && (
              <p className="text-xs text-warning">{fetchError}</p>
            )}

            {/* 缓存信息 */}
            {availableModels.length > 0 && !useManualInput && (
              <p className="text-xs text-text-secondary">
                已缓存 {availableModels.length} 个模型
              </p>
            )}
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">最大输出 Token</label>
            <input
              type="number"
              value={localSettings.maxTokens}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  maxTokens: parseInt(e.target.value) || DEFAULT_SETTINGS.maxTokens,
                })
              }
              min={1}
              max={128000}
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
            />
          </div>

          {/* Context Limit */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">上下文警告阈值</label>
            <input
              type="number"
              value={localSettings.contextLimit}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  contextLimit: parseInt(e.target.value) || DEFAULT_SETTINGS.contextLimit,
                })
              }
              min={1000}
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
            />
            <p className="text-xs text-text-secondary">
              当上下文接近此阈值时显示警告
            </p>
          </div>

          {/* Sliding Window Size */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">滑动窗口大小</label>
            <input
              type="number"
              value={localSettings.slidingWindowSize || DEFAULT_SETTINGS.slidingWindowSize}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  slidingWindowSize: parseInt(e.target.value) || DEFAULT_SETTINGS.slidingWindowSize,
                })
              }
              min={5}
              max={100}
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
            />
            <p className="text-xs text-text-secondary">
              发送时只携带最近 N 条消息 + 锚点消息
            </p>
          </div>

          {/* Reply Style */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">默认回复风格</label>
            <select
              value={localSettings.replyStyle || 'standard'}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  replyStyle: e.target.value as 'concise' | 'standard' | 'detailed',
                })
              }
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors"
            >
              <option value="concise">简洁（150字以内）</option>
              <option value="standard">标准</option>
              <option value="detailed">详尽</option>
            </select>
          </div>

          {/* Template Manager */}
          <div className="space-y-2">
            <label className="block text-sm text-text-primary">对话模板</label>
            <button
              onClick={() => setShowTemplateManager(true)}
              className="flex items-center gap-2 px-4 py-2 bg-bg-secondary rounded border border-border hover:border-accent transition-colors text-sm text-text-secondary hover:text-text-primary"
            >
              <FileText className="w-4 h-4" />
              管理模板
            </button>
          </div>

          {/* About & Update */}
          <div className="space-y-2 pt-4 border-t border-border">
            <label className="block text-sm text-text-primary">关于</label>
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                当前版本: v{currentVersion || '1.0.0'}
              </p>

              {/* 更新按钮 */}
              {!updateInfo && !updateReady && (
                <button
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-secondary rounded border border-border hover:border-accent transition-colors text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${isCheckingUpdate ? 'animate-pulse' : ''}`} />
                  {isCheckingUpdate ? '检查中...' : '检查更新'}
                </button>
              )}

              {/* 发现新版本 */}
              {updateInfo && !updateReady && (
                <div className="space-y-2 p-3 bg-accent/10 rounded border border-accent/30">
                  <p className="text-sm text-text-primary">
                    发现新版本: v{updateInfo.version}
                  </p>
                  {updateInfo.releaseNotes && (
                    <p className="text-xs text-text-secondary line-clamp-2">
                      {updateInfo.releaseNotes}
                    </p>
                  )}
                  <button
                    onClick={handleDownloadUpdate}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {isDownloading ? (
                      <>
                        <Download className="w-3.5 h-3.5 animate-pulse" />
                        下载中 {downloadProgress ? `${Math.round(downloadProgress.percent)}%` : '...'}
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        下载更新
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* 更新已下载 */}
              {updateReady && (
                <div className="space-y-2 p-3 bg-accent/10 rounded border border-accent/30">
                  <p className="text-sm text-text-primary">
                    更新已准备就绪
                  </p>
                  <button
                    onClick={handleInstallUpdate}
                    className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent/90 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    重启并安装
                  </button>
                </div>
              )}

              {/* 错误提示 */}
              {updateError && (
                <div className="p-3 bg-warning/10 rounded border border-warning/30">
                  <p className="text-xs text-warning whitespace-pre-line">{updateError}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-border bg-bg-secondary">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            恢复默认
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-xl hover:bg-bg-tertiary active:scale-[0.98] transition-all duration-120 text-text-secondary hover:text-text-primary"
            >
              保存
            </button>
          </div>
        </div>
      </div>

      {/* 模板管理器 */}
      <TemplateManager
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
      />
    </div>
  )
}
