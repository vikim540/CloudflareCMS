import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

/**
 * 修復 Vite/Rollup 在 Windows 上生成 0 字節 chunk 的問題
 * 這些空文件會導致 wrangler pages deploy 失敗
 */
function fixEmptyChunksPlugin(): Plugin {
  return {
    name: 'fix-empty-chunks',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'deploy')
      if (!fs.existsSync(outDir)) return
      const assetsDir = path.join(outDir, 'assets')
      if (!fs.existsSync(assetsDir)) return
      for (const file of fs.readdirSync(assetsDir)) {
        if (file.endsWith('.js')) {
          const filePath = path.join(assetsDir, file)
          const stat = fs.statSync(filePath)
          if (stat.size === 0) {
            // 寫入最小的有效 JS 內容
            fs.writeFileSync(filePath, '/* empty chunk */\n', 'utf-8')
            console.log(`[fix-empty-chunks] Filled 0-byte file: ${file}`)
          }
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), fixEmptyChunksPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'deploy',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
