// ── Login for the deployed app ─────────────────────────────────────────────
// One password (APP_PASSWORD) unlocks everything; a signed, HttpOnly cookie keeps
// you logged in for 30 days. With no APP_PASSWORD (local dev) auth is off and the
// trading routes fall back to their localhost-only check.
import crypto from 'crypto'

const COOKIE = 'nt_session'
const SESSION_DAYS = 30
const MAX_FAILS = 5
const LOCKOUT_MS = 15 * 60_000

const cfg = { password: '', secret: null, secure: false }
const fails = new Map()   // ip → { count, until }
// X-Forwarded-For can be faked to dodge the per-IP count, so also cap wrong
// passwords across all clients.
const GLOBAL_MAX_FAILS = 20
let globalFails = []      // timestamps of recent wrong passwords

const sha = (s) => crypto.createHash('sha256').update(s).digest()

export function configureAuth(env) {
  cfg.password = env.APP_PASSWORD || ''
  // SESSION_SECRET is optional; without it the key comes from the password, so
  // changing the password logs every device out.
  cfg.secret = sha(`${env.SESSION_SECRET || cfg.password}|nifty-terminal-session`)
  cfg.secure = env.NODE_ENV === 'production'
}

export const authEnabled = () => !!cfg.password

const sign = (payload) => crypto.createHmac('sha256', cfg.secret).update(payload).digest('base64url')

function makeToken() {
  const exp = String(Date.now() + SESSION_DAYS * 86400_000)
  return `${exp}.${sign(exp)}`
}

function validToken(token) {
  const [exp, mac] = String(token || '').split('.')
  if (!exp || !mac || Number(exp) < Date.now()) return false
  const want = Buffer.from(sign(exp)), got = Buffer.from(mac)
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return null
}

export const isAuthed = (req) => !authEnabled() || validToken(readCookie(req))

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()

function setCookie(res, value, maxAgeSec) {
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`,
    ...(cfg.secure ? ['Secure'] : []),
  ].join('; '))
}

class AuthError extends Error { constructor(msg, status) { super(msg); this.status = status } }

export const authRoutes = {
  'GET /api/auth/me': async (_url, _body, req) => ({ authRequired: authEnabled(), authenticated: isAuthed(req) }),

  'POST /api/auth/login': async (_url, body, req, res) => {
    if (!authEnabled()) return { authRequired: false, authenticated: true }
    const ip = clientIp(req)
    const f = fails.get(ip)
    if (f && f.until > Date.now()) throw new AuthError(`Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 60_000)} min.`, 429)
    globalFails = globalFails.filter(t => t > Date.now() - LOCKOUT_MS)
    if (globalFails.length >= GLOBAL_MAX_FAILS) throw new AuthError('Too many failed logins. Try again in 15 min.', 429)

    const ok = crypto.timingSafeEqual(sha(String(body?.password || '')), sha(cfg.password))
    if (!ok) {
      const expired = f?.until && f.until <= Date.now()   // a finished lockout starts a fresh count
      const count = (expired ? 0 : f?.count || 0) + 1
      fails.set(ip, { count, until: count >= MAX_FAILS ? Date.now() + LOCKOUT_MS : 0 })
      globalFails.push(Date.now())
      throw new AuthError('Wrong password', 401)
    }
    fails.delete(ip)
    setCookie(res, makeToken(), SESSION_DAYS * 86400)
    return { authRequired: true, authenticated: true }
  },

  'POST /api/auth/logout': async (_url, _body, _req, res) => {
    setCookie(res, '', 0)
    return { authenticated: false }
  },
}
