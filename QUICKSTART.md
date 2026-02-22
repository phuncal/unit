# Unit 快速开始指南

## ✅ 当前状态

- ✅ 代码已推送到 GitHub: https://github.com/phuncal/unit
- ✅ 自动更新功能已配置完成
- ✅ 构建配置已优化（Universal 版本）

---

## 🚀 立即体验

### 方法 1: 使用已打包版本（推荐）

1. 进入 `release/` 目录
2. 找到以下文件之一安装：
   - `Unit-1.0.0-arm64.dmg` (Apple Silicon Mac)
   - `Unit-1.0.0.dmg` (Intel Mac)
   - 或等待 Universal 版本构建完成

3. 双击 DMG 文件
4. 将 Unit.app 拖到应用程序文件夹
5. 打开应用（首次可能需要右键→打开）

### 方法 2: 重新构建最新版本

```bash
# 构建 Universal 版本（同时支持 Intel 和 Apple Silicon）
npm run build:mac

# 完成后在 release/ 目录会生成：
# - Unit-1.0.0-universal.dmg
# - Unit-1.0.0-mac.zip
# - latest-mac.yml
```

---

## 📦 发布第一个版本到 GitHub

### 步骤 1: 构建应用

```bash
npm run build:mac
```

### 步骤 2: 创建 GitHub Release

1. 打开 https://github.com/phuncal/unit/releases
2. 点击 **"Draft a new release"**
3. 填写信息：
   ```
   Tag: v1.0.0
   Release title: Unit v1.0.0 - 初始版本
   Description: 
   ## 功能特性
   - AI 聊天对话，支持 OpenAI 格式 API
   - 滑动窗口上下文管理，节省 token
   - 消息锚点标记和对话分支
   - 档案系统 (archive.md) 集成
   - 对话模板管理
   - 虚拟滚动优化性能
   - 自动更新功能
   ```

4. 上传文件（拖拽到页面底部）：
   - `Unit-1.0.0-universal.dmg`（或先前构建的版本）
   - `Unit-1.0.0-mac.zip`
   - `latest-mac.yml`

5. 点击 **"Publish release"**

### 步骤 3: 验证自动更新

发布后，再次构建一个新版本测试自动更新：

1. 修改 `package.json` 版本号为 `1.0.1`
2. 构建: `npm run build:mac`
3. 创建新的 GitHub Release (v1.0.1)
4. 打开安装的 v1.0.0 版本
5. 应该会在顶部看到更新提示

---

## 🎯 首次使用配置

1. **启动应用**
2. **打开设置（右上角齿轮图标）**
3. **配置 API**:
   - API Endpoint: `https://api.openai.com/v1` 或其他兼容接口
   - API Key: 你的 API 密钥
   - 模型名称: `gpt-4o` 或点击"获取模型"自动拉取

4. **保存设置**
5. **创建新对话**（左侧边栏 + 按钮）
6. **开始聊天！**

---

## 🔧 开发模式

### 运行开发版本

```bash
npm run dev:electron
```

会同时启动：
- Vite 开发服务器 (前端热重载)
- Electron 应用

### 注意事项

- 开发模式不会检查自动更新
- API Key 使用系统钥匙串加密存储
- 数据存储在 IndexedDB，开发和生产环境独立

---

## 📁 项目结构

```
unit/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 入口，窗口创建
│   │   └── ipc/              # IPC 处理器
│   │       ├── updater.ts    # 自动更新逻辑
│   │       ├── file.ts       # 文件操作
│   │       ├── archive.ts    # 档案操作
│   │       └── api.ts        # API 请求（绕过 CORS）
│   └── renderer/             # React 前端
│       ├── components/
│       │   ├── UpdateBanner.tsx  # 更新提示条
│       │   ├── Chat/         # 聊天界面
│       │   ├── Sidebar/      # 侧边栏
│       │   ├── Settings/     # 设置面板
│       │   └── Archive/      # 档案面板
│       ├── store/            # Zustand 状态管理
│       ├── db/               # Dexie (IndexedDB)
│       └── api/              # API 客户端
├── resources/                # 应用图标
├── release/                  # 构建输出
├── RELEASE.md               # 发布流程指南
├── UPDATE_GUIDE.md          # 用户使用指南
└── QUICKSTART.md            # 本文件

```

---

## 🐛 故障排除

### 构建失败

```bash
# 1. 清理依赖重新安装
rm -rf node_modules package-lock.json
npm install

# 2. 清理构建产物
rm -rf dist dist-electron release

# 3. 重新构建
npm run build:mac
```

### 应用无法启动

- **首次打开被拦截**: 右键点击应用 → 打开 → 仍要打开
- **权限问题**: 系统偏好设置 → 隐私与安全性 → 允许

### 检测不到更新

确认：
1. 应用是打包后的版本（不是 `npm run dev:electron`）
2. GitHub Release 已正确发布（Tag 以 v 开头）
3. 上传了 `latest-mac.yml` 文件
4. 网络可以访问 GitHub

---

## 📚 相关文档

- [RELEASE.md](./RELEASE.md) - 开发者发布流程
- [UPDATE_GUIDE.md](./UPDATE_GUIDE.md) - 用户使用指南
- [CLAUDE.md](./CLAUDE.md) - 项目设计文档

---

## 🎉 下一步

现在你可以：

1. ✅ **使用应用**: 安装打包版本，开始使用
2. ✅ **发布到 GitHub**: 创建第一个 Release
3. ✅ **测试更新**: 发布新版本后测试自动更新
4. ✅ **继续开发**: 添加新功能，优化体验

有问题随时查看文档或提 Issue！
