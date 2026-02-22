import { create } from 'zustand'
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware'
import { Settings, DEFAULT_SETTINGS, ModelsCache } from '@/types'

interface SettingsStore {
  settings: Settings
  isSettingsPanelOpen: boolean
  modelsCache: ModelsCache | null
  isFetchingModels: boolean
  setSettings: (settings: Partial<Settings>) => Promise<void>
  setSettingsPanelOpen: (open: boolean) => void
  loadSettings: () => Promise<void>
  setModelsCache: (cache: ModelsCache | null) => void
  setIsFetchingModels: (fetching: boolean) => void
}

// 本地存储 key
const STORAGE_KEY = 'unit-settings'

// 自定义 storage，在持久化时加密 API Key，读取时解密
const createEncryptedStorage = (): StateStorage => {
  return {
    getItem: async (name: string) => {
      const str = localStorage.getItem(name)
      if (!str) return null

      try {
        const data = JSON.parse(str)

        // 如果有 settings.apiKey，尝试解密
        if (data?.state?.settings?.apiKey) {
          const encryptedKey = data.state.settings.apiKey

          // 检查是否已经是明文（兼容旧数据或加密失败的情况）
          const isPlaintext =
            encryptedKey.startsWith('sk-') ||
            encryptedKey.startsWith('sk-ss-')

          if (!isPlaintext) {
            try {
              console.log('[Settings] Decrypting API Key from storage...')
              const decrypted = await window.api.settings.decrypt(encryptedKey)
              data.state.settings.apiKey = decrypted
              console.log('[Settings] API Key decrypted successfully')
            } catch (error) {
              console.error('[Settings] Failed to decrypt API Key:', error)
              // 解密失败，清空 API Key
              data.state.settings.apiKey = ''
            }
          } else {
            console.log('[Settings] API Key is plaintext (legacy or fallback)')
          }
        }

        return JSON.stringify(data)
      } catch (error) {
        console.error('[Settings] Failed to parse stored settings:', error)
        return null
      }
    },
    setItem: async (name: string, value: string) => {
      try {
        const data = JSON.parse(value)

        // 如果有 settings.apiKey，加密后再存储
        if (data?.state?.settings?.apiKey) {
          const plainKey = data.state.settings.apiKey

          try {
            console.log('[Settings] Encrypting API Key for storage...')
            const encrypted = await window.api.settings.encrypt(plainKey)
            data.state.settings.apiKey = encrypted
            console.log('[Settings] API Key encrypted successfully')
          } catch (error) {
            console.warn('[Settings] Encryption failed, storing plaintext:', error)
            // 加密失败，保持明文（开发环境可能不支持加密）
          }
        }

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
      isSettingsPanelOpen: false,
      modelsCache: null,
      isFetchingModels: false,

      setSettings: async (newSettings) => {
        const { settings } = get()

        console.log('[Settings] Updating settings:', Object.keys(newSettings))

        // 直接更新 settings（明文存在内存中）
        // persist 中间件会自动调用我们的 storage.setItem 来加密
        set({
          settings: { ...settings, ...newSettings },
        })
      },

      setSettingsPanelOpen: (open) => {
        set({ isSettingsPanelOpen: open })
      },

      loadSettings: async () => {
        // 由于我们使用了自定义 storage，settings 已经在 getItem 时被解密
        // 这个方法现在主要用于强制重新加载
        console.log('[Settings] loadSettings called - using decrypted data from storage')
      },

      setModelsCache: (cache) => {
        set({ modelsCache: cache })
      },

      setIsFetchingModels: (fetching) => {
        set({ isFetchingModels: fetching })
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (state) => ({ settings: state.settings, modelsCache: state.modelsCache }),
    }
  )
)
