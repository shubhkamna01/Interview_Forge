import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      // Forwards /api/* to the backend, so the browser sees one origin and CORS never gets in the way.
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
