# Unit · 开发文档

> 本文档供 Claude Code 使用。Unit 是一个运行在 macOS 上的桌面聊天工具，专门用于和 AI 深度讨论游戏、影视、文学作品的设定内容。

---

## 项目定位

轻量、专注、无冗余功能。目标用户只有一个人，开发决策始终以"够用且不多余"为标准，不以功能丰富度为目标。

---

## 技术栈

| 层面 | 选型 |
|------|------|
| 桌面框架 | Electron |
| 前端框架 | React + TypeScript |
| 样式 | Tailwind CSS |
| 本地数据库 | IndexedDB（via Dexie.js） |
| 文件系统 | Node.js fs（Electron 主进程） |
| AI 通信 | 原生 fetch，兼容 OpenAI 格式流式接口 |
| 构建工具 | Vite + electron-vite |
| 包管理 | npm |

---

## 目录结构

```
unit/
├── CLAUDE.md                  # 本文件
├── package.json
├── electron.vite.config.ts
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 入口，窗口创建
│   │   ├── ipc/               # IPC 处理器
│   │   │   ├── file.ts        # 文件读写、目录操作
│   │   │   └── archive.ts     # archive.md 读写
│   │   └── preload.ts         # 预加载脚本，暴露 API 给渲染进程
│   ├── renderer/              # React 前端
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Sidebar/       # 左侧对话列表
│   │   │   ├── Chat/          # 主聊天区域
│   │   │   ├── Archive/       # 设定档案面板
│   │   │   └── Settings/      # 设置面板
│   │   ├── store/             # 状态管理（Zustand）
│   │   │   ├── conversations.ts
│   │   │   └── settings.ts
│   │   ├── db/                # IndexedDB 操作（Dexie）
│   │   │   └── index.ts
│   │   ├── hooks/             # 自定义 hooks
│   │   │   ├── useChat.ts
│   │   │   └── useArchive.ts
│   │   ├── api/               # AI 接口调用
│   │   │   └── client.ts
│   │   └── styles/
│   │       └── globals.css
└── resources/                 # 应用图标等静态资源
```

---

## 核心数据结构

### Conversation（对话）

```typescript
interface Conversation {
  id: string                  // UUID
  name: string                // 用户命名，如"巫师3·主线讨论"
  projectPath: string | null  // 绑定的本地目录路径
  systemPrompt: string        // 该对话的 system prompt
  messages: Message[]
  tokenCount: number          // 当前累计 token 估算值
  createdAt: number
  updatedAt: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: ContentBlock[]     // 支持文本和图片混合
  pinned: boolean             // 是否被标记为重要/锚点
  createdAt: number
}

interface ContentBlock {
  type: 'text' | 'image'
  text?: string
  image?: {
    data: string              // base64
    mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  }
}
```

### Settings（全局设置）

```typescript
interface Settings {
  apiEndpoint: string         // 自定义 base URL，如 https://openrouter.ai/api/v1
  apiKey: string              // 本地存储，不上传
  modelName: string           // 手动输入，如 claude-sonnet-4-5、glm-4、gpt-4o
  maxTokens: number           // 最大输出 token
  contextLimit: number        // 上下文警告阈值（token 数）
}
```

### ArchiveEntry（设定档案条目）

```typescript
interface ArchiveEntry {
  id: string
  category: string            // 分类，如"世界规则"、"人物"、"待确认"
  content: string             // 条目正文
  confirmed: boolean          // 是否已确认（预览时可勾选）
  addedAt: number
}
```

---

## 功能模块详述

### 1. API 接入

