import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@smorg/ui/styles.css',
        replacement: path.resolve(__dirname, '../ui/src/styles.css'),
      },
      {
        find: '@smorg/ui',
        replacement: path.resolve(__dirname, '../ui/src/index.ts'),
      },
      {
        find: '@smorg/core/client',
        replacement: path.resolve(__dirname, '../../apps/core/client/index.ts'),
      },
      {
        find: '@smorg/itinerarium/client',
        replacement: path.resolve(__dirname, '../../apps/itinerarium/client/index.ts'),
      },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
})
