import { useState, useEffect, useCallback } from 'react'
import { X, RotateCcw, Edit2, Check } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useArchive } from '@/hooks/useArchive'
import { useSettingsStore } from '@/store/settings'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

export function ArchivePanel() {
  const { t } = useTranslation()
  const { currentConversation } = useConversationsStore()
  const { isUpdating, previewText, showPreview, updateArchive, confirmUpdate, cancelUpdate } = useArchive()
  const isArchivePanelOpen = useSettingsStore((s) => s.isArchivePanelOpen)
  const setArchivePanelOpen = useSettingsStore((s) => s.setArchivePanelOpen)

  const [isOpen, setIsOpen] = useState(false)

  // 同步 store 状态到本地
  useEffect(() => {
    if (isArchivePanelOpen && !isOpen) setIsOpen(true)
  }, [isArchivePanelOpen])
  const [archiveContent, setArchiveContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editablePreview, setEditablePreview] = useState('')

  const loadArchive = useCallback(async () => {
    if (!currentConversation?.projectPath) {
      setArchiveContent('')
      return
    }
    const result = await window.api.archive.read(currentConversation.projectPath)
    if (result.success && result.content) {
      setArchiveContent(result.content)
    } else {
      setArchiveContent('')
    }
  }, [currentConversation?.projectPath])

  useEffect(() => {
    if (isOpen) loadArchive()
  }, [isOpen, loadArchive])

  useEffect(() => {
    if (showPreview) setEditablePreview(previewText)
  }, [showPreview, previewText])

  const handleUpdateArchive = async () => {
    const result = await updateArchive()
    if (result?.empty) alert(t('noNewContent'))
  }

  const handleConfirmUpdate = async () => {
    const result = await confirmUpdate(editablePreview)
    if (result?.success) {
      await loadArchive()
    } else {
      alert(t('writeFailed') + (result?.error || '未知错误'))
    }
  }

  const handleSaveEdit = async () => {
    if (!currentConversation?.projectPath) return
    await window.api.file.write(
      `${currentConversation.projectPath}/archive.md`,
      editContent
    )
    setArchiveContent(editContent)
    setIsEditing(false)
  }

  if (!currentConversation?.projectPath) return null

  return (
    <>
      {/* 侧边抽屉 — 由 Sidebar FileDown 图标触发，无浮动按钮 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* 左侧遮罩：flex-1 兄弟节点，不覆盖右侧面板 */}
          <div
            className="flex-1"
            style={{ backgroundColor: 'rgba(43,42,39,0.15)' }}
            onClick={() => { setIsOpen(false); setArchivePanelOpen(false) }}
          />
          <div
            className="w-[420px] h-full shadow-2xl flex flex-col"
            style={{ backgroundColor: T.mainBg, borderLeft: `1px solid ${T.border}` }}
          >
            {/* 标题栏 */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: T.border }}
            >
              <div className="flex items-center gap-3">
                <h3
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: T.textPrimary }}
                >
                  {t('archiveTitle')}
                </h3>
                <span
                  className="text-[10px] font-mono"
                  style={{ color: T.textMuted, opacity: 0.6 }}
                >
                  {currentConversation.projectPath.split('/').pop()}
                </span>
              </div>
              <button
                onClick={() => { setIsOpen(false); setArchivePanelOpen(false) }}
                className="transition-transform hover:rotate-90"
              >
                <X size={16} style={{ color: T.textMuted }} />
              </button>
            </div>

            {/* 操作栏 */}
            <div
              className="flex items-center gap-2 px-5 py-3 border-b"
              style={{ borderColor: T.border }}
            >
              <button
                onClick={handleUpdateArchive}
                disabled={isUpdating}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                style={{ color: T.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
              >
                <RotateCcw size={13} className={isUpdating ? 'animate-spin' : ''} />
                {t('updateArchiveBtn')}
              </button>

              {!isEditing && (
                <button
                  onClick={() => {
                    setEditContent(archiveContent)
                    setIsEditing(true)
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors"
                  style={{ color: T.textMuted }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                >
                  <Edit2 size={13} />
                  {t('editArchive')}
                </button>
              )}

              {isEditing && (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors"
                    style={{ color: T.accent }}
                  >
                    <Check size={13} />
                    {t('saveEdit')}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-[11px] font-bold uppercase tracking-wider transition-colors"
                    style={{ color: T.textMuted }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                  >
                    {t('cancel')}
                  </button>
                </>
              )}
            </div>

            {/* 新增内容预览 */}
            {showPreview && (
              <div
                className="border-b"
                style={{ borderColor: T.border, backgroundColor: T.sidebarBg }}
              >
                <div className="px-5 py-4 space-y-3">
                  <h4
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: T.textMuted }}
                  >
                    {t('previewLabel')}
                  </h4>
                  <textarea
                    value={editablePreview}
                    onChange={(e) => setEditablePreview(e.target.value)}
                    className="w-full h-36 text-sm resize-none leading-relaxed border px-3 py-2 focus:outline-none"
                    style={{
                      backgroundColor: T.mainBg,
                      borderColor: T.border,
                      color: T.textPrimary,
                    }}
                  />
                  <div className="flex justify-end gap-5 pt-1">
                    <button
                      onClick={cancelUpdate}
                      className="text-[13px] transition-colors"
                      style={{ color: T.textMuted }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.textPrimary)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleConfirmUpdate}
                      className="text-[13px] transition-colors"
                      style={{ color: T.textPrimary }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = T.textPrimary)}
                    >
                      {t('confirmWrite')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 档案正文 */}
            <div className="flex-1 overflow-y-auto p-5">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] text-sm resize-none leading-relaxed font-mono focus:outline-none"
                  style={{ backgroundColor: 'transparent', color: T.textPrimary }}
                  placeholder={t('emptyArchive')}
                />
              ) : archiveContent.trim() ? (
                <pre
                  className="text-sm whitespace-pre-wrap leading-relaxed font-sans"
                  style={{ color: T.textPrimary }}
                >
                  {archiveContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p
                    className="text-[13px] tracking-wide text-center"
                    style={{ color: T.textMuted }}
                  >
                    {t('archiveEmpty')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