- 接口格式兼容 OpenAI Chat Completions 标准（`/v1/chat/completions`）
- 必须支持流式输出（`stream: true`），使用 `ReadableStream` 逐块处理
- 网络请求走系统代理（Electron 默认继承系统代理，无需额外配置）
- API Key 存储在 Electron 的 `safeStorage`（系统钥匙串加密），不明文存在任何文件中
- 每次请求只携带当前对话的消息历史，绝对不跨对话传递内容
- 图片以 base64 格式编码后放入 `content` 数组，`type: "image_url"` 格式
- 发送前检测模型名称是否包含视觉能力关键词（如包含 `vision`），或由用户手动标注，界面给出提示
- 响应完成后读取返回的 token 用量字段（`usage.prompt_tokens` / `usage.completion_tokens`），记录到本地，用于费用统计
- 每条 assistant 消息显示生成耗时，Anthropic 原生 API 额外显示缓存命中状态（读取 `cache_read_input_tokens` 字段）
- 对 archive.md 内容和 system prompt 自动添加 `"cache_control": {"type": "ephemeral"}` 标记（仅 Anthropic 原生 API 生效，第三方中转忽略）

**模型列表自动获取**

设置面板中，填入 base URL 和 API Key 后，可点击"获取模型"按钮，向 `{baseURL}/models` 发起请求，自动拉取该平台可用的模型列表。

- 列表以可搜索的下拉选择器展示，支持关键词过滤
- 选中模型后自动填入模型名称字段，不需要手动输入
- 同时保留手动输入模式作为备选（部分平台 `/models` 接口需要特殊权限或不支持）
- 获取的模型列表缓存在本地，下次打开设置时直接显示，不需要重复请求
- 若接口返回模型的上下文长度信息（`context_length`），在列表中一并显示，帮助用户选择
- 若平台 `/models` 接口不可用，降级为手动输入，不报错崩溃

### 1.5 Token 成本控制

这是针对第三方 API 长上下文讨论场景的核心节省手段，目标是将同等讨论量的成本压缩至 30% 以下。

**滑动窗口上下文（最重要）**

不将完整对话历史发送给 AI，而是只发送：
- 最近 N 条消息（N 可在设置中配置，默认 20）
- 所有被标记为"锚点"的消息（pinned）
- archive.md 内容（作为 system 级注入）

早期讨论过程已提炼进档案，不需要反复携带。这一项单独可将长对话成本砍掉一大半。界面上显示"当前携带 X 条 / 共 Y 条"，让用户清楚知道实际发送了什么。

**发送前费用预估**

点击发送前，根据当前将要发送的 token 数 × 模型单价，在发送按钮旁边显示本次请求的预估费用（如 `≈ $0.02`）。模型单价表硬编码在本地，涵盖常用模型：

```typescript
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // 价格单位：美元 / 1K tokens
  'claude-sonnet-4-5':        { input: 0.003,   output: 0.015 },
  'claude-opus-4-5':          { input: 0.015,   output: 0.075 },
  'gpt-4o':                   { input: 0.0025,  output: 0.01  },
  'gpt-4o-mini':              { input: 0.00015, output: 0.0006},
  'gemini-1.5-pro':           { input: 0.00125, output: 0.005 },
  // 第三方中转价格通常与原价相近，未匹配的模型不显示预估
}
```

**累计费用统计**

设置面板中显示：今日消耗 / 本周消耗 / 总计消耗（美元），按对话分别记录。数据存本地 IndexedDB，基于实际返回的 token 用量字段计算，无法获取时用估算值代替。

**手动上下文选择**

发送前可点击"上下文"按钮，展开当前将要携带的消息列表，支持逐条取消勾选。对于已经得出结论的讨论段落，可手动排除，只保留近期来回。

**回复风格控制**

每个对话可设置回复风格，影响 system prompt 中对输出长度的要求：
- **简洁**：回复控制在 150 字以内，除非用户要求展开
- **标准**：无特殊限制（默认）
- **详尽**：鼓励展开分析，不压缩内容

output token 同样计费，简洁模式在长讨论中能节省约 20-30% 的输出成本。

### 2. 对话管理

