import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// UI tests: they render the real app in a simulated browser and talk to a REAL backend.
// Start it first:  cd ../backend && rm -rf .data && PORT=8124 npm run dev
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
    testTimeout: 60000,
    env: { VITE_API_URL: 'http://localhost:8124/api' },
  },
})
