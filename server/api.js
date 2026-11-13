// ── All /api/* routes in one handler ───────────────────────────────────────
// Used two ways: as Vite dev-server middleware (vite.config.js) and by the
// production server (server/index.js). Same code, same behaviour.
import { configureGroww } from './groww.js'
import { configureTrading, tradingMiddleware, startTrading } from './trading.js'
import { marketRoutes, yahooProxy, startMarket } from './market.js'
import { configureAI, aiRoutes } from './ai.js'
import { configureAuth, authRoutes, isAuthed } from './auth.js'

function readJson(req, limit = 50_000) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => {
      data += c
      if (data.length > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy() }
    })
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })) } })
    req.on('error', reject)
  })
}

const send = (res, status, obj) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

// `env`: process.env in production, Vite's loadEnv() result in dev.
export function configureApi(env) {
  configureGroww({ apiKey: env.GROWW_API_KEY, secret: env.GROWW_API_SECRET, totpToken: env.GROWW_TOTP_TOKEN, totpSecret: env.GROWW_TOTP_SECRET })
  configureTrading(env)
  configureAI(env)
  configureAuth(env)
}

// Background work: NSE/Yahoo sessions, order watcher, instrument download.
export function startApi() {
  startMarket()
  startTrading()
}

// Connect-style handler: (req, res, next). Non-/api requests go to `next`.
export async function apiHandler(req, res, next) {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname
  if (!p.startsWith('/api/')) return next ? next() : send(res, 404, { error: 'Not found' })

  try {
    if (p === '/api/health') return send(res, 200, { ok: true })

    const key = `${req.method} ${p}`
    if (authRoutes[key]) {
      const body = req.method === 'POST' ? await readJson(req) : {}
      return send(res, 200, await authRoutes[key](url, body, req, res))
    }

    // Everything below needs a login when APP_PASSWORD is set
    if (!isAuthed(req)) return send(res, 401, { error: 'Login required' })

    if (p === '/api/trade' || p.startsWith('/api/trade/')) {
      req.url = req.url.slice('/api/trade'.length) || '/'   // trading routes are mount-relative
      return tradingMiddleware(req, res)
    }
    if (p.startsWith('/api/yahoo/')) return await yahooProxy(req, res, url)

    if (aiRoutes[key]) {
      const body = req.method === 'POST' ? await readJson(req) : {}
      return send(res, 200, await aiRoutes[key](url, body))
    }

    const route = req.method === 'GET' && marketRoutes[p]
    if (route) {
      try { return send(res, 200, await route.fn(url)) }
      catch (e) { return send(res, route.status || 502, { error: e.message }) }
    }

    return send(res, 404, { error: 'Not found' })
  } catch (e) {
    return send(res, e.status || 500, { error: e.message, ...(e.providerStatus ? { providerStatus: e.providerStatus } : {}) })
  }
}
