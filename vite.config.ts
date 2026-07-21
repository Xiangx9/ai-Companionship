import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { aiProxyPlugin } from './scripts/vite-ai-proxy.mjs'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'vite-md-raw',
      enforce: 'pre',
      transform(src, id) {
        if (id.endsWith('.md')) {
          return `export default ${JSON.stringify(src)};`
        }
      },
    },
    aiProxyPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
})