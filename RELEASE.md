# Unit 发布流程指南

## 首次设置

### 1. 关联 GitHub 仓库

```bash
git remote add origin https://github.com/phuncal/unit.git
git branch -M main
git push -u origin main
```

### 2. 在 GitHub 创建私有仓库

- 打开 https://github.com/new
- 仓库名称: `unit`
- 选择 **Private**
- 不要勾选任何初始化选项
- 创建后推送代码（使用上面的命令）

---

## 日常开发流程

### 修改代码后备份

```bash
git add .
git commit -m "描述这次改了什么"
git push
```

---

## 发布新版本完整流程

### 步骤 1: 修改版本号

编辑 `package.json`，将 `version` 字段更新：

```json
{
  "version": "1.0.1"  // 从 1.0.0 改为 1.0.1
}
```

版本号规则：
- **1.x.x**: 主版本，重大功能变更
- **x.1.x**: 次版本，新增功能
- **x.x.1**: 修订版本，bug 修复

### 步骤 2: 提交代码

```bash
git add .
git commit -m "版本 v1.0.1: 修复xxx问题，新增xxx功能"
git push
```

### 步骤 3: 构建 macOS 安装包

```bash
npm run build:mac
```

等待构建完成（约 2-3 分钟），会在 `release/` 目录生成：
- `Unit-1.0.1-universal.dmg` - Universal 安装包（支持 Intel 和 Apple Silicon）
- `Unit-1.0.1-mac.zip` - ZIP 压缩包
- `latest-mac.yml` - 自动更新配置文件

### 步骤 4: 在 GitHub 发布 Release

1. 打开 https://github.com/phuncal/unit/releases
2. 点击 **Draft a new release**
3. 填写信息：
   - **Tag**: `v1.0.1`（必须以 v 开头）
   - **Release title**: `v1.0.1`
   - **Description**: 写更新日志，例如：
     ```
     ## 新功能
     - 添加了 xxx 功能
     
     ## Bug 修复
     - 修复了 xxx 问题
     
     ## 改进
     - 优化了 xxx 性能
     ```
4. 上传文件（拖拽到页面底部）：
   - `Unit-1.0.1-universal.dmg`
   - `Unit-1.0.1-mac.zip`
   - `latest-mac.yml`
5. 点击 **Publish release**

### 步骤 5: 验证自动更新

- 打开已安装的旧版本 Unit
- 等待 5 秒（自动检查更新）
- 或手动进入 **设置 → 检查更新**
- 应该会显示新版本提示，点击下载安装

---

## 常见问题

### Q: 构建失败怎么办？

确保：
1. 已安装所有依赖: `npm install`
2. TypeScript 无错误: `npm run lint`
3. 查看错误日志，修复后重新构建

### Q: Release 发布后，应用检测不到更新？

检查：
1. `package.json` 中的版本号是否已更新
2. GitHub Release 的 Tag 是否以 `v` 开头（如 `v1.0.1`）
3. `latest-mac.yml` 文件是否正确上传
4. 应用是否是生产环境（开发环境不会检查更新）

### Q: 如何回退版本？

1. 在 GitHub Releases 中找到旧版本
2. 下载对应的 `.dmg` 文件重新安装

### Q: 如何查看应用版本号？

打开 Unit → 设置 → 底部会显示当前版本号

---

## 构建命令说明

- `npm run build`: 构建所有平台（x64 + arm64 分别打包）
- `npm run build:mac`: 仅构建 macOS Universal 安装包（同时支持 Intel 和 Apple Silicon）
- `npm run dev:electron`: 开发模式运行

---

## 自动更新配置

配置文件位置: `package.json` 的 `build.publish` 字段

```json
{
  "publish": {
    "provider": "github",
    "owner": "phuncal",
    "repo": "unit",
    "releaseType": "release"
  }
}
```

- `provider`: 使用 GitHub Releases
- `owner`: GitHub 用户名
- `repo`: 仓库名称
- `releaseType`: 只检测正式 Release（不包括 Pre-release）

---

## 版本历史

### v1.0.0 (2025-02-23)
- 初始版本发布
- 核心功能：AI 聊天、档案系统、自动更新
