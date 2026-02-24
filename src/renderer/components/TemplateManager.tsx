import { useState } from 'react'
import { X, Plus, Trash2, Edit2 } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

interface TemplateManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function TemplateManager({ isOpen, onClose }: TemplateManagerProps) {
  const { t } = useTranslation()
  const { templates, createTemplate, deleteTemplate } = useConversationsStore()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    await createTemplate(name.trim(), systemPrompt.trim())
    setName('')
    setSystemPrompt('')
    setIsCreating(false)
  }

  const handleStartEdit = (template: { id: string; name: string; systemPrompt: string }) => {
    setEditingId(template.id)
    setName(template.name)
    setSystemPrompt(template.systemPrompt)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !name.trim()) return
    await deleteTemplate(editingId)
    await createTemplate(name.trim(), systemPrompt.trim())
    setEditingId(null)
    setName('')
    setSystemPrompt('')
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('confirmDeleteTpl'))) {
      await deleteTemplate(id)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(43,42,39,0.18)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        className="w-[500px] max-h-[80vh] border shadow-2xl rounded-sm overflow-hidden flex flex-col"
        style={{ backgroundColor: T.mainBg, borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-8 py-5 border-b relative"
          style={{ borderColor: T.border }}
        >
          <h2
            className="text-[13px] font-bold tracking-wide"
            style={{ color: T.textPrimary }}
          >
            {t('templateManager')}
          </h2>
          <button
            onClick={onClose}
            className="absolute right-8 top-5 transition-transform hover:rotate-90"
          >
            <X size={17} style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* 模板列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
          {templates.length === 0 && !isCreating && (
            <div className="flex items-center justify-center py-12">
              <p className="text-[12px]" style={{ color: T.textMuted, opacity: 0.7 }}>
                {t('noTemplates')}
              </p>
            </div>
          )}

          {templates.map((template) => (
            <div
              key={template.id}
              className="border rounded-sm p-5 group transition-all"
              style={{
                borderColor: T.border,
                backgroundColor: 'rgba(43,42,39,0.02)',
              }}
            >
              {editingId === template.id ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="模板名称"
                    className="w-full border-b py-1 text-sm outline-none"
                    style={{ borderColor: T.border, color: T.textPrimary }}
                    autoFocus
                  />
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="System Prompt"
                    rows={3}
                    className="w-full text-sm resize-none outline-none leading-relaxed"
                    style={{ color: T.textPrimary }}
                  />
                  <div className="flex justify-end gap-6 pt-1">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-[10px] font-bold uppercase tracking-wider transition-colors opacity-60 hover:opacity-100"
                      style={{ color: T.textMuted }}
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="text-[10px] font-bold uppercase tracking-wider transition-colors"
                      style={{ color: T.orange }}
                    >
                      {t('saveTemplate')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm font-bold"
                      style={{ color: T.textPrimary, opacity: 0.85 }}
                    >
                      {template.name}
                    </span>
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(template)}
                        className="transition-colors"
                        style={{ color: T.textMuted }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="transition-colors"
                        style={{ color: T.textMuted }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.warning)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                  <p
                    className="text-[11px] leading-relaxed italic font-light line-clamp-2"
                    style={{ color: T.textMuted, opacity: 0.75 }}
                  >
                    {template.systemPrompt || t('noSystemPrompt')}
                  </p>
                </>
              )}
            </div>
          ))}

          {/* 新建模板表单 */}
          {isCreating && (
            <div
              className="border rounded-sm p-5 space-y-4"
              style={{
                borderColor: T.orange,
                backgroundColor: 'rgba(43,42,39,0.04)',
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('templateNamePh')}
                className="w-full border-b py-1 text-sm outline-none"
                style={{ borderColor: T.border, color: T.textPrimary }}
                autoFocus
              />
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System Prompt..."
                rows={4}
                className="w-full text-sm resize-none outline-none leading-relaxed"
                style={{ color: T.textPrimary }}
              />
              <div className="flex justify-end gap-6 pt-1">
                <button
                  onClick={() => { setIsCreating(false); setName(''); setSystemPrompt('') }}
                  className="text-[10px] font-bold uppercase tracking-wider transition-colors opacity-60 hover:opacity-100"
                  style={{ color: T.textMuted }}
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  style={{ color: T.orange }}
                >
                  {t('saveTemplate')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部：新建按钮 */}
        <div
          className="flex-shrink-0 border-t px-6 py-4"
          style={{ borderColor: T.border }}
        >
          <button
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
            className="w-full py-3 border border-dashed flex items-center justify-center gap-2 rounded-sm transition-colors disabled:opacity-50 text-[11px] font-bold uppercase tracking-wider"
            style={{ borderColor: T.border, color: T.textMuted }}
            onMouseEnter={(e) => {
              if (!isCreating) {
                e.currentTarget.style.borderColor = T.orange
                e.currentTarget.style.color = T.orange
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.border
              e.currentTarget.style.color = T.textMuted
            }}
          >
            <Plus size={13} />
            {t('newTemplate')}
          </button>
        </div>
      </div>
    </div>
  )
}
