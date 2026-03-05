import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface UIStore {
  toasts: ToastItem[]
  pushToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
}

const TOAST_TTL_MS = 3200
const MAX_TOASTS = 4

export const useUIStore = create<UIStore>()((set, get) => ({
  toasts: [],

  pushToast: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), { id, message, type }],
    }))
    setTimeout(() => {
      get().removeToast(id)
    }, TOAST_TTL_MS)
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }))
  },
}))

