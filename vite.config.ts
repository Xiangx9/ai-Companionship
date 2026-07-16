import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

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
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },

})
