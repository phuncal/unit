import { useState, useEffect, useCallback } from 'react'
import { X, ChevronDown, ChevronRight, Plus, Edit2, Trash2, RefreshCw, FileDown, Check } from 'lucide-react'
import { useConversationsStore } from '@/store/conversations'
import { useArchive } from '@/hooks/useArchive'

interface ArchiveEntry {
  category: string
  content: string
  confirmed?: boolean
}

interface GroupedEntries {
  [category: string]: (ArchiveEntry & { index: number })[]
}

const DEFAULT_CATEGORIES = ['世界规则', '人物', '事件', '待确认']

function parseArchiveContent(text: string): GroupedEntries {
  const result: GroupedEntries = {}
  const lines = text.split('\n')
  let currentCategory = ''
  let globalIndex = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('## ')) {
      currentCategory = trimmed.slice(3).trim()
      if (!result[currentCategory]) {
        result[currentCategory] = []
      }
      continue
    }

    if (trimmed.startsWith('- ') && currentCategory) {
      result[currentCategory].push({
        category: currentCategory,
        content: trimmed.slice(2),
        confirmed: true,
        index: globalIndex++,
      })
    }
  }

  return result
}

function formatArchiveContent(grouped: GroupedEntries): string {
  let result = ''

  for (const [category, entries] of Object.entries(grouped)) {
    if (entries.length > 0) {
      result += `## ${category}\n`
      for (const entry of entries) {
        result += `- ${entry.content}\n`
      }
      result += '\n'
    }
  }

  return result.trim()
}

