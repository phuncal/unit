#!/bin/bash
# 构建带 ad-hoc 签名的 macOS 应用（无需 Apple Developer 账号）

set -e

echo "🔨 Building Unit..."
cd "$(dirname "$0")/.."

# 设置环境变量禁用自动签名
export CSC_IDENTITY_AUTO_DISCOVERY=false

# 构建
npm run build:mac

# 对 .app 进行 ad-hoc 签名
echo "🔏 Applying ad-hoc signature..."
APP_PATH="release/mac-universal/Unit.app"
codesign --force --deep --sign - "$APP_PATH"

# 验证签名
echo "✅ Verifying signature..."
codesign -dv "$APP_PATH"

# 修改 app-update.yml 禁用签名验证
echo "🔧 Disabling signature validation in app-update.yml..."
UPDATE_YML="$APP_PATH/Contents/Resources/app-update.yml"
if [ -f "$UPDATE_YML" ]; then
  # 备份原文件
  cp "$UPDATE_YML" "$UPDATE_YML.bak"
  # 添加禁用签名验证配置
  cat >> "$UPDATE_YML" << 'YAML_EOF'

# 禁用签名验证（适用于未签名的个人项目）
disableSignatureValidation: true
YAML_EOF
  echo "✅ Added disableSignatureValidation to app-update.yml"
fi

# 删除旧的打包文件（未签名版本）
echo "🗑️  Removing unsigned packages..."
rm -f release/Unit-*.dmg release/Unit-*.zip release/*.blockmap release/latest-mac.yml

# 获取版本号
VERSION=$(node -p "require('./package.json').version")

# 创建 DMG
echo "📦 Creating DMG..."
mkdir -p release/dmg_temp
cp -R "$APP_PATH" release/dmg_temp/
ln -sf /Applications release/dmg_temp/Applications
hdiutil create -volname "Unit" -srcfolder release/dmg_temp -ov -format UDZO "release/Unit-${VERSION}-universal.dmg"
rm -rf release/dmg_temp

# 创建 ZIP
echo "📦 Creating ZIP..."
cd release/mac-universal
ditto -c -k --sequesterRsrc --keepParent Unit.app "../Unit-${VERSION}-universal-mac.zip"
cd ../..

# 生成 latest-mac.yml
echo "📝 Generating latest-mac.yml..."
ZIP_SHA=$(shasum -a 512 "release/Unit-${VERSION}-universal-mac.zip" | cut -d' ' -f1)
DMG_SHA=$(shasum -a 512 "release/Unit-${VERSION}-universal.dmg" | cut -d' ' -f1)
ZIP_SIZE=$(stat -f%z "release/Unit-${VERSION}-universal-mac.zip")
DMG_SIZE=$(stat -f%z "release/Unit-${VERSION}-universal.dmg")
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

cat > release/latest-mac.yml << EOF
version: ${VERSION}
files:
  - url: Unit-${VERSION}-universal-mac.zip
    sha512: ${ZIP_SHA}
    size: ${ZIP_SIZE}
  - url: Unit-${VERSION}-universal.dmg
    sha512: ${DMG_SHA}
    size: ${DMG_SIZE}
path: Unit-${VERSION}-universal-mac.zip
sha512: ${ZIP_SHA}
releaseDate: '${RELEASE_DATE}'
EOF

echo ""
echo "✅ Build complete!"
echo ""
echo "Files ready for release:"
ls -lh release/Unit-${VERSION}-* release/latest-mac.yml
