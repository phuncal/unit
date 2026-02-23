import { useEffect, useState } from 'react'
import { Plus, Settings as SettingsIcon, MessageSquare, Trash2, Edit2, FolderOpen, LayoutTemplate, DollarSign } from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import { useConversationsStore } from '@/store/conversations'
import { TemplateManager } from '@/components/TemplateManager'
import { UsageStatsPanel } from '@/components/UsageStatsPanel'

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

export function Sidebar() {
  const { setSettingsPanelOpen } = useSettingsStore()
  const {
    conversations,
    currentConversation,
    createConversation,
    selectConversation,
    deleteConversation,
    templates,
  } = useConversationsStore()

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newConversationName, setNewConversationName] = useState('')
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [showTemplateSelect, setShowTemplateSelect] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [showUsageStats, setShowUsageStats] = useState(false)

  useEffect(() => {
    const init = async () => {
      const store = useConversationsStore.getState()
      await store.loadConversations()
      store.loadTemplates()
      // 重启后自动选中最近更新的对话，恢复历史消息
      const updatedStore = useConversationsStore.getState()
      if (!updatedStore.currentConversation && updatedStore.conversations.length > 0) {
        await updatedStore.selectConversation(updatedStore.conversations[0].id)
      }
    }
    init()
  }, [])

  const handleNewConversation = async () => {
    if (!newConversationName.trim()) return

    const selectedTemplate = showTemplateSelect
      ? templates.find((t) => t.name === newConversationName)?.systemPrompt
      : undefined

    await createConversation(
      newConversationName.trim(),
      selectedDirectory || undefined,
      selectedTemplate
    )
    setNewConversationName('')
    setSelectedDirectory(null)
    setShowNewDialog(false)
    setShowTemplateSelect(false)
  }

  const handleSelectDirectory = async () => {
    try {
      console.log('选择目录...')
      const path = await window.api.file.selectDirectory()
      console.log('选择的路径:', path)
      if (path) {
        setSelectedDirectory(path)
      }
    } catch (error) {
      console.error('选择目录失败:', error)
      alert('选择目录失败: ' + (error as Error).message)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  const handleDelete = async () => {
    if (contextMenu) {
      await deleteConversation(contextMenu.id)
      setContextMenu(null)
    }
  }

  const handleStartEdit = () => {
    if (contextMenu) {
      const conv = conversations.find((c) => c.id === contextMenu.id)
      if (conv) {
        setEditingId(contextMenu.id)
        setEditingName(conv.name)
      }
      setContextMenu(null)
    }
  }

  const handleSaveEdit = async () => {
    if (editingId && editingName.trim()) {
      const store = useConversationsStore.getState()
      await store.updateConversation(editingId, { name: editingName.trim() })
    }
    setEditingId(null)
    setEditingName('')
  }

  // 按项目目录分组
  const groupedConversations = conversations.reduce((acc, conv) => {
    const key = conv.projectPath || '未分组'
    if (!acc[key]) acc[key] = []
    acc[key].push(conv)
    return acc
  }, {} as Record<string, typeof conversations>)

  return (
    <div className="w-56 h-full bg-bg-secondary border-r border-border flex flex-col">
      {/* 标题栏区域 - macOS traffic light 预留空间 */}
      <div className="h-12 drag-region flex items-center px-4">
        {/* 空白区域，为 macOS traffic lights 预留 */}
      </div>

      {/* 新建对话按钮 */}
      <div className="px-3 py-3">
        <button
          onClick={() => setShowNewDialog(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl hover:bg-bg-tertiary active:scale-[0.98] transition-all duration-120 text-sm text-text-secondary hover:text-text-primary"
        >
          <Plus className="w-4 h-4" />
          <span>新建对话</span>
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto px-3">
        {Object.keys(groupedConversations).length === 0 ? (
          <div className="py-2">
            <p className="px-3 text-xs text-text-secondary">暂无对话</p>
          </div>
        ) : (
          Object.entries(groupedConversations).map(([group, convs]) => (
            <div key={group} className="py-2">
              {group !== '未分组' && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary">
                  <FolderOpen className="w-3 h-3" />
                  <span className="truncate">{group.split('/').pop()}</span>
                </div>
              )}
              {convs.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  onContextMenu={(e) => handleContextMenu(e, conv.id)}
                  className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-120 ${
                    currentConversation?.id === conv.id
                      ? 'bg-accent/10 text-text-primary border border-accent/20'
                      : 'hover:bg-bg-tertiary/80 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <MessageSquare className="w-[15px] h-[15px] flex-shrink-0" />
                  {editingId === conv.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      className="flex-1 text-[13px] bg-transparent outline-none border-b border-accent"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-[13px] truncate">{conv.name}</span>
                  )}
                  <span className="text-[10px] text-text-secondary/60 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-120">
                    {formatRelativeTime(conv.updatedAt)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="border-t border-border/50 p-3 flex items-center gap-1">
        <button
          onClick={() => setSettingsPanelOpen(true)}
          className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-bg-tertiary/80 active:scale-[0.98] transition-all duration-120 text-text-secondary/70 hover:text-text-primary"
          title="设置"
        >
          <SettingsIcon className="w-[15px] h-[15px]" />
          <span className="text-[13px]">设置</span>
        </button>
        <button
          onClick={() => setShowTemplateManager(true)}
          className="p-2.5 rounded-lg hover:bg-bg-tertiary/80 active:scale-[0.98] transition-all duration-120 text-text-secondary/70 hover:text-text-primary"
          title="对话模板"
        >
          <LayoutTemplate className="w-[15px] h-[15px]" />
        </button>
        <button
          onClick={() => setShowUsageStats(true)}
          className="p-2.5 rounded-lg hover:bg-bg-tertiary/80 active:scale-[0.98] transition-all duration-120 text-text-secondary/70 hover:text-text-primary"
          title="费用统计"
        >
          <DollarSign className="w-[15px] h-[15px]" />
        </button>
      </div>

      {/* 新建对话对话框 */}
      {showNewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setShowNewDialog(false)}
        >
          <div
            className="w-80 bg-bg-primary rounded-lg shadow-xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-text-primary mb-3">新建对话</h3>
            <input
              type="text"
              value={newConversationName}
              onChange={(e) => setNewConversationName(e.target.value)}
              placeholder="对话名称"
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent transition-colors text-sm mb-3"
              autoFocus
            />

            {/* 模板选择 */}
            {templates.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-text-secondary mb-2">选择模板（可选）</p>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setNewConversationName(t.name)
                        setShowTemplateSelect(true)
                      }}
                      className="px-2 py-1 text-xs rounded bg-bg-secondary hover:bg-bg-tertiary transition-colors text-text-secondary"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 已选择的目录 */}
            {selectedDirectory && (
              <div className="mb-3 p-2 bg-accent/10 rounded border border-accent/20">
                <p className="text-xs text-accent mb-1">已绑定目录：</p>
                <p className="text-xs text-text-primary truncate">{selectedDirectory}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSelectDirectory}
                className="flex-1 px-3 py-2 text-sm rounded border border-border hover:bg-bg-secondary transition-colors text-text-secondary"
              >
                {selectedDirectory ? '更换目录' : '绑定目录'}
              </button>
              <button
                onClick={handleNewConversation}
                disabled={!newConversationName.trim()}
                className="flex-1 px-3 py-2 text-sm rounded hover:bg-bg-tertiary transition-colors disabled:opacity-50"
                style={{ color: '#AA5555' }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-bg-primary shadow-xl border border-border rounded-xl py-2 pl-2 pr-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleStartEdit}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-secondary rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            >
              <Edit2 className="w-4 h-4" />
              重命名
            </button>
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-secondary rounded-lg transition-colors"
              style={{ color: '#AA5555' }}
            >
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        </>
      )}

      {/* 模板管理面板 */}
      <TemplateManager
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
      />

      {/* 费用统计面板 */}
      <UsageStatsPanel
        isOpen={showUsageStats}
        onClose={() => setShowUsageStats(false)}
      />
    </div>
  )
}
