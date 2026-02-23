import { useState, useEffect, useCallback } from 'react'
import { X, RefreshCw, FileDown, Check } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useArchive } from '@/hooks/useArchive'

export function ArchivePanel() {
  const { currentConversation } = useConversationsStore()
  const { isUpdating, previewText, showPreview, updateArchive, confirmUpdate, cancelUpdate } = useArchive()

  const [isOpen, setIsOpen] = useState(false)
  const [archiveContent, setArchiveContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editablePreview, setEditablePreview] = useState('')

  // 加载档案内容
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
    if (isOpen) {
      loadArchive()
    }
  }, [isOpen, loadArchive])

  // 同步预览文本到可编辑状态
  useEffect(() => {
    if (showPreview) {
      setEditablePreview(previewText)
    }
  }, [showPreview, previewText])

  const handleUpdateArchive = async () => {
    const result = await updateArchive()
    if (result?.empty) {
      alert('无新增内容')
    }
  }

  const handleConfirmUpdate = async () => {
    const result = await confirmUpdate(editablePreview)
    if (result?.success) {
      await loadArchive()
    } else {
      alert('写入失败：' + (result?.error || '未知错误'))
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

  if (!currentConversation?.projectPath) {
    return null
  }

  return (
    <>
      {/* 打开按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-8 bottom-8 p-3 rounded-2xl hover:bg-bg-secondary active:scale-95 transition-all duration-120 z-30 text-text-secondary hover:text-text-primary"
        title="打开档案面板"
      >
        <FileDown className="w-5 h-5" />
      </button>

      {/* 侧边抽屉 */}
      {isOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setIsOpen(false)} />
          <div className="relative w-[420px] h-full bg-bg-primary shadow-xl flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text-primary">设定档案</h3>
                <span className="text-xs text-text-secondary">
                  {currentConversation.projectPath.split('/').pop()}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-bg-secondary transition-colors text-text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 操作栏 */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
              <button
                onClick={handleUpdateArchive}
                disabled={isUpdating}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl hover:bg-bg-secondary active:scale-[0.98] transition-all duration-120 disabled:opacity-50 disabled:active:scale-100 text-text-secondary hover:text-text-primary"
              >
                <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                更新档案
              </button>
              {!isEditing && (
                <button
                  onClick={() => {
                    setEditContent(archiveContent)
                    setIsEditing(true)
                  }}
                  className="px-3 py-1.5 text-sm rounded-xl hover:bg-bg-secondary active:scale-[0.98] transition-all duration-120 text-text-secondary hover:text-text-primary"
                >
                  编辑
                </button>
              )}
              {isEditing && (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-xl bg-accent/10 hover:bg-accent/20 active:scale-[0.98] transition-all duration-120 text-accent"
                  >
                    <Check className="w-4 h-4" />
                    保存
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-sm rounded-xl hover:bg-bg-secondary active:scale-[0.98] transition-all duration-120 text-text-secondary"
                  >
                    取消
                  </button>
                </>
              )}
            </div>

            {/* 新增内容预览 */}
            {showPreview && (
              <div className="border-b border-border bg-bg-secondary">
                <div className="px-4 py-3">
                  <h4 className="text-xs font-medium text-text-secondary mb-2">待写入内容预览（可编辑）</h4>
                  <textarea
                    value={editablePreview}
                    onChange={(e) => setEditablePreview(e.target.value)}
                    className="w-full h-40 text-sm text-text-primary bg-bg-primary border border-border rounded-lg px-3 py-2 resize-none leading-relaxed"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleConfirmUpdate}
                      className="flex-1 px-3 py-2 text-sm rounded-xl bg-accent/10 hover:bg-accent/20 active:scale-[0.98] transition-all duration-120 text-accent font-medium"
                    >
                      确认写入
                    </button>
                    <button
                      onClick={cancelUpdate}
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-border/60 hover:bg-bg-tertiary/80 active:scale-[0.98] transition-all duration-120 text-text-secondary"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 档案正文 */}
            <div className="flex-1 overflow-y-auto p-4">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] text-sm text-text-primary bg-transparent resize-none leading-relaxed font-mono focus:outline-none"
                  placeholder="档案内容为空..."
                />
              ) : archiveContent.trim() ? (
                <pre className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed font-sans">
                  {archiveContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-text-secondary/70 text-[13px]">档案为空，点击"更新档案"提取对话结论</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
