// ── Option prices: Groww live data first, NSE public option chain as fallback ──
// Groww's market-data endpoints need a plan that includes live data; without it
// they return 403 even though order endpoints work. NSE's public option chain
// (same data the nseindia.com option-chain page shows) keeps paper fills and
// order validation working in the meantime.
import https from 'https'
import zlib from 'zlib'
import { liveBroker } from './liveBroker.js'
import { getContractBySymbol } from './instruments.js'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHAIN_TTL_MS = 5000
const GROWW_RETRY_MS = 10 * 60_000   // after a 403, re-try Groww's data API every 10 min

const jar = {}
const chainCache = new Map()   // `${underlying}|${expiry}` → { ts, rows: Map<'strike|CE', ltp>, promise }
let growwDataBlockedUntil = 0
export const priceSource = { last: null, growwError: null }

export function nseGet(path, referer) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'www.nseindia.com', path,
      headers: { 'User-Agent': UA, 'Accept': 'application/json, */*', 'Accept-Language': 'en-IN,en;q=0.9', 'Accept-Encoding': 'gzip, deflate', 'Referer': referer, ...(cookie ? { Cookie: cookie } : {}) },
    }, res => {
      for (const c of [].concat(res.headers['set-cookie'] || [])) {
        const [nv] = c.split(';'); const i = nv.indexOf('=')
        if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1).trim()
      }
      let stream = res
      if (res.headers['content-encoding'] === 'gzip') stream = res.pipe(zlib.createGunzip())
      if (res.headers['content-encoding'] === 'deflate') stream = res.pipe(zlib.createInflate())
      let data = ''
      stream.on('data', c => (data += c))
      stream.on('end', () => resolve({ status: res.statusCode, data }))
      stream.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('NSE timeout')))
  })
}

const nseExpiry = (iso) => { const [y, m, d] = iso.split('-'); return `${d}-${MONTHS[Number(m) - 1]}-${y}` }

async function fetchChain(underlying, expiry) {
  const path = `/api/option-chain-v3?type=Indices&symbol=${underlying}&expiry=${nseExpiry(expiry)}`
  const referer = 'https://www.nseindia.com/option-chain'
  let r = await nseGet(path, referer)
  if (r.status === 401 || r.status === 403) {   // cookies expired — refresh from the option-chain page
    await nseGet('/option-chain', 'https://www.nseindia.com/').catch(() => {})
    r = await nseGet(path, referer)
  }
  if (r.status !== 200) throw new Error(`NSE option chain HTTP ${r.status}`)
  const rows = new Map()
  for (const x of JSON.parse(r.data)?.records?.data || []) {
    if (x.CE?.lastPrice > 0) rows.set(`${x.strikePrice}|CE`, x.CE.lastPrice)
    if (x.PE?.lastPrice > 0) rows.set(`${x.strikePrice}|PE`, x.PE.lastPrice)
  }
  if (!rows.size) throw new Error('NSE option chain returned no prices')
  return rows
}

async function chainFor(underlying, expiry) {
  const key = `${underlying}|${expiry}`
  const hit = chainCache.get(key)
  if (hit?.rows && Date.now() - hit.ts < CHAIN_TTL_MS) return hit.rows
  if (hit?.promise) return hit.promise
  const promise = fetchChain(underlying, expiry)
    .then(rows => { chainCache.set(key, { ts: Date.now(), rows }); return rows })
    .catch(e => { chainCache.delete(key); throw e })
  chainCache.set(key, { ...hit, promise })
  return promise
}

async function nseLtp(symbols) {
  const out = {}
  for (const s of symbols) {
    const c = await getContractBySymbol(s)
    if (!c) continue
    const rows = await chainFor(c.underlying, c.expiry)
    const ltp = rows.get(`${c.strike}|${c.type}`)
    if (ltp != null) out[s] = ltp
  }
  return out
}

// { tradingSymbol: ltp } — never mixes sources within one call.
export async function getOptionLtp(symbols) {
  if (!symbols.length) return {}
  if (Date.now() >= growwDataBlockedUntil) {
    try {
      const out = await liveBroker.getLtp(symbols)
      if (Object.keys(out).length) { priceSource.last = 'groww'; priceSource.growwError = null; return out }
    } catch (e) {
      priceSource.growwError = e.message
      if (/\b403\b/.test(e.message)) growwDataBlockedUntil = Date.now() + GROWW_RETRY_MS
    }
  }
  const out = await nseLtp(symbols)
  priceSource.last = 'nse'
  return out
}
