# 测试修复后的功能

## 问题诊断结果

经过深入代码分析，发现了"配置完 API 后聊天没反应"的根本原因：

### 🔴 核心问题：API Key 加密/解密流程错误

1. **旧逻辑的问题**：
   - 用户输入明文 API Key → 加密后存入 Zustand state → persist 持久化到 localStorage
   - 加载时尝试通过字符串特征判断是否为明文（不可靠）
   - **结果**：可能发送了加密后的字符串给 API，导致认证失败

2. **新逻辑（已修复）**：
   - 用户输入明文 API Key → 存入 Zustand state（内存中保持明文）→ persist 时通过自定义 storage 加密后存 localStorage
   - 加载时 → 从 localStorage 读取加密的 Key → 自动解密 → 放入 Zustand state（内存中保持明文）
   - **结果**：内存中始终是明文，发送请求时使用明文，存储时才加密

## 已修复的文件

### 1. `src/renderer/store/settings.ts`
- ✅ 使用自定义 storage（`createEncryptedStorage`）处理加密/解密
- ✅ `getItem` 时自动解密 API Key
- ✅ `setItem` 时自动加密 API Key
- ✅ 内存中的 `settings.apiKey` 始终是明文
- ✅ 添加了详细的日志输出

### 2. `src/renderer/components/Settings/SettingsPanel.tsx`
- ✅ 移除了不必要的 `loadSettings()` 调用
- ✅ 直接使用 store 中的 settings（已经是解密后的明文）

### 3. `src/renderer/App.tsx`
- ✅ 移除了启动时的 `loadSettings()` 调用（现在由 persist 中间件自动处理）

### 4. `src/renderer/api/client.ts`
- ✅ 添加了详细的请求日志（endpoint, model, API key 前缀等）
- ✅ 添加了响应状态日志
- ✅ 添加了错误日志

### 5. `src/renderer/hooks/useChat.ts`
- ✅ 添加了用户可见的错误提示（alert）
- ✅ 提供了排查建议

### 6. `src/main/ipc/api.ts`
- ✅ 添加了主进程的请求/响应日志
- ✅ 记录 API Key 前缀（用于验证是否传递正确）

## 测试步骤

### 清除旧数据（重要！）

由于旧版本可能存储了错误格式的数据，建议清除后重新配置：

1. 打开应用的开发者工具（通常是 Cmd+Option+I）
2. 进入 **Application** 标签
3. 展开 **Local Storage** → 选择你的应用域名
4. 找到 `unit-settings` 键，右键删除
5. 刷新页面（Cmd+R）

### 配置测试

1. **打开设置面板**
   - 点击设置按钮
   - 查看控制台，应该看到 `[Settings]` 相关日志

2. **填写配置**：
   ```
   API Endpoint: https://api.openai.com/v1  (或你的第三方 API)
   API Key: sk-xxx...  (你的真实 API Key)
   ```

3. **获取模型列表**：
   - 点击"获取模型"按钮
   - 查看控制台是否有错误
   - 成功后应该显示模型列表

4. **选择模型**：
   - 从下拉列表中选择一个模型（如 `gpt-4o`）
   - 或手动输入模型名称

5. **保存设置**：
   - 点击"保存"按钮
   - 查看控制台，应该看到：
     ```
     [Settings] Updating settings: ...
     [Settings] Encrypting API Key for storage...
     [Settings] API Key encrypted successfully
     ```

6. **刷新页面测试持久化**：
   - 刷新页面（Cmd+R）
   - 打开开发者工具查看控制台
   - 应该看到：
     ```
     [Settings] Decrypting API Key from storage...
     [Settings] API Key decrypted successfully
     ```

### 聊天测试

1. **创建新对话**：
   - 点击"新建对话"按钮
   - 输入对话名称

2. **发送消息**：
   - 在输入框中输入一条测试消息，如："你好"
   - 点击发送按钮
   - **观察控制台日志**：
     ```
     [API] sendChatMessage called with: {
       endpoint: "https://...",
       modelName: "gpt-4o",
       hasApiKey: true,
       apiKeyPrefix: "sk-xxx...",  ← 确认这里是 sk- 开头
       ...
     }
     [Main] API Stream Request: { requestId, url, ... }
     [Main] API Stream Response: { status: 200, ... }
     [API] Stream completed successfully
     ```

3. **检查错误处理**：
   - 如果出现错误，应该：
     - 在控制台看到详细的错误日志
     - 弹出用户友好的错误提示对话框
     - 提示检查配置项

### 预期结果

✅ **成功的标志**：
- 控制台显示 API Key 被正确加密/解密
- 发送请求时 API Key 前缀是正确的（如 `sk-`）
- 收到 API 的正常响应（status 200）
- AI 的回复实时显示在聊天界面

❌ **失败的可能原因**：
1. **API Key 无效**：检查是否复制完整、是否过期
2. **Endpoint 错误**：确认 URL 是否正确，是否包含 `/v1`
3. **模型名称错误**：确认所选模型是否存在、是否有权限访问
4. **网络问题**：检查代理设置、防火墙

## 关键日志位置

**渲染进程控制台**（开发者工具 Console 标签）：
- `[Settings]`：设置加载/保存/加密/解密
- `[API]`：API 请求发送、响应处理

**主进程控制台**（终端/命令行）：
- `[Main]`：IPC 处理、HTTP 请求

## 后续优化建议

1. ~~将 `alert()` 替换为更友好的 Toast 通知~~（当前先用 alert 快速验证）
2. 添加连接测试按钮（在设置面板中）
3. 提供更详细的错误分类和解决方案
4. 记录 API 请求历史用于调试

## 报告问题

如果测试后仍有问题，请提供：
1. 完整的控制台日志（渲染进程 + 主进程）
2. 使用的 API Endpoint 和模型名称（隐藏 API Key）
3. 错误提示的截图
4. localStorage 中 `unit-settings` 的内容（隐藏 apiKey 字段）
