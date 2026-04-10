import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: 'globalThis',
  },
  server: {
    // Force polling-based file watching on Windows.
    // Without this, Vite misses file changes made by external editors/tools.
    watch: {
      usePolling: true,
      interval: 300,   // ms — check every 300ms; lower = faster HMR, higher CPU
    },
  },
})
