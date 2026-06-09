import axios from 'axios'

// ── Which keys are configured ────────────────────────────────────────────────
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const GEMINI_KEY    = import.meta.env.VITE_GEMINI_API_KEY    || ''
const GROQ_KEY      = import.meta.env.VITE_GROQ_API_KEY      || ''

// Pick the first available provider
export const getActiveProvider = () => {
  if (GROQ_KEY.length      > 10) return 'groq'
  if (GEMINI_KEY.length    > 10) return 'gemini'
  if (ANTHROPIC_KEY.length > 10) return 'anthropic'
  return null
}

export const isAIEnabled = () => !!getActiveProvider()

export const PROVIDER_INFO = {
  gemini:    { name: 'Google Gemini Flash', model: 'gemini-2.0-flash', color: 'text-blue-400',   free: '1,500/day free' },
  groq:      { name: 'Groq (Llama 3.3 70B)', model: 'llama-3.3-70b-versatile', color: 'text-orange-400', free: '6,000/day free' },
  anthropic: { name: 'Claude Haiku',        model: 'claude-haiku-4-5-20251001', color: 'text-primary-400', free: 'Paid ($5 min)' },
}

// ── Shared prompt ─────────────────────────────────────────────────────────────
const buildPrompt = (symbol, indicators, formulaSignal, quote) => {
  const { rsi, macd, macdSignal, ema9, ema20, ema50, bbUpper, bbLower } = indicators || {}
  const price         = quote?.price         || formulaSignal?.entry || 0
  const changePercent = quote?.changePercent || 0
  const open          = quote?.open  || price
  const high          = quote?.high  || price
  const low           = quote?.low   || price
  const hasIndicators = rsi != null || macd != null
  const histogram     = (macd != null && macdSignal != null) ? ((macd - macdSignal).toFixed(3)) : 'N/A'

  return `You are a professional NIFTY options trader. Analyze this ${symbol} data and return ONLY valid JSON — no markdown, no text outside the JSON object.

MARKET DATA (${symbol}):
- Price: ₹${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% today)
- Open: ₹${open.toFixed(2)} | High: ₹${high.toFixed(2)} | Low: ₹${low.toFixed(2)}
${hasIndicators ? `- RSI(14): ${rsi?.toFixed(2) ?? 'N/A'}
- MACD: ${macd?.toFixed(3) ?? 'N/A'} | Signal: ${macdSignal?.toFixed(3) ?? 'N/A'} | Histogram: ${histogram}
- EMA9: ${ema9?.toFixed(2) ?? 'N/A'} | EMA20: ${ema20?.toFixed(2) ?? 'N/A'} | EMA50: ${ema50?.toFixed(2) ?? 'N/A'}
- Bollinger Upper: ${bbUpper?.toFixed(2) ?? 'N/A'} | Lower: ${bbLower?.toFixed(2) ?? 'N/A'}
- Price vs EMA20: ${ema20 ? (price > ema20 ? 'ABOVE' : 'BELOW') : 'N/A'}
- Formula signal: ${formulaSignal?.type ?? 'NONE'} (confidence: ${formulaSignal?.confidence ?? 0}%)` : `- Technical indicators: NOT AVAILABLE (use price action and today's OHLC only)
- Formula signal: NONE`}

Based on the above data, assess the trade and return ONLY this JSON (replace ALL placeholder values with your actual analysis — do NOT copy placeholder text):
{"signal":"YOUR_SIGNAL","optionType":"YOUR_OPTION","confidence":"YOUR_CONFIDENCE_INTEGER_55_TO_92","entryZone":"YOUR_ENTRY_PRICE","targetZone":"YOUR_TARGET_PRICE","stopLoss":"YOUR_STOPLOSS_PRICE","reasoning":"YOUR_2_TO_3_SENTENCE_REASONING","keyRisk":"YOUR_KEY_RISK_SENTENCE","agreesWithFormula":"true_or_false","sentiment":"YOUR_SENTIMENT","trendStrength":"YOUR_TREND_STRENGTH","indicators":{"rsiStatus":"YOUR_RSI_STATUS","macdStatus":"YOUR_MACD_STATUS","emaStatus":"YOUR_EMA_STATUS","bbStatus":"YOUR_BB_STATUS"}}

Rules:
- signal: exactly "BUY", "SELL", or "HOLD"
- optionType: exactly "CALL", "PUT", or "WAIT"
- confidence: integer between 55 and 92 — YOUR honest assessment, not a placeholder
- entryZone/targetZone/stopLoss: realistic price levels near ₹${Math.round(price)}
- agreesWithFormula: true or false (boolean)
- sentiment: exactly "Bullish", "Bearish", or "Neutral"
- trendStrength: exactly "Strong", "Moderate", or "Weak"`
}

// ── Gemini ─────────────────────────────────────────────────────────────────
const callGemini = async (prompt) => {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
    },
    { timeout: 15000 }
  )
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ── Groq ───────────────────────────────────────────────────────────────────
const callGroq = async (prompt) => {
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.2,
    },
    {
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )
  return data?.choices?.[0]?.message?.content || ''
}

// ── Anthropic ──────────────────────────────────────────────────────────────
const callAnthropic = async (prompt) => {
  const { data } = await axios.post(
    '/api/claude/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      timeout: 15000,
    }
  )
  return data?.content?.[0]?.text || ''
}

// ── Parse raw text response into JSON ─────────────────────────────────────
const parseResponse = (raw) => {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON found in response')
  const parsed = JSON.parse(match[0])
  // Coerce numeric fields in case AI returned them as strings
  parsed.confidence  = parseInt(parsed.confidence,  10) || 65
  parsed.entryZone   = parseFloat(parsed.entryZone)  || 0
  parsed.targetZone  = parseFloat(parsed.targetZone) || 0
  parsed.stopLoss    = parseFloat(parsed.stopLoss)   || 0
  return parsed
}

// ── Main export ────────────────────────────────────────────────────────────
export const getClaudeAnalysis = async (symbol, indicators, formulaSignal, quote) => {
  const provider = getActiveProvider()
  if (!provider) {
    return { error: 'NO_KEY', message: 'No AI API key found. Add VITE_GEMINI_API_KEY or VITE_GROQ_API_KEY to .env' }
  }

  const prompt = buildPrompt(symbol, indicators, formulaSignal, quote)

  try {
    let raw = ''
    if (provider === 'gemini')    raw = await callGemini(prompt)
    else if (provider === 'groq') raw = await callGroq(prompt)
    else                          raw = await callAnthropic(prompt)

    const parsed = parseResponse(raw)
    return { ...parsed, provider, model: PROVIDER_INFO[provider].model, raw }
  } catch (err) {
    const status  = err.response?.status
    const body    = err.response?.data

    if (status === 401 || status === 403) {
      return { error: 'INVALID_KEY', message: `Invalid ${PROVIDER_INFO[provider]?.name} API key` }
    }
    if (status === 429) {
      return { error: 'RATE_LIMIT', message: 'Rate limit hit. Wait a moment and try again.' }
    }
    if (body?.error?.message?.includes('credit balance')) {
      return { error: 'NO_CREDITS', message: 'No Anthropic credits. Add $5 at console.anthropic.com/settings/billing — or use free Gemini/Groq instead.' }
    }

    return { error: 'FAILED', message: body?.error?.message || err.message || 'AI API call failed.' }
  }
}