function CategorySection({
  category,
  entries,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  category: string
  entries: (ArchiveEntry & { index: number })[]
  isExpanded: boolean
  onToggle: () => void
  onEdit: (index: number, newContent: string) => void
  onDelete: (index: number) => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')

  const handleStartEdit = (entry: ArchiveEntry & { index: number }) => {
    setEditingIndex(entry.index)
    setEditContent(entry.content)
  }

  const handleSaveEdit = () => {
    if (editingIndex !== null && editContent.trim()) {
      onEdit(editingIndex, editContent.trim())
    }
    setEditingIndex(null)
    setEditContent('')
  }

  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-bg-secondary transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-text-secondary" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        )}
        <span className="text-sm font-medium text-text-primary">{category}</span>
        <span className="text-xs text-text-secondary">({entries.length})</span>
      </button>

      {isExpanded && (
        <div className="pb-3">
          {entries.map((entry) => (
            <div
              key={entry.index}
              className="group flex items-start gap-2 px-4 py-2 hover:bg-bg-secondary transition-colors"
            >
              {editingIndex === entry.index ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="p-1 rounded hover:bg-accent hover:text-white transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingIndex(null)}
                    className="p-1 rounded hover:bg-bg-tertiary transition-colors text-text-secondary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm text-text-primary whitespace-pre-wrap">
                    {entry.content}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEdit(entry)}
                      className="p-1 rounded hover:bg-bg-tertiary transition-colors text-text-secondary"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDelete(entry.index)}
                      className="p-1 rounded hover:bg-bg-tertiary transition-colors text-warning"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ArchivePanel() {
  const { currentConversation } = useConversationsStore()
  const { isUpdating, previewEntries, showPreview, updateArchive, cancelUpdate, exportDesignDoc } = useArchive()

  const [isOpen, setIsOpen] = useState(false)
  const [groupedEntries, setGroupedEntries] = useState<GroupedEntries>({})
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(DEFAULT_CATEGORIES))
  const [isExporting, setIsExporting] = useState(false)

  // 加载档案内容
  const loadArchive = useCallback(async () => {
    if (!currentConversation?.projectPath) {
      setGroupedEntries({})
      return
    }

    const result = await window.api.archive.read(currentConversation.projectPath)
    if (result.success && result.content) {
      const parsed = parseArchiveContent(result.content)
      setGroupedEntries(parsed)
      // 默认展开有内容的分类
      setExpandedCategories(new Set(Object.keys(parsed).filter((k) => parsed[k].length > 0)))
    } else {
      setGroupedEntries({})
    }
  }, [currentConversation?.projectPath])

  useEffect(() => {
    if (isOpen) {
      loadArchive()
    }
  }, [isOpen, loadArchive])

  // 保存档案到文件
  const saveArchive = async (newGrouped: GroupedEntries) => {
    if (!currentConversation?.projectPath) return

    const content = formatArchiveContent(newGrouped)
    await window.api.file.write(
      `${currentConversation.projectPath}/archive.md`,
      content
    )
    setGroupedEntries(newGrouped)
  }

  const handleToggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const handleEditEntry = async (index: number, newContent: string) => {
    // 找到并更新条目
    const newGrouped = { ...groupedEntries }
    for (const category of Object.keys(newGrouped)) {
      const entryIndex = newGrouped[category].findIndex((e) => e.index === index)
      if (entryIndex !== -1) {
        newGrouped[category][entryIndex] = {
          ...newGrouped[category][entryIndex],
          content: newContent,
        }
        break
      }
    }
    await saveArchive(newGrouped)
  }

  const handleDeleteEntry = async (index: number) => {
    const newGrouped = { ...groupedEntries }
    for (const category of Object.keys(newGrouped)) {
      const entryIndex = newGrouped[category].findIndex((e) => e.index === index)
      if (entryIndex !== -1) {
        newGrouped[category] = newGrouped[category].filter((_, i) => i !== entryIndex)
        break
      }
    }
    await saveArchive(newGrouped)
  }

  const handleAddEntry = async (category: string) => {
    const content = prompt('输入新条目内容：')
    if (!content?.trim()) return

    const newGrouped = { ...groupedEntries }
    if (!newGrouped[category]) {
      newGrouped[category] = []
    }

    // 计算新的全局索引
    let maxIndex = -1
    for (const entries of Object.values(newGrouped)) {
      for (const entry of entries) {
        if (entry.index > maxIndex) maxIndex = entry.index
      }
    }

    newGrouped[category].push({
      category,
      content: content.trim(),
      confirmed: true,
      index: maxIndex + 1,
    })

    await saveArchive(newGrouped)
  }

  const handleUpdateArchive = async () => {
    const result = await updateArchive()
    if (result?.entries?.length === 0) {
      alert('无新增内容')
    }
  }

  const handleConfirmUpdate = async () => {
    // 将预览条目按确认状态筛选后追加到档案
    const selectedEntries = previewEntries.filter((e) => e.confirmed !== false)
    if (selectedEntries.length === 0) {
      cancelUpdate()
      return
    }

    // 追加到现有档案
    const newGrouped = { ...groupedEntries }
    let maxIndex = -1
    for (const entries of Object.values(newGrouped)) {
      for (const entry of entries) {
        if (entry.index > maxIndex) maxIndex = entry.index
      }
    }

    for (const entry of selectedEntries) {
      if (!newGrouped[entry.category]) {
        newGrouped[entry.category] = []
      }
      newGrouped[entry.category].push({
        ...entry,
        index: ++maxIndex,
      })
    }

    await saveArchive(newGrouped)
    cancelUpdate()
  }

  const handleExportDesign = async () => {
    setIsExporting(true)
    try {
      const result = await exportDesignDoc()
      if (result?.success) {
        alert('策划文档已导出到 design.md')
      } else {
        alert('导出失败：' + (result?.error || '未知错误'))
      }
    } catch (error) {
      alert('导出失败：' + (error as Error).message)
    }
    setIsExporting(false)
  }

  const handleCreateArchive = async () => {
    if (!currentConversation?.projectPath) return

    const initialContent = DEFAULT_CATEGORIES.map((c) => `## ${c}\n`).join('\n')
    await window.api.archive.create(currentConversation.projectPath, initialContent)
    await loadArchive()
  }

  // 检查是否有绑定目录
  if (!currentConversation?.projectPath) {
    return null
  }

  return (
    <>
      {/* 打开按钮 - 右下角，与发送按钮垂直对齐 */}
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
          <div className="relative w-96 h-full bg-bg-primary shadow-xl flex flex-col">
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
              <button
                onClick={handleExportDesign}
                disabled={isExporting}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-border hover:bg-bg-secondary transition-colors text-text-secondary disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                导出策划文档
              </button>
            </div>

            {/* 预览面板 */}
            {showPreview && previewEntries.length > 0 && (
              <div className="border-b border-border bg-bg-secondary">
                <div className="px-4 py-2">
                  <h4 className="text-sm font-medium text-text-primary mb-2">新增条目预览</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {previewEntries.map((entry, idx) => (
                      <label
                        key={idx}
                        className="flex items-start gap-2 p-2 rounded hover:bg-bg-tertiary cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={entry.confirmed !== false}
                          onChange={(e) => {
                            const newEntries = [...previewEntries]
                            newEntries[idx] = { ...entry, confirmed: e.target.checked }
                            // 更新预览状态
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <span className="text-xs text-accent">{entry.category}</span>
                          <p className="text-sm text-text-primary">{entry.content}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleConfirmUpdate}
                      className="flex-1 px-3 py-2 text-sm rounded-xl hover:bg-bg-tertiary active:scale-[0.98] transition-all duration-120 text-text-secondary hover:text-text-primary"
                    >
                      确认添加
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

            {/* 分类列表 */}
            <div className="flex-1 overflow-y-auto">
              {Object.keys(groupedEntries).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <p className="text-text-secondary/70 text-[13px] mb-4">档案为空</p>
                  <button
                    onClick={handleCreateArchive}
                    className="px-4 py-2 text-sm rounded-xl hover:bg-bg-secondary active:scale-95 transition-all duration-120 text-text-secondary hover:text-text-primary"
                  >
                    创建档案
                  </button>
                </div>
              ) : (
                DEFAULT_CATEGORIES.map((category) => (
                  <div key={category}>
                    <CategorySection
                      category={category}
                      entries={groupedEntries[category] || []}
                      isExpanded={expandedCategories.has(category)}
                      onToggle={() => handleToggleCategory(category)}
                      onEdit={handleEditEntry}
                      onDelete={handleDeleteEntry}
                    />
                    {expandedCategories.has(category) && (
                      <button
                        onClick={() => handleAddEntry(category)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        添加条目
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
