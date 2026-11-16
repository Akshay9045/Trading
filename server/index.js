// ── Production server (Railway) ────────────────────────────────────────────
// Serves every /api/* route (server/api.js). If a built frontend exists in dist/
// it serves that too, so the app can also run from this one service; with
// Netlify hosting the frontend, Netlify forwards /api/* here instead.
// Run: node server/index.js   (no npm dependencies — Node built-ins only)
import http from 'http'
import fs from 'fs'
import path from 'path'
import { configureApi, startApi, apiHandler } from './api.js'
import { DATA_DIR } from './paths.js'

const env = process.env
const PORT = Number(env.PORT) || 8080
const DIST = path.resolve(process.cwd(), 'dist')

// Orders and account data sit behind this server — never run it open in production.
if (env.NODE_ENV === 'production' && !env.APP_PASSWORD) {
  console.error('APP_PASSWORD is not set. Refusing to start: the trading API would be open to anyone.')
  process.exit(1)
}

configureApi(env)
startApi()

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
}

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) { res.statusCode = 404; res.end('Not found'); return }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  let file = path.join(DIST, urlPath)
  if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.statusCode = 400; res.end(); return }   // no ../ escapes
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')   // SPA fallback
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  // Hashed build assets never change; index.html must always be re-checked
  res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  apiHandler(req, res, () => serveStatic(req, res))
})

server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT} · data in ${DATA_DIR} · login ${env.APP_PASSWORD ? 'on' : 'OFF'}`)
})

// Railway sends SIGTERM on redeploy — finish in-flight requests, then exit
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10_000).unref()   // don't hang on keep-alive connections
})
