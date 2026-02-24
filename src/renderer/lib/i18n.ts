// 全局双语字典 — 100% 照搬 UnitRedesign.jsx translations，并补全项目所有 UI 字符串
import { useSettingsStore } from '@/store/settings'

export const translations = {
  zh: {
    // 侧边栏
    newChat:         '新建对话',
    index:           '项目索引 / INDEX',
    conversationName:'会话名称',
    selectTemplate:  '选择模板',
    bindFolder:      '绑定本地目录',
    boundDir:        '已绑定目录',
    rename:          '重命名',
    delete:          '删除',
    cancel:          '取消',
    confirmCreate:   '确认并创建',

    // 底栏图标 tooltip
    settings:        '系统设置',
    stats:           '费用统计',
    templates:       '模板管理',
    archive:         '设定档案',

    // 欢迎封面
    standbyTitle:    'UNIT',
    standbyDesc:     '精密讨论仪器 / MODEL V1.2.1',

    // 聊天 header
    updateArchive:   '更新档案',

    // 聊天消息区
    systemReady:     '已读取项目档案 archive.md，可以开始对话。',
    startChat:       '开始对话吧',

    // 输入框
    placeholder:     '输入讨论指令或拖入文件...',
    placeholderNoApi:'请先配置 API',
    shortcut:        '⌘ + ⏎ 发送 / ⏎ 换行',

    // 导出菜单
    exportMarkdown:  '导出为 Markdown',
    exportPinned:    '仅导出锚点消息',
    exportText:      '导出为纯文本',
    exportDesignDoc: '策划文档转换',

    // 系统设置面板
    language:        '界面语言 / LANGUAGE',
    apiEndpoint:     'API ENDPOINT',
    orgId:           '组织 ID / ORG ID（可选）',
    apiKey:          'API KEY',
    modelName:       '模型名称 / MODEL',
    maxTokens:       '最大输出 TOKEN',
    contextLimit:    '上下文警告阈值',
    slidingWindow:   '滑动窗口大小',
    replyStyle:      '默认回复风格',
    checkUpdate:     '版本 / CHECK FOR UPDATES',
    fetchModels:     '获取模型',
    manualInput:     '手动输入',
    selectModel:     '选择模型',
    show:            '显示',
    hide:            '隐藏',
    upToDate:        '当前已是最新版本',
    checking:        '检查中...',
    concise:         '简洁',
    standard:        '标准',
    detailed:        '详尽',
    newVersion:      '发现新版本',
    downloadUpdate:  '下载更新',
    downloading:     '下载中',
    restartInstall:  '重启并安装',
    updateReady:     '更新已准备就绪',
    titleSettings:   '系统设置',
    restore:         '恢复默认',
    confirmSave:     '确认保存',
    check:           'CHECK',

    // 档案面板
    archiveTitle:       '设定档案',
    archiveEmpty:       '档案为空，点击"更新档案"提取对话结论',
    editArchive:        '编辑',
    saveEdit:           '保存',
    confirmWrite:       '确认写入',
    previewLabel:       '待写入内容预览（可编辑）',
    emptyArchive:       '档案内容为空...',
    updateArchiveBtn:   '更新档案',
    noNewContent:       '无新增内容',
    writeFailed:        '写入失败：',

    // 模板管理
    newTemplate:        '新建模板',
    templateName:       '模板名称',
    templateNamePh:     '模板名称（如：设定考据者）',
    saveTemplate:       '保存模板',
    templateManager:    '对话模板管理',
    noTemplates:        '暂无模板，点击下方按钮创建',
    noSystemPrompt:     '无 System Prompt',
    confirmDeleteTpl:   '确定删除此模板？',

    // 上下文选择
    contextTitle:       '选择携带的上下文',
    selectAll:          '全选',
    selectNone:         '全不选',
    restoreDefault:     '恢复默认',
    confirmSend:        '确认并发送',
    userLabel:          '用户',
    aiLabel:            'AI',
    imagePlaceholder:   '[图片]',

    // 搜索
    searchTooltip:      '搜索对话 (⌘F)',
    searchPlaceholder:  '搜索...',

    // 档案条目选择器
    archiveMenuTitle:   '选择档案条目',

    // 更新横幅
    downloadDMG:        '下载 DMG 安装',
    dismissUpdate:      '暂时关闭',

    // 费用统计
    usageStats:         '费用统计',
    usageStatsTip:      '费用基于 API 返回的 token 用量计算，仅统计有价格信息的模型。',

    // 说明书面板
    manualTitle:        '使用说明书 / USER MANUAL',
    whatIsUnit:         'UNIT 是什么',
    whatIsUnitDesc:     '一个运行在 macOS 上的 AI 对话工具，专为深度讨论游戏、影视、文学作品设定而设计。轻量、专注、无多余功能。',
    quickStart:         '五分钟上手',
    qs1:                '01 配置 API：填写地址和 Key，点击获取模型。',
    qs2:                '02 创建项目：绑定文件夹，自动生成 archive.md。',
    qs3:                '03 开始对话：使用模板预设角色，开启讨论。',
    coreFeatures:       '核心功能',
    tips:               '使用建议',
    tip1:               '建议为每个项目建立独立文件夹，保持结论连续性。',
    tip2:               '重要文档上传后立即打锚点，防止被滑动窗口挤掉。',
    footerSlogan:       'Unit · 专注于深度讨论，不做多余的事',
    info:               '使用说明 / INFO',

    // 通用
    saveTip:            '保存',
    uploadImage:        '上传图片',
    openArchive:        '设定档案',
    contextSelect:      '选择发送的上下文',
    sendTooltip:        '发送',
    regenerate:         '重新生成',
  },
  en: {
    // Sidebar
    newChat:         'NEW SESSION',
    index:           'INDEX',
    conversationName:'SESSION NAME',
    selectTemplate:  'SELECT TEMPLATE',
    bindFolder:      'Bind Local Directory',
    boundDir:        'DIRECTORY BOUND',
    rename:          'Rename',
    delete:          'Delete',
    cancel:          'CANCEL',
    confirmCreate:   'CONFIRM',

    // Bottom icons
    settings:        'SYSTEM PREFS',
    stats:           'ANALYTICS',
    templates:       'TEMPLATES',
    archive:         'ARCHIVE',

    // Welcome
    standbyTitle:    'UNIT',
    standbyDesc:     'PRECISION INSTRUMENT / MODEL V1.2.1',

    // Chat header
    updateArchive:   'UPDATE ARCHIVE',

    // Message area
    systemReady:     'Archive.md loaded. System standby.',
    startChat:       'Start a conversation',

    // Input
    placeholder:     'Enter instruction or drop file...',
    placeholderNoApi:'Configure API first',
    shortcut:        '⌘ + ⏎ SEND / ⏎ NEW LINE',

    // Export menu
    exportMarkdown:  'Export as Markdown',
    exportPinned:    'Pinned Messages Only',
    exportText:      'Export as Plain Text',
    exportDesignDoc: 'Design Doc Convert',

    // Settings panel
    language:        'INTERFACE LANGUAGE',
    apiEndpoint:     'API ENDPOINT',
    orgId:           'ORGANIZATION ID (OPTIONAL)',
    apiKey:          'API KEY',
    modelName:       'MODEL NAME',
    maxTokens:       'MAX OUTPUT TOKEN',
    contextLimit:    'CONTEXT ALERT LIMIT',
    slidingWindow:   'SLIDING WINDOW',
    replyStyle:      'DEFAULT STYLE',
    checkUpdate:     'CHECK FOR UPDATES',
    fetchModels:     'FETCH MODELS',
    manualInput:     'Manual',
    selectModel:     'Select Model',
    show:            'Show',
    hide:            'Hide',
    upToDate:        'System is up to date',
    checking:        'Fetching...',
    concise:         'Concise',
    standard:        'Standard',
    detailed:        'Detailed',
    newVersion:      'New version found',
    downloadUpdate:  'Download Update',
    downloading:     'Downloading',
    restartInstall:  'Restart & Install',
    updateReady:     'Update ready to install',
    titleSettings:   'SYSTEM PREFS',
    restore:         'RESTORE',
    confirmSave:     'CONFIRM & SAVE',
    check:           'CHECK',

    // Archive panel
    archiveTitle:       'ARCHIVE',
    archiveEmpty:       'Archive is empty. Click "Update Archive" to extract conclusions.',
    editArchive:        'Edit',
    saveEdit:           'Save',
    confirmWrite:       'Confirm Write',
    previewLabel:       'Preview (Editable)',
    emptyArchive:       'Archive is empty...',
    updateArchiveBtn:   'Update Archive',
    noNewContent:       'No new content',
    writeFailed:        'Write failed: ',

    // Template manager
    newTemplate:        'New Template',
    templateName:       'Template Name',
    templateNamePh:     'Template name (e.g. World-Audit)',
    saveTemplate:       'Save Template',
    templateManager:    'TEMPLATE MANAGER',
    noTemplates:        'No templates yet. Create one below.',
    noSystemPrompt:     'No System Prompt',
    confirmDeleteTpl:   'Delete this template?',

    // Context selector
    contextTitle:       'Select Context to Send',
    selectAll:          'Select All',
    selectNone:         'Select None',
    restoreDefault:     'Restore Default',
    confirmSend:        'CONFIRM & SEND',
    userLabel:          'User',
    aiLabel:            'AI',
    imagePlaceholder:   '[Image]',

    // Search
    searchTooltip:      'Search (⌘F)',
    searchPlaceholder:  'Search...',

    // Archive mention picker
    archiveMenuTitle:   'Select Archive Entry',

    // Update banner
    downloadDMG:        'Download DMG',
    dismissUpdate:      'Dismiss',

    // Usage stats
    usageStats:         'ANALYTICS',
    usageStatsTip:      'Costs calculated from API token usage. Only models with pricing info are counted.',

    // Manual panel
    manualTitle:        'USER MANUAL / 使用说明书',
    whatIsUnit:         'WHAT IS UNIT',
    whatIsUnitDesc:     'A macOS desktop AI tool built for deep discussions on game, film, and literary worldbuilding. Lightweight, focused, and free of bloat.',
    quickStart:         'GET STARTED IN 5 MINS',
    qs1:                '01 Config API: Enter endpoint and Key, then fetch models.',
    qs2:                '02 Create Project: Bind a local folder to auto-generate archive.md.',
    qs3:                '03 Start Session: Use templates to preset AI roles and context.',
    coreFeatures:       'CORE FEATURES',
    tips:               'BEST PRACTICES',
    tip1:               'Create a dedicated folder for each project to maintain continuity.',
    tip2:               'Anchor documents immediately to prevent them from dropping out.',
    footerSlogan:       'Unit · Built for depth. Nothing more.',
    info:               'USER MANUAL / INFO',

    // General
    saveTip:            'Save',
    uploadImage:        'Upload Image',
    openArchive:        'Archive',
    contextSelect:      'Select context to send',
    sendTooltip:        'Send',
    regenerate:         'Regenerate',
  },
} as const

export type TranslationKey = keyof typeof translations.zh

// 全局 useTranslation hook — 所有组件直接调用，自动响应 lang 变化
export function useTranslation() {
  const lang = useSettingsStore((state) => state.lang)
  const t = (key: TranslationKey): string =>
    (translations[lang] as Record<string, string>)[key] ??
    (translations.zh as Record<string, string>)[key] ??
    key
  return { t, lang }
}
