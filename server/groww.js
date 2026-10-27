// ── Groww Trading API client (server-side only) ────────────────────────────
// Auth: exchange API key + secret for a short-lived access token (approval flow,
// checksum = SHA256(secret + epochSeconds)). Token is cached until ~1 min before expiry.
// Docs: https://groww.in/trade-api/docs/curl
import https from 'https'
import zlib from 'zlib'
import crypto from 'crypto'

export const GROWW = { apiKey: '', secret: '', token: null, exp: 0, cooldownUntil: 0, tokenPromise: null, lastAuthError: null }

export const configureGroww = ({ apiKey, secret }) => {
  GROWW.apiKey = apiKey || ''
  GROWW.secret = secret || ''
}

// ── Generic HTTPS request (GET/POST) with gzip + body support ──────────────
export function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...options, headers: { 'Accept-Encoding': 'gzip, deflate', ...options.headers } }, res => {
      const encoding = res.headers['content-encoding']
      let stream = res
      if (encoding === 'gzip')    stream = res.pipe(zlib.createGunzip())
      if (encoding === 'deflate') stream = res.pipe(zlib.createInflate())
      let data = ''
      stream.on('data', c => (data += c))
      stream.on('end', () => resolve({ data, status: res.statusCode }))
      stream.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

function decodeJwtExpMs(token) {
  try {
    const seg = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(Buffer.from(seg, 'base64').toString())
    return (payload.exp || 0) * 1000
  } catch { return 0 }
}

export async function growwAccessToken() {
  const now = Date.now()
  if (GROWW.token && now < GROWW.exp - 60_000) return GROWW.token
  if (!GROWW.apiKey || !GROWW.secret) throw new Error('Groww credentials missing (GROWW_API_KEY / GROWW_API_SECRET)')

  // Cooldown: after a 429 we stop hitting the (heavily rate-limited) token API for
  // a while, so one failure doesn't cascade into a retry storm across every request.
  if (GROWW.cooldownUntil && now < GROWW.cooldownUntil) {
    const secs = Math.ceil((GROWW.cooldownUntil - now) / 1000)
    throw new Error(`Groww auth in cooldown (${secs}s left after rate limit)`)
  }

  // Single-flight: if a token fetch is already in progress, every caller awaits the
  // SAME request instead of each firing its own (which is what tripped the 429).
  if (GROWW.tokenPromise) return GROWW.tokenPromise

  GROWW.tokenPromise = (async () => {
    const ts = Math.floor(now / 1000).toString()
    const checksum = crypto.createHash('sha256').update(GROWW.secret + ts).digest('hex')
    const body = JSON.stringify({ key_type: 'approval', checksum, timestamp: ts })

    const r = await httpsRequest({
      hostname: 'api.groww.in', path: '/v1/token/api/access', method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROWW.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-VERSION': '1.0',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body)

    if (r.status === 429) {
      GROWW.cooldownUntil = Date.now() + 5 * 60_000   // back off 5 min on rate limit
      throw new Error(`Groww auth 429 (rate limited) — backing off 5 min: ${r.data.slice(0, 120)}`)
    }
    if (r.status !== 200) throw new Error(`Groww auth ${r.status}: ${growwErrorMessage(r.data)}`)
    const j = JSON.parse(r.data)
    GROWW.token = j.token
    GROWW.exp   = decodeJwtExpMs(j.token) || Date.now() + 6 * 3600 * 1000
    GROWW.cooldownUntil = 0
    console.log('\x1b[32m[Groww]\x1b[0m Access token ready')
    return GROWW.token
  })()

  try {
    const token = await GROWW.tokenPromise
    GROWW.lastAuthError = null
    return token
  } catch (e) {
    GROWW.lastAuthError = e.message
    throw e
  } finally {
    GROWW.tokenPromise = null   // clear so the next expiry can fetch a fresh token
  }
}

// Groww has returned errors as {error:{message}} and as {error:{errorMessage}};
// pull out whichever is present so the UI shows Groww's own reason.
export function growwErrorMessage(raw) {
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    const e = j?.error || {}
    return e.message || e.errorMessage || j?.payload?.remark || j?.message || String(raw).slice(0, 160)
  } catch {
    return String(raw).slice(0, 160)
  }
}

// GET that returns the full JSON body (callers read `.payload`).
export async function growwGet(path) {
  const token = await growwAccessToken()
  const r = await httpsRequest({
    hostname: 'api.groww.in', path, method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'X-API-VERSION': '1.0' },
  })
  if (r.status !== 200) throw new Error(`Groww ${r.status}: ${growwErrorMessage(r.data)}`)
  return JSON.parse(r.data)
}

// Any method; returns `payload` on SUCCESS, throws with Groww's message otherwise.
export async function growwCall(method, path, body) {
  const token = await growwAccessToken()
  const json = body ? JSON.stringify(body) : null
  const r = await httpsRequest({
    hostname: 'api.groww.in', path, method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'X-API-VERSION': '1.0',
      ...(json ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) } : {}),
    },
  }, json)
  let j = null
  try { j = JSON.parse(r.data) } catch { /* non-JSON error page */ }
  if (r.status < 200 || r.status >= 300 || !j || (j.status && j.status !== 'SUCCESS')) {
    throw new Error(`Groww ${r.status}: ${growwErrorMessage(j || r.data)}`)
  }
  return j.payload ?? j
}
