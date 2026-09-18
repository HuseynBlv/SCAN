import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const apiTarget = process.env.SCAN_DEV_API_TARGET || 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  server: {
    allowedHosts: ['tiresome-hypereutectoid-bonny.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts: ['tiresome-hypereutectoid-bonny.ngrok-free.dev'],
  },
})
