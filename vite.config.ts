/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { jsonX } from 'vite-plugin-jsonx'

const SQLITE_RUNTIME_FILES = new Set([
  'sqlite3-worker1',
  'sqlite3-opfs-async-proxy',
])

function getSqliteAwareOutputConfig() {
  return {
    entryFileNames: (chunkInfo: { name: string }) =>
      SQLITE_RUNTIME_FILES.has(chunkInfo.name)
        ? 'assets/[name].js'
        : 'assets/[name]-[hash].js',
    chunkFileNames: (chunkInfo: { name: string }) =>
      SQLITE_RUNTIME_FILES.has(chunkInfo.name)
        ? 'assets/[name].js'
        : 'assets/[name]-[hash].js',
    assetFileNames: (assetInfo: { name?: string; originalFileNames?: string[] }) => {
      const originalFileNames = assetInfo.originalFileNames ?? []
      const isSqliteWasm =
        assetInfo.name === 'sqlite3.wasm' ||
        originalFileNames.some((fileName) => fileName.endsWith('/sqlite3.wasm') || fileName === 'sqlite3.wasm')

      return isSqliteWasm
        ? 'assets/[name][extname]'
        : 'assets/[name]-[hash][extname]'
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    jsonX()
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    rollupOptions: {
      output: getSqliteAwareOutputConfig(),
    },
  },
  worker: {
    rollupOptions: {
      output: getSqliteAwareOutputConfig(),
    },
  },
  test: {
    environment: 'jsdom',
  }
})