- 所有对话数据持久化存储在 IndexedDB，不放内存
- 对话列表按 `updatedAt` 降序排列
- 支持对话重命名、删除
- 支持从任意消息节点创建分支对话（复制该节点之前的所有消息到新对话）
- 支持删除单条消息
- 支持标记消息为"重要/锚点"（pinned），导出时可选仅导出锚点消息
- token 计数：用字符数估算（中文1字≈1.5 token，英文1词≈1.3 token），显示在界面顶部，接近阈值时变色警告
- 每个对话有独立的 system prompt 编辑入口
- **对话内搜索**：顶部搜索栏支持关键词搜索当前对话内所有消息，结果高亮显示，可前后跳转定位。搜索在本地 IndexedDB 内完成，不依赖滚动刷新，长对话也可精准定位
- **对话模板**：常用 system prompt 可保存为模板（如"设定考据者"、"世界观分析"），新建对话时一键套用，不需重复输入
- **快速引用档案条目**：输入框内输入 `@` 触发档案条目选择器，选中后自动插入条目内容到当前输入，减少复制粘贴操作
- **拖入文件**：支持将本地 `.txt` / `.md` 文件直接拖入输入框，软件自动读取内容并插入当前消息，作为参考资料发送给 AI

### 3. 设定档案系统（Archive）

**目录绑定**

- 对话创建时可选绑定一个本地目录（通过 Electron dialog 选择）
- 绑定目录后，软件检测该目录下是否存在 `archive.md`
- 若存在，新建对话时自动读取内容，作为第一条 system 级消息注入（不显示在消息列表中，但计入 token）
- 若不存在，提示用户是否创建

**更新档案（核心交互）**

点击"更新档案"按钮后：

1. 将当前完整对话内容发给 AI，附带专用 prompt：
   ```
   请分析以上对话，提取出新增的、已明确确认的设定结论。
   要求：
   - 只提取结论，不要过程和推论
   - 按分类输出（世界规则 / 人物 / 事件 / 待确认）
   - 每条结论独立一行，以"- "开头
   - 如果没有新增结论，返回"无新增内容"
   ```
2. AI 返回的条目以预览面板形式展示，每条前有勾选框，默认全选
3. 用户可逐条勾选保留、取消或直接编辑文本
4. 确认后，软件将勾选内容以追加方式写入 `archive.md`，保留原有内容不覆盖
5. 写入使用流式追加（`fs.appendFile`），不一次性加载整个文件

**archive.md 分类视图**

界面里以折叠面板形式按分类展示档案条目（世界规则 / 人物 / 事件 / 待确认），支持展开收起，方便浏览和定位。底层仍存为标准 Markdown 格式，不影响 Claude Code / Cursor 读取。支持在界面内直接编辑单条条目。

**archive.md 格式规范**

```markdown
## 世界规则
- 魔法消耗生命力，每次施法减少约1年寿命
- 神明无法直接干预凡间，只能通过神使

## 人物
- 主角 Kael：失忆者，左手有封印，第三章确认是前任魔王

## 待确认 / 存疑
- Kael 失忆的原因：目前推测为自我封印，原文第7章有矛盾
```

### 4. 双版本导出

**文学版**

导出完整对话或锚点消息为 Markdown 文件，保留叙述性文字和思考过程，文件名默认为对话名称。

**开发版（策划文档）**

将 `archive.md` 内容发给 AI，附带专用 prompt，转换为结构化格式：

```
请将以下设定档案转换为适合放入游戏开发项目目录、供 Claude Code 或 Cursor 读取的结构化策划文档。
使用 Markdown 格式，包含清晰的分类标题和数据化的属性描述。
```

生成结果预览后，用户确认，保存为 `design.md` 放入绑定目录。

**导出实现**

- 使用 `fs.createWriteStream` 流式写入，避免大文件卡死
- 支持导出格式：`.md`、`.txt`

### 5. 性能保障

- 消息列表使用虚拟滚动（`@tanstack/react-virtual`），只渲染可见区域
- AI 响应使用流式输出，实时逐字显示
- 对话数据分页从 IndexedDB 加载，不一次性全量读取
- 图片存储：原图存 IndexedDB，界面显示时按需解码，不预加载所有图片

---

## 界面结构

