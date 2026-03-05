import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// 复制 CJS preload 的插件
function copyPreloadPlugin() {
  return {
    name: 'copy-preload',
    closeBundle() {
      // 在 bundle 关闭后复制
      const src = path.resolve(__dirname, 'src/main/preload.cjs')
      const dest = path.resolve(__dirname, 'dist-electron/preload.js')
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
        console.log('✓ Preload CJS copied')
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(args) {
          // 启动前复制 preload
          const src = path.resolve(__dirname, 'src/main/preload.cjs')
          const dest = path.resolve(__dirname, 'dist-electron/preload.js')
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest)
          }
          args.reload()
        },
      },
    ]),
    renderer(),
    copyPreloadPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
})
