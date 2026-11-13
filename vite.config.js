import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { configureApi, startApi, apiHandler } from './server/api.js'

// All /api/* routes live in server/ and are shared with the production server
// (server/index.js). In dev, Vite mounts the same handler as middleware.
const apiPlugin = {
  name: 'nifty-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => { apiHandler(req, res, next) })
    startApi()
  },
}

export default defineConfig(({ mode }) => {
  // Load .env (all vars, no prefix filter) so server-side creds are available in dev
  const env = loadEnv(mode, process.cwd(), '')
  configureApi(env)

  return {
  plugins: [react(), apiPlugin],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['lightweight-charts'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },

  server: {
    port: 5174,
  },
  }
})
