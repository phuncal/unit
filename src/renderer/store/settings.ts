import { create } from 'zustand'
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware'
import {
  type Settings,
  type ModelsCache,
  type ModelsCacheByConnection,
  type ApiConnectionId,
  DEFAULT_SETTINGS,
  normalizeApiConnections,
  syncSettingsWithActiveConnection,
} from '@/types'

interface SettingsStore {
  settings: Settings
  lang: 'zh' | 'en'
  isSettingsPanelOpen: boolean
  isArchivePanelOpen: boolean
  isNewConversationDialogOpen: boolean
  modelsCacheByConnection: ModelsCacheByConnection
  isFetchingModels: boolean
  setSettings: (settings: Partial<Settings>) => Promise<void>
  setLang: (lang: 'zh' | 'en') => void
  setSettingsPanelOpen: (open: boolean) => void
  setArchivePanelOpen: (open: boolean) => void
  setNewConversationDialogOpen: (open: boolean) => void
  loadSettings: () => Promise<void>
  setModelsCache: (connectionId: ApiConnectionId, cache: ModelsCache | null) => void
  setIsFetchingModels: (fetching: boolean) => void
}

const STORAGE_KEY = 'unit-settings'

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)

async function decryptApiKey(value: string): Promise<string> {
  if (!value) return ''
  try {
    return await window.api.settings.decrypt(value)
  } catch (error) {
    console.error('[Settings] Failed to decrypt API key:', error)
    return ''
  }
}

async function encryptApiKey(value: string): Promise<string> {
  if (!value) return ''
  try {
    return await window.api.settings.encrypt(value)
  } catch (error) {
    console.error('[Settings] Failed to encrypt API key:', error)
    return ''
  }
}

async function hydrateSettings(raw: Partial<Settings> | undefined): Promise<Settings> {
  const baseRaw = raw || {}
  const hasConnectionPool = Array.isArray(baseRaw.apiConnections) && baseRaw.apiConnections.length > 0
  let connections = normalizeApiConnections(baseRaw.apiConnections)

  for (let index = 0; index < connections.length; index++) {
    const decrypted = await decryptApiKey(connections[index].apiKey)
    connections[index] = { ...connections[index], apiKey: decrypted }
  }

  const topLevelDecryptedKey = await decryptApiKey(baseRaw.apiKey || '')
  const activeConnectionId =
    baseRaw.activeConnectionId && connections.some((conn) => conn.id === baseRaw.activeConnectionId)
      ? baseRaw.activeConnectionId
      : DEFAULT_SETTINGS.activeConnectionId

  if (!hasConnectionPool) {
    const legacyEndpoint = (baseRaw.apiEndpoint || connections[0].apiEndpoint).trim()
    const legacyModel = (baseRaw.modelName || connections[0].modelName).trim()
    connections = connections.map((conn, index) => {
      if (index !== 0) return conn
      return {
        ...conn,
        apiEndpoint: legacyEndpoint,
        modelName: legacyModel,
        apiKey: topLevelDecryptedKey,
      }
    })
  } else {
    connections = connections.map((conn) => {
      if (conn.id !== activeConnectionId) return conn
      return {
        ...conn,
        apiEndpoint: conn.apiEndpoint || (baseRaw.apiEndpoint || '').trim(),
        modelName: conn.modelName || (baseRaw.modelName || '').trim(),
        apiKey: conn.apiKey || topLevelDecryptedKey,
      }
    })
  }

  return syncSettingsWithActiveConnection({
    ...DEFAULT_SETTINGS,
    ...baseRaw,
    activeConnectionId,
    apiConnections: connections,
  } as Settings)
}

function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  const hasConnectionPatch = Array.isArray(patch.apiConnections)
  let apiConnections = normalizeApiConnections(hasConnectionPatch ? patch.apiConnections : current.apiConnections)

  const activeConnectionId =
    patch.activeConnectionId && apiConnections.some((conn) => conn.id === patch.activeConnectionId)
      ? patch.activeConnectionId
      : current.activeConnectionId

  const hasTopLevelApiPatch =
    hasOwn(patch, 'apiEndpoint') ||
    hasOwn(patch, 'apiKey') ||
    hasOwn(patch, 'modelName')

  if (!hasConnectionPatch && hasTopLevelApiPatch) {
    apiConnections = apiConnections.map((conn) => {
      if (conn.id !== activeConnectionId) return conn
      return {
        ...conn,
        apiEndpoint: patch.apiEndpoint !== undefined ? patch.apiEndpoint : conn.apiEndpoint,
        apiKey: patch.apiKey !== undefined ? patch.apiKey : conn.apiKey,
        modelName: patch.modelName !== undefined ? patch.modelName : conn.modelName,
      }
    })
  }

  return syncSettingsWithActiveConnection({
    ...current,
    ...patch,
    activeConnectionId,
    apiConnections,
  } as Settings)
}

