import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/detect': 'http://localhost:8000',
      '/detections': 'http://localhost:8000',
      '/dashboard': 'http://localhost:8000',
      '/analytics': 'http://localhost:8000',
      '/model': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    }
  }
})
