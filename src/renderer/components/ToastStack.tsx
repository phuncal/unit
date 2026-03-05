import { useUIStore } from '@/store/ui'
import { T } from '@/lib/tokens'
import type { CSSProperties } from 'react'

export function ToastStack() {
  const toasts = useUIStore((state) => state.toasts)
  const removeToast = useUIStore((state) => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-[380px]"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      {toasts.map((toast) => {
        const color = toast.type === 'error'
          ? T.warning
          : toast.type === 'success'
            ? T.accent
            : T.textPrimary
        return (
          <div
            key={toast.id}
            className="border rounded-sm shadow-lg px-3 py-2 text-sm flex items-start gap-3"
            style={{
              backgroundColor: T.mainBg,
              borderColor: color,
              color: T.textPrimary,
            }}
          >
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
              {toast.type}
            </span>
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-xs leading-none"
              style={{ color: T.textMuted }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