// 自定义 storage，在持久化时加密 API Key，读取时解密
const createEncryptedStorage = (): StateStorage => {
  return {
    getItem: async (name: string) => {
      const str = localStorage.getItem(name)
      if (!str) return null

      try {
        const data = JSON.parse(str)
        const state = data?.state
        const hydrated = await hydrateSettings(state?.settings)

        const legacyCache = state?.modelsCache as ModelsCache | null | undefined
        const cacheMap: ModelsCacheByConnection = {
          ...(state?.modelsCacheByConnection || {}),
        }
        if (legacyCache && !cacheMap[hydrated.activeConnectionId]) {
          cacheMap[hydrated.activeConnectionId] = legacyCache
        }

        data.state = {
          ...(state || {}),
          settings: hydrated,
          modelsCacheByConnection: cacheMap,
        }
        delete data.state.modelsCache

        return JSON.stringify(data)
      } catch (error) {
        console.error('[Settings] Failed to parse stored settings:', error)
        return null
      }
    },
    setItem: async (name: string, value: string) => {
      try {
        const data = JSON.parse(value)
        const state = data?.state || {}
        const rawSettings = state.settings as Partial<Settings> | undefined
        const normalized = syncSettingsWithActiveConnection({
          ...DEFAULT_SETTINGS,
          ...(rawSettings || {}),
          apiConnections: normalizeApiConnections(rawSettings?.apiConnections),
          activeConnectionId: rawSettings?.activeConnectionId || DEFAULT_SETTINGS.activeConnectionId,
        } as Settings)
        const connections = [...normalized.apiConnections]

        for (let index = 0; index < connections.length; index++) {
          connections[index] = {
            ...connections[index],
            apiKey: await encryptApiKey(connections[index].apiKey),
          }
        }

        const activeEncryptedKey = connections.find((conn) => conn.id === normalized.activeConnectionId)?.apiKey || ''

        const encryptedSettings: Settings = {
          ...normalized,
          apiConnections: connections,
          apiKey: activeEncryptedKey,
        }

        data.state = {
          ...state,
          settings: encryptedSettings,
          modelsCacheByConnection: state.modelsCacheByConnection || {},
        }
        delete data.state.modelsCache

        localStorage.setItem(name, JSON.stringify(data))
      } catch (error) {
        console.error('[Settings] Failed to save settings:', error)
      }
    },
    removeItem: (name: string) => {
      localStorage.removeItem(name)
    },
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      lang: 'zh' as 'zh' | 'en',
      isSettingsPanelOpen: false,
      isArchivePanelOpen: false,
      isNewConversationDialogOpen: false,
      modelsCacheByConnection: {},
      isFetchingModels: false,

      setSettings: async (newSettings) => {
        const nextSettings = mergeSettings(get().settings, newSettings)
        set({ settings: nextSettings })
      },

      setLang: (lang) => {
        set({ lang })
      },

      setSettingsPanelOpen: (open) => {
        set({ isSettingsPanelOpen: open })
      },

      setArchivePanelOpen: (open) => {
        set({ isArchivePanelOpen: open })
      },

      setNewConversationDialogOpen: (open) => {
        set({ isNewConversationDialogOpen: open })
      },

      loadSettings: async () => {
        // 由于使用自定义 storage，rehydrate 时已完成解密和迁移。
      },

      setModelsCache: (connectionId, cache) => {
        set((state) => {
          if (!cache) {
            const nextCache = { ...state.modelsCacheByConnection }
            delete nextCache[connectionId]
            return { modelsCacheByConnection: nextCache }
          }
          return {
            modelsCacheByConnection: {
              ...state.modelsCacheByConnection,
              [connectionId]: cache,
            },
          }
        })
      },

      setIsFetchingModels: (fetching) => {
        set({ isFetchingModels: fetching })
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (state) => ({
        settings: state.settings,
        modelsCacheByConnection: state.modelsCacheByConnection,
      }),
    }
  )
)
