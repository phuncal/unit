#!/bin/bash

echo "======================================"
echo "Unit 构建测试脚本"
echo "======================================"
echo ""

echo "✓ 检查依赖..."
if ! command -v npm &> /dev/null; then
    echo "❌ 错误：未安装 npm"
    exit 1
fi

echo "✓ 检查 package.json 配置..."
if ! grep -q '"version": "1.0.0"' package.json; then
    echo "⚠️  警告：版本号不是 1.0.0"
fi

if ! grep -q '"provider": "github"' package.json; then
    echo "❌ 错误：未配置 GitHub 更新源"
    exit 1
fi

if ! grep -q '"owner": "phuncal"' package.json; then
    echo "❌ 错误：GitHub owner 配置错误"
    exit 1
fi

if ! grep -q '"arch": "universal"' package.json; then
    echo "❌ 错误：未配置 Universal 架构"
    exit 1
fi

echo "✓ 配置检查通过！"
echo ""

echo "开始构建 macOS Universal 版本..."
echo "预计耗时：2-3 分钟"
echo ""

npm run build:mac

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "✅ 构建成功！"
    echo "======================================"
    echo ""
    echo "生成的文件："
    ls -lh release/*.dmg release/*.zip release/*.yml 2>/dev/null
    echo ""
    echo "下一步："
    echo "1. 在 GitHub 创建新的 Release"
    echo "2. Tag 使用 v1.0.0"
    echo "3. 上传 release/ 目录中的所有文件"
else
    echo ""
    echo "❌ 构建失败，请检查错误信息"
    exit 1
fi
