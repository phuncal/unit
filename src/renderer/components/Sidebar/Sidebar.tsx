import { useEffect, useState } from 'react'
import {
  Plus, Settings as SettingsIcon, Trash2, FolderOpen,
  LayoutGrid, History, FileDown,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import { useConversationsStore } from '@/store/conversations'
import { TemplateManager } from '@/components/TemplateManager'
import { UsageStatsPanel } from '@/components/UsageStatsPanel'
import { T } from '@/lib/tokens'
import { useTranslation } from '@/lib/i18n'

// ---- 原型 ControlIcon 子组件，原封不动复刻 ----
function ControlIcon({
  icon,
  onClick,
  active = false,
  title,
}: {
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-3 rounded-sm flex items-center justify-center transition-all border ${active ? 'shadow-inner' : ''}`}
      style={{
        borderColor: active ? T.orange : 'transparent',
        backgroundColor: active ? 'rgba(43,42,39,0.05)' : 'transparent',
        color: active ? T.orange : T.textMuted,
      }}
    >
      {icon}
    </button>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const { setSettingsPanelOpen, isNewConversationDialogOpen, setNewConversationDialogOpen, setArchivePanelOpen } = useSettingsStore()
  const {
    conversations,
    currentConversation,
    createConversation,
    selectConversation,
    deleteConversation,
    templates,
  } = useConversationsStore()

  // showNewDialog 由 store 驱动，欢迎界面按钮也能触发
  const showNewDialog = isNewConversationDialogOpen
  const setShowNewDialog = setNewConversationDialogOpen
  const [newConversationName, setNewConversationName] = useState('')
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [reuseRecentDirectory, setReuseRecentDirectory] = useState(true)
  const [showTemplateSelect, setShowTemplateSelect] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [showUsageStats, setShowUsageStats] = useState(false)
  const recentProjectPath = currentConversation?.projectPath
    || conversations.find((c) => c.projectPath)?.projectPath
    || null

  // ---- 业务逻辑：启动时只加载数据，不自动选中对话（保持欢迎封面） ----
  useEffect(() => {
    const init = async () => {
      const store = useConversationsStore.getState()
      await store.loadConversations()
      store.loadTemplates()
    }
    init()
  }, [])

  useEffect(() => {
    if (!showNewDialog) return
    if (selectedDirectory) return
    if (!reuseRecentDirectory) return
    if (!recentProjectPath) return
    setSelectedDirectory(recentProjectPath)
  }, [showNewDialog, selectedDirectory, reuseRecentDirectory, recentProjectPath])

  const handleNewConversation = async () => {
    if (!newConversationName.trim()) return
    const tpl = showTemplateSelect
      ? templates.find((t) => t.name === newConversationName)?.systemPrompt
      : undefined
    await createConversation(newConversationName.trim(), selectedDirectory || undefined, tpl)
    setNewConversationName('')
    setSelectedDirectory(null)
    setShowNewDialog(false)
    setShowTemplateSelect(false)
  }

  const handleSelectDirectory = async () => {
    try {
      const path = await window.api.file.selectDirectory()
      if (path) setSelectedDirectory(path)
    } catch (e) {
      console.error('Failed to select directory:', e)
    }
  }


  const handleSaveEdit = async () => {
    if (editingId && editingName.trim()) {
      await useConversationsStore.getState().updateConversation(editingId, { name: editingName.trim() })
    }
    setEditingId(null); setEditingName('')
  }

  // 按项目目录分组
  const groups = conversations.reduce((acc, conv) => {
    const key = conv.projectPath || '未分组'
    if (!acc[key]) acc[key] = []
    acc[key].push(conv)
    return acc
  }, {} as Record<string, typeof conversations>)

  // 全局序号
  let globalIdx = 0

  // =========================================================
  // return(): 100% 照搬 UnitRedesign.jsx <aside> 结构
  // =========================================================
  return (
    <aside
      className="w-64 flex flex-col border-r relative z-20"
      style={{ backgroundColor: T.sidebarBg, borderColor: T.border }}
    >
      {/* ① macOS 交通灯避让 + 窗口拖拽区 */}
      <div className="h-12 w-full shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* ② 物理散热纹理（紧跟在交通灯下方） */}
      <div className="h-6 w-full flex flex-col justify-center gap-[3px] px-6 opacity-30 mb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[1px] w-full" style={{ backgroundColor: T.textMuted }} />
        ))}
      </div>

      {/* ③ 新建对话按钮 */}
      <div className="px-6 pb-6">
        <button
          onClick={() => setShowNewDialog(true)}
          className="w-full flex items-center justify-between py-2.5 px-3 border rounded-sm transition-all shadow-sm active:translate-y-px"
          style={{ backgroundColor: T.mainBg, borderColor: T.border }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.hoverBg)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = T.mainBg)}
        >
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.textPrimary }}>
            {t('newChat')}
          </span>
          <Plus size={14} style={{ color: T.textPrimary }} />
        </button>
      </div>

      {/* ④ 对话列表 */}
      <nav className="flex-1 px-4 space-y-4 overflow-y-auto">
        <div>
          <label
            className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 mb-4 block"
            style={{ color: T.textMuted }}
          >
            {t('index')}
          </label>
          <ul className="space-y-0.5">
            {Object.entries(groups).map(([, convs]) =>
              convs.map((conv) => {
                const idx = globalIdx++
                const isActive = currentConversation?.id === conv.id
                return (
                  <li key={conv.id} className="relative group">
                    <div
                      onClick={() => selectConversation(conv.id)}
                      className={`text-sm py-2 px-2 flex items-center justify-between transition-all cursor-pointer rounded-sm ${isActive ? 'shadow-inner' : ''}`}
                      style={{ backgroundColor: isActive ? 'rgba(43,42,39,0.06)' : 'transparent' }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = T.hoverBg }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <div className="flex items-center gap-3 truncate flex-1 mr-2">
                        <span
                          className={`text-[10px] font-mono transition-opacity ${isActive ? 'opacity-100 font-bold' : 'opacity-40'}`}
                          style={{ color: isActive ? T.orange : T.textMuted }}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {editingId === conv.id ? (
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                            className="bg-transparent border-none outline-none w-full text-sm py-0 h-5"
                            style={{ color: T.textPrimary }}
                          />
                        ) : (
                          <span
                            className={`truncate transition-colors ${isActive ? 'font-medium' : 'font-light'}`}
                            style={{ color: T.textPrimary }}
                            onDoubleClick={() => { setEditingId(conv.id); setEditingName(conv.name) }}
                          >
                            {conv.name}
                          </span>
                        )}
                      </div>

                      {/* 活跃指示竖线 */}
                      {isActive && (
                        <div
                          className="w-[2px] h-4 absolute -left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                          style={{ backgroundColor: T.orange }}
                        />
                      )}

                      {/* hover 删除按钮 */}
                      {!editingId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                          className="opacity-0 group-hover:opacity-100 p-1 transition-colors"
                          style={{ color: T.warning }}
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </nav>

      {/* ⑤ 底部工具栏（4 列等距：设置 / 计费 / 模板 / 设定档案） */}
      <div className="p-6 border-t grid grid-cols-4 gap-2" style={{ borderColor: T.border }}>
        <ControlIcon
          icon={<SettingsIcon size={18} />}
          onClick={() => setSettingsPanelOpen(true)}
          title={t('settings')}
        />
        <ControlIcon
          icon={<History size={18} />}
          onClick={() => setShowUsageStats(true)}
          title={t('stats')}
        />
        <ControlIcon
          icon={<LayoutGrid size={18} />}
          onClick={() => setShowTemplateManager(true)}
          title={t('templates')}
        />
        <ControlIcon
          icon={<FileDown size={18} />}
          onClick={() => setArchivePanelOpen(true)}
          title={t('openArchive')}
        />
      </div>

      {/* ===== 新建对话弹窗（照搬 NewChatPanel 内容放进 Overlay 结构） ===== */}
      {showNewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ backgroundColor: 'rgba(43,42,39,0.15)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => setShowNewDialog(false)}
        >
          <div
            className="max-w-xl w-full max-h-[85vh] border shadow-2xl flex flex-col overflow-hidden rounded-md"
            style={{ backgroundColor: T.mainBg, borderColor: T.border }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal 标题栏 */}
            <div className="px-8 py-5 border-b relative flex flex-col justify-center min-h-[4rem]" style={{ borderColor: T.border }}>
              <h2 className="text-[13px] font-bold tracking-wide" style={{ color: T.textPrimary }}>{t('newChat')}</h2>
              <button onClick={() => setShowNewDialog(false)} className="absolute right-8 top-5 hover:rotate-90 transition-transform">
                <span style={{ color: T.textMuted }}>✕</span>
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="space-y-10 pb-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>{t('conversationName')}</label>
                  <input
                    type="text"
                    value={newConversationName}
                    onChange={(e) => setNewConversationName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNewConversation()}
                    placeholder="..."
                    autoFocus
                    className="w-full bg-transparent border-b py-2 outline-none text-base transition-colors placeholder:opacity-40"
                    style={{ borderColor: T.border, color: T.textPrimary }}
                  />
                </div>

                {templates.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.textMuted }}>{t('selectTemplate')}</label>
                    <div className="max-h-36 overflow-y-auto border rounded-sm" style={{ borderColor: T.border, backgroundColor: 'rgba(43,42,39,0.02)' }}>
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => { setNewConversationName(tpl.name); setShowTemplateSelect(true) }}
                          className="w-full py-3 px-4 text-left text-[11px] font-medium border-b last:border-b-0 transition-colors flex justify-between items-center group"
                          style={{ borderColor: T.border, color: T.textPrimary }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.hoverBg)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <span style={{ opacity: 0.8 }}>{tpl.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDirectory && (
                  <div className="p-2 border rounded-sm" style={{ borderColor: T.accent, backgroundColor: 'rgba(71,92,77,0.06)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: T.accent }}>{t('boundDir')}</p>
                    <p className="text-[11px] truncate" style={{ color: T.textPrimary }}>{selectedDirectory}</p>
                  </div>
                )}

                <button
                  onClick={handleSelectDirectory}
                  className="flex items-center gap-2 text-[11px] font-bold uppercase transition-colors"
                  style={{ color: T.textMuted }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                >
                  <FolderOpen size={16} /> {t('bindFolder')}
                </button>

                {recentProjectPath && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setReuseRecentDirectory((v) => !v)}
                      className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                      style={{ color: reuseRecentDirectory ? T.accent : T.textMuted }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.orange)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = reuseRecentDirectory ? T.accent : T.textMuted)}
                    >
                      {reuseRecentDirectory ? t('reuseRecentDirOn') : t('reuseRecentDirOff')}
                    </button>
                    {selectedDirectory && (
                      <button
                        type="button"
                        onClick={() => setSelectedDirectory(null)}
                        className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                        style={{ color: T.textMuted }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.warning)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
                      >
                        {t('clearBoundDir')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮栏 */}
            <div className="px-8 py-5 border-t flex justify-end gap-6 items-center" style={{ backgroundColor: T.sidebarBg, borderColor: T.border }}>
              <button
                className="text-[10px] font-bold uppercase tracking-widest transition-opacity opacity-60 hover:opacity-100"
                style={{ color: T.textMuted }}
                onClick={() => setShowNewDialog(false)}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleNewConversation}
                disabled={!newConversationName.trim()}
                className="px-8 py-2 rounded-sm text-[11px] font-bold uppercase tracking-widest shadow-sm active:translate-y-px transition-all disabled:opacity-40"
                style={{ backgroundColor: T.accent, color: T.mainBg }}
              >
                {t('confirmCreate')}
              </button>
            </div>
          </div>
        </div>
      )}



      <TemplateManager isOpen={showTemplateManager} onClose={() => setShowTemplateManager(false)} />
      <UsageStatsPanel isOpen={showUsageStats} onClose={() => setShowUsageStats(false)} />
    </aside>
  )
}
