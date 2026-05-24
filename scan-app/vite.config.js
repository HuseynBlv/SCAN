import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['tiresome-hypereutectoid-bonny.ngrok-free.dev'],
  },
  preview: {
    allowedHosts: ['tiresome-hypereutectoid-bonny.ngrok-free.dev'],
  },
})
