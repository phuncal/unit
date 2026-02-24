// 说明书面板 — 仅 UI 视图组件
import { X } from 'lucide-react'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

interface ManualPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function ManualPanel({ isOpen, onClose }: ManualPanelProps) {
  const { t, lang } = useTranslation()

  if (!isOpen) return null

  const featureTitles = lang === 'zh'
    ? ['设定档案 archive.md', '锚点标记', '导出文档', 'Token 控制']
    : ['Settings Archive', 'Anchor Messages', 'Export Documents', 'Token Control']

  const featureDescs = lang === 'zh'
    ? ['AI 自动提取结论写入 archive.md，记忆永不丢失。', '对重要消息打上锚点，使其在长对话中始终携带。', '一键将长内容转换为 md 或策划技术文档。', '界面实时监控费用，动态调整窗口。']
    : ['AI extracts conclusions to archive.md automatically.', 'Pin critical premises to keep them in context forever.', 'One-click export to MD or technical design specs.', 'Real-time cost monitoring and sliding window adjustment.']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(43,42,39,0.18)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        className="max-w-4xl w-full max-h-[85vh] border shadow-2xl rounded-sm overflow-hidden flex flex-col"
        style={{ backgroundColor: T.mainBg, borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-12 py-6 border-b" style={{ borderColor: T.border }}>
          <h2
            className="text-[11px] font-black uppercase tracking-widest opacity-60"
            style={{ color: T.textPrimary }}
          >
            {t('manualTitle')}
          </h2>
          <button
            onClick={onClose}
            className="transition-transform hover:rotate-90"
          >
            <X size={20} style={{ color: T.textMuted, opacity: 0.3 }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-12 py-10">
          <div className="grid grid-cols-2 gap-x-16 gap-y-12 text-left pb-10">
            {/* What is Unit */}
            <section className="space-y-4">
              <h3
                className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30"
                style={{ color: T.textPrimary }}
              >
                {t('whatIsUnit')}
              </h3>
              <p
                className="text-[13px] font-bold leading-relaxed"
                style={{ color: T.textPrimary }}
              >
                {t('whatIsUnitDesc')}
              </p>
            </section>

            {/* Quick Start */}
            <section className="space-y-4">
              <h3
                className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30"
                style={{ color: T.textPrimary }}
              >
                {t('quickStart')}
              </h3>
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed" style={{ color: T.textPrimary }}>{t('qs1')}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: T.textPrimary }}>{t('qs2')}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: T.textPrimary }}>{t('qs3')}</p>
              </div>
            </section>

            {/* Divider */}
            <div className="col-span-2 h-[1px] w-full" style={{ backgroundColor: T.border, opacity: 0.6 }} />

            {/* Core Features */}
            <section className="space-y-5">
              <h3
                className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30"
                style={{ color: T.textPrimary }}
              >
                {t('coreFeatures')}
              </h3>
              <div className="space-y-6">
                {featureTitles.map((title, i) => (
                  <div key={i} className="space-y-1">
                    <p
                      className="text-[12px] font-bold uppercase tracking-tight"
                      style={{ color: T.textPrimary }}
                    >
                      {title}
                    </p>
                    <p
                      className="text-[11px] opacity-70 leading-relaxed"
                      style={{ color: T.textPrimary }}
                    >
                      {featureDescs[i]}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Tips */}
            <section className="space-y-5 flex flex-col justify-between">
              <div className="space-y-5">
                <h3
                  className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30"
                  style={{ color: T.textPrimary }}
                >
                  {t('tips')}
                </h3>
                <div className="space-y-4">
                  <p
                    className="text-[11px] leading-relaxed border-l-2 pl-4"
                    style={{ borderColor: T.orange, color: T.textPrimary }}
                  >
                    {t('tip1')}
                  </p>
                  <p
                    className="text-[11px] leading-relaxed border-l-2 pl-4"
                    style={{ borderColor: T.orange, color: T.textPrimary }}
                  >
                    {t('tip2')}
                  </p>
                </div>
              </div>
              <div
                className="pt-10 border-t border-dashed"
                style={{ borderColor: T.border }}
              >
                <p
                  className="text-[10px] italic font-medium opacity-40"
                  style={{ color: T.textPrimary }}
                >
                  {t('footerSlogan')}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