```
┌─────────────────────────────────────────────────────┐
│  [Unit]                              [设置]           │  标题栏（macOS 原生）
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  对话列表     │         消息区域（虚拟滚动）            │
│              │                                      │
│  + 新建对话  │                                      │
│              │                                      │
│  ──────────  │                                      │
│              │                                      │
│  项目目录    │                                      │
│  ├ 巫师3     │                                      │
│  └ 黑神话    │                                      │
│              ├──────────────────────────────────────┤
│              │  [输入框]         [图片] [发送]        │
└──────────────┴──────────────────────────────────────┘
```

- 左侧栏宽度固定，不可拖拽（保持克制）
- 设定档案面板作为右侧抽屉，需要时展开，不常驻
- 设置作为独立面板覆盖，不新开窗口

---

## 设计规范

### 核心原则

参照 Dieter Rams 设计哲学：**少，但更好**（Less, but better）。每个设计决策优先考虑减法，功能存在是因为必要，不因为可以加。

### 色彩

```
背景主色：#F5F5F0   （暖白，接近博朗产品的米色质感）
背景次级：#EEEDE8   （侧边栏、输入区）
边界线：  #D8D6D0   （极细，1px）
正文：    #1A1A18   （近黑，非纯黑）
次要文字：#8A8880   （辅助信息、时间戳）
强调色：  #3D6B5E   （唯一强调色，用于发送按钮、激活状态）
警告色：  #B85C38   （token 超限警告）
```

### 字体

```
界面文字：SF Pro Text（macOS 系统字体，-apple-system）
代码/档案：SF Mono
字号基准：14px
行高基准：1.6
```

### 间距系统

以 4px 为基础单位，所有间距为 4 的倍数：4 / 8 / 12 / 16 / 24 / 32 / 48。

### 动效

- 过渡时长：120ms（快速反馈）/ 240ms（面板展开）
- 缓动曲线：`cubic-bezier(0.25, 0.1, 0.25, 1)`
- 流式文字输出：无打字机光标动效，直接追加文本，保持安静

### 细节要求

- 所有可点击元素的 hover 状态有明确但克制的背景色变化
- 输入框无边框设计，靠背景色区分区域
- 消息气泡不使用气泡形状，用留白和缩进区分 user/assistant
- 图标使用线性风格，不使用填充风格，统一来源（推荐 Lucide）
- 滚动条极细（4px），hover 时才完全显示

---

## 开发顺序

按以下顺序实现，每个阶段完成后可独立运行：

**阶段一：基础骨架**
- Electron + React + Vite 项目初始化
- 主窗口创建，macOS 原生标题栏
- 设置面板：API endpoint、key、模型名输入与保存
- 模型列表自动获取（`/v1/models`）与可搜索选择器

**阶段二：核心对话**
- IndexedDB 数据层（Dexie）
- 对话列表 CRUD
- 消息发送与流式接收
- 虚拟滚动消息列表
- 滑动窗口上下文（发送时只携带最近 N 条 + 锚点消息）
- 发送前 token 预估与费用显示

**阶段三：档案系统**
- 目录绑定与 archive.md 检测
- 档案注入到对话上下文（自动添加 cache_control 标记）
- 更新档案预览交互
- 流式写入 archive.md

**阶段四：图片与导出**
- 图片上传与 base64 编码
- 文学版 / 开发版导出
- 流式写文件

**阶段五：增强功能**
- 对话内关键词搜索
- 对话模板保存与套用
- 输入框 `@` 引用档案条目
- 拖入文件自动读取内容
- archive.md 分类折叠视图
- 手动上下文选择（发送前勾选携带哪些消息）
- 累计费用统计面板
- 回复风格控制（简洁 / 标准 / 详尽）

**阶段六：打磨**
- 消息锚点标记
- 对话分支
- 缓存命中状态显示（Anthropic 原生 API）
- 设计细节对齐（间距、色彩、动效）

---

## 注意事项

- 不实现任何云同步、用户账号、遥测上报功能
- 不内置联网搜索
- 不做插件系统
- API Key 必须使用 `safeStorage` 加密，不得明文写入任何配置文件
- 每次 API 请求只传当前对话消息，严格禁止跨对话传递内容
- 所有文件操作在主进程完成，通过 IPC 与渲染进程通信
- 打包目标平台：macOS（arm64 + x64 universal）
