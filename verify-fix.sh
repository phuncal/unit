#!/bin/bash

echo "======================================"
echo "Unit 修复验证脚本"
echo "======================================"
echo ""

echo "✓ 检查修复内容..."
if grep -q "import { autoUpdater } from 'electron-updater'" src/main/index.ts; then
    echo "✓ electron-updater 已正确导入"
else
    echo "❌ 错误：electron-updater 导入缺失"
    exit 1
fi

if grep -q "const { autoUpdater } = require" src/main/index.ts; then
    echo "❌ 错误：仍然存在 require 调用"
    exit 1
else
    echo "✓ 已移除动态 require 调用"
fi

echo ""
echo "✓ 检查构建产物..."
if [ -f "release/Unit-1.0.0-universal.dmg" ]; then
    SIZE=$(du -sh release/Unit-1.0.0-universal.dmg | awk '{print $1}')
    echo "✓ Universal DMG 存在 ($SIZE)"
else
    echo "❌ 错误：Universal DMG 不存在"
    exit 1
fi

if [ -f "release/Unit-1.0.0-universal-mac.zip" ]; then
    SIZE=$(du -sh release/Unit-1.0.0-universal-mac.zip | awk '{print $1}')
    echo "✓ Universal ZIP 存在 ($SIZE)"
else
    echo "❌ 错误：Universal ZIP 不存在"
    exit 1
fi

if [ -f "release/latest-mac.yml" ]; then
    echo "✓ 更新配置文件存在"
else
    echo "❌ 错误：latest-mac.yml 不存在"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ 所有检查通过！"
echo "======================================"
echo ""
echo "下一步："
echo "1. 安装 release/Unit-1.0.0-universal.dmg"
echo "2. 启动应用验证是否正常运行"
echo "3. 如果成功，前往 GitHub 创建 Release"
echo ""
echo "GitHub Release 地址："
echo "https://github.com/phuncal/unit/releases/new"
