// ── AI analysis relay ──────────────────────────────────────────────────────
// The browser builds the prompt; this server holds the API keys and calls the
// provider, so no key is ever shipped inside the website's JavaScript.
// Keys: GROQ_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY. The old VITE_* names
// still work locally so an existing .env keeps working.
import { httpsRequest } from './groww.js'

const PROVIDERS = {
  groq:      { model: 'openai/gpt-oss-120b' },
  gemini:    { model: 'gemini-2.0-flash' },
  anthropic: { model: 'claude-haiku-4-5-20251001' },
}
const MAX_PROMPT = 20_000

const keys = { groq: '', gemini: '', anthropic: '' }

export function configureAI(env) {
  keys.groq      = env.GROQ_API_KEY      || env.VITE_GROQ_API_KEY      || ''
  keys.gemini    = env.GEMINI_API_KEY    || env.VITE_GEMINI_API_KEY    || ''
  keys.anthropic = env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || ''
}

// Same preference order the app always used: Groq, then Gemini, then Anthropic
export const activeProvider = () =>
  keys.groq.length > 10 ? 'groq' : keys.gemini.length > 10 ? 'gemini' : keys.anthropic.length > 10 ? 'anthropic' : null

// `status` is what this server answers; `providerStatus` is the provider's own code.
// Provider errors (even its 401 for a bad key) are sent as 502 so the app doesn't
// mistake them for its own login expiring.
class AIError extends Error { constructor(msg, status, providerStatus) { super(msg); this.status = status; this.providerStatus = providerStatus } }

async function post(hostname, path, headers, body) {
  const json = JSON.stringify(body)
  const r = await httpsRequest({
    hostname, path, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json), ...headers },
  }, json)
  let data = null
  try { data = JSON.parse(r.data) } catch { /* non-JSON error page */ }
  if (r.status < 200 || r.status >= 300) {
    throw new AIError(data?.error?.message || `AI provider HTTP ${r.status}`, 502, r.status)
  }
  return data
}

async function complete(prompt) {
  const provider = activeProvider()
  if (!provider) throw new AIError('No AI API key configured on the server', 503)
  if (typeof prompt !== 'string' || !prompt || prompt.length > MAX_PROMPT) throw new AIError('Invalid prompt', 400)

  let text = ''
  if (provider === 'groq') {
    const d = await post('api.groq.com', '/openai/v1/chat/completions', { Authorization: `Bearer ${keys.groq}` }, {
      model: PROVIDERS.groq.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,   // reasoning model — its thinking counts against this limit
      reasoning_effort: 'low',
      temperature: 0,
    })
    text = d?.choices?.[0]?.message?.content || ''
  } else if (provider === 'gemini') {
    const d = await post('generativelanguage.googleapis.com', `/v1beta/models/${PROVIDERS.gemini.model}:generateContent`,
      { 'x-goog-api-key': keys.gemini },
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 600 } })
    text = d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else {
    const d = await post('api.anthropic.com', '/v1/messages',
      { 'x-api-key': keys.anthropic, 'anthropic-version': '2023-06-01' },
      { model: PROVIDERS.anthropic.model, max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    text = d?.content?.[0]?.text || ''
  }
  return { provider, model: PROVIDERS[provider].model, text }
}

export const aiRoutes = {
  'GET /api/ai/status':    async () => ({ provider: activeProvider() }),
  'POST /api/ai/complete': async (_url, body) => complete(body?.prompt),
}
