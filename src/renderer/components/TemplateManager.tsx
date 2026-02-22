import { useState } from 'react'
import { X, Plus, Trash2, Edit2 } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'

interface TemplateManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function TemplateManager({ isOpen, onClose }: TemplateManagerProps) {
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
    // 暂时用 delete + create 来模拟 update
    await deleteTemplate(editingId)
    await createTemplate(name.trim(), systemPrompt.trim())
    setEditingId(null)
    setName('')
    setSystemPrompt('')
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除此模板？')) {
      await deleteTemplate(id)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-[500px] max-h-[80vh] bg-bg-primary rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">对话模板管理</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-secondary transition-colors">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* 模板列表 */}
        <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {templates.length === 0 && !isCreating && (
            <p className="text-center text-text-secondary text-sm py-8">
              暂无模板，点击下方按钮创建
            </p>
          )}

          {templates.map((template) => (
            <div key={template.id} className="border border-border rounded-lg p-3">
              {editingId === template.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="模板名称"
                    className="w-full px-2 py-1 bg-bg-secondary rounded text-sm"
                  />
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="System Prompt"
                    rows={3}
                    className="w-full px-2 py-1 bg-bg-secondary rounded text-sm resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 text-sm rounded-xl hover:bg-bg-secondary active:scale-[0.98] transition-all duration-120 text-text-secondary hover:text-text-primary"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-text-primary">{template.name}</h4>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(template)}
                        className="p-1 rounded hover:bg-bg-secondary transition-colors"
                      >
                        <Edit2 className="w-3 h-3 text-text-secondary" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1 rounded hover:bg-bg-secondary transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-warning" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2">{template.systemPrompt || '无 System Prompt'}</p>
                </>
              )}
            </div>
          ))}

          {/* 新建模板表单 */}
          {isCreating && (
            <div className="border border-accent rounded-lg p-3 space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="模板名称（如：设定考据者）"
                className="w-full px-2 py-1 bg-bg-secondary rounded text-sm"
                autoFocus
              />
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System Prompt..."
                rows={4}
                className="w-full px-2 py-1 bg-bg-secondary rounded text-sm resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setName('')
                    setSystemPrompt('')
                  }}
                  className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="px-3 py-1.5 text-sm rounded-xl hover:bg-bg-secondary active:scale-[0.98] transition-all duration-120 disabled:opacity-50 disabled:active:scale-100 text-text-secondary hover:text-text-primary disabled:hover:text-text-secondary"
                >
                  创建
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
            className="flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-bg-secondary rounded transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            新建模板
          </button>
        </div>
      </div>
    </div>
  )
}
