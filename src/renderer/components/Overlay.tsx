// 共享弹窗容器 — 100% 照搬 UnitRedesign.jsx 的 Overlay 组件结构
import { X } from 'lucide-react'
import { T } from '@/lib/tokens'

interface OverlayProps {
  title: string
  subtitle?: string | null
  children: React.ReactNode
  onClose: () => void
  onConfirm?: () => void
  onRestore?: () => void
  confirmLabel?: string
  restoreLabel?: string
  wide?: boolean
  noFooter?: boolean
}

export function Overlay({
  title,
  subtitle,
  children,
  onClose,
  onConfirm,
  onRestore,
  confirmLabel = '确认并保存',
  restoreLabel = '恢复默认',
  wide = false,
  noFooter = false,
}: OverlayProps) {
  return (
    <div
      className="fixed inset-0 backdrop-blur-sm z-[100] flex items-center justify-center p-8"
      style={{ backgroundColor: 'rgba(43,42,39,0.15)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className={`${wide ? 'max-w-3xl' : 'max-w-xl'} w-full max-h-[85vh] border shadow-2xl flex flex-col overflow-hidden rounded-md`}
        style={{ backgroundColor: T.mainBg, borderColor: T.border }}
      >
        {/* 标题栏 */}
        <div
          className="px-8 py-5 border-b relative flex flex-col justify-center min-h-[4rem]"
          style={{ borderColor: T.border }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold tracking-wide" style={{ color: T.textPrimary }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="absolute right-8 top-5 hover:rotate-90 transition-transform"
            >
              <X size={18} style={{ color: T.textMuted }} />
            </button>
          </div>
          {subtitle && (
            <span className="text-[11px] mt-1" style={{ color: T.textMuted }}>
              {subtitle}
            </span>
          )}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-8">{children}</div>

        {/* 底部操作栏 */}
        {!noFooter && (
          <div
            className="px-8 py-5 border-t flex justify-end gap-6 items-center"
            style={{ backgroundColor: T.sidebarBg, borderColor: T.border }}
          >
            <button
              className="text-[10px] font-bold uppercase tracking-widest transition-opacity opacity-60 hover:opacity-100"
              style={{ color: T.textMuted }}
              onClick={onRestore ?? onClose}
            >
              {restoreLabel}
            </button>
            <button
              onClick={onConfirm ?? onClose}
              className="px-8 py-2 rounded-sm text-[11px] font-bold uppercase tracking-widest shadow-sm active:translate-y-px transition-all"
              style={{ backgroundColor: T.accent, color: T.mainBg }}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
