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
  groq:      { name: 'Groq (GPT-OSS 120B)', model: 'openai/gpt-oss-120b', color: 'text-orange-400', free: '6,000/day free' },
  anthropic: { name: 'Claude Haiku',        model: 'claude-haiku-4-5-20251001', color: 'text-primary-400', free: 'Paid ($5 min)' },
}

// ── Shared prompt ─────────────────────────────────────────────────────────────
const buildPrompt = (symbol, indicators, formulaSignal, quote, timeframe) => {
  const { rsi, macd, macdSignal, ema9, ema20, ema50, bbUpper, bbLower, atr } = indicators || {}
  const price         = quote?.price         || formulaSignal?.entry || 0
  const changePercent = quote?.changePercent || 0
  const open          = quote?.open  || price
  const high          = quote?.high  || price
  const low           = quote?.low   || price
  const hasIndicators = rsi != null || macd != null
  const histogram     = (macd != null && macdSignal != null) ? ((macd - macdSignal).toFixed(3)) : 'N/A'

  return `You are a professional NIFTY options trader. Analyze this ${symbol} data and return ONLY valid JSON — no markdown, no text outside the JSON object.

MARKET DATA (${symbol}, ${timeframe === '1D' ? 'daily' : timeframe} candles):
- Price: ₹${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% today)
- Open: ₹${open.toFixed(2)} | High: ₹${high.toFixed(2)} | Low: ₹${low.toFixed(2)}
${hasIndicators ? `- RSI(14): ${rsi?.toFixed(2) ?? 'N/A'}
- MACD: ${macd?.toFixed(3) ?? 'N/A'} | Signal: ${macdSignal?.toFixed(3) ?? 'N/A'} | Histogram: ${histogram}
- EMA9: ${ema9?.toFixed(2) ?? 'N/A'} | EMA20: ${ema20?.toFixed(2) ?? 'N/A'} | EMA50: ${ema50?.toFixed(2) ?? 'N/A'}
- Bollinger Upper: ${bbUpper?.toFixed(2) ?? 'N/A'} | Lower: ${bbLower?.toFixed(2) ?? 'N/A'}
- Price vs EMA20: ${ema20 ? (price > ema20 ? 'ABOVE' : 'BELOW') : 'N/A'}
- ATR(14): ${atr?.toFixed(2) ?? 'N/A'} (average move per candle on this timeframe)
- Formula signal: ${formulaSignal?.type ?? 'NONE'} (confidence: ${formulaSignal?.confidence ?? 0}%)
- Formula target: ₹${formulaSignal?.target ?? 'N/A'} | stop: ₹${formulaSignal?.stopLoss ?? 'N/A'}
- Backtest of this setup: ${formulaSignal?.calibrated ? `${formulaSignal.backtestWinRate}% win rate, ${formulaSignal.expectancy} R/trade over ${formulaSignal.backtestSamples} trades` : 'not available'}` : `- Technical indicators: NOT AVAILABLE (use price action and today's OHLC only)
- Formula signal: NONE`}

Based on the above data, assess the trade and return ONLY this JSON (replace ALL placeholder values with your actual analysis — do NOT copy placeholder text):
{"signal":"YOUR_SIGNAL","optionType":"YOUR_OPTION","confidence":"YOUR_CONFIDENCE_INTEGER_55_TO_92","entryZone":"YOUR_ENTRY_PRICE","targetZone":"YOUR_TARGET_PRICE","stopLoss":"YOUR_STOPLOSS_PRICE","reasoning":"YOUR_2_TO_3_SENTENCE_REASONING","keyRisk":"YOUR_KEY_RISK_SENTENCE","agreesWithFormula":"true_or_false","sentiment":"YOUR_SENTIMENT","trendStrength":"YOUR_TREND_STRENGTH","indicators":{"rsiStatus":"YOUR_RSI_STATUS","macdStatus":"YOUR_MACD_STATUS","emaStatus":"YOUR_EMA_STATUS","bbStatus":"YOUR_BB_STATUS"}}

Rules:
- signal: exactly "BUY" or "SELL" — always pick the more likely side. Never "HOLD"
- optionType: exactly "CALL" (with BUY) or "PUT" (with SELL). Never "WAIT"
- confidence: integer between 50 and 92 — YOUR honest probability that this side wins. When the evidence is mixed, still pick a side but give a LOW confidence (50–58) instead of refusing
- entryZone/targetZone/stopLoss: index price levels near ₹${Math.round(price)}. ${atr ? `targetZone must be between ₹${(0.5 * atr).toFixed(0)} and ₹${(2 * atr).toFixed(0)} away from Price (0.5 to 2 ATR), on the profit side of your signal` : 'Keep them close to Price'}
- Base every level only on the data above, such as the EMAs and Bollinger Bands. Always give entryZone, targetZone and stopLoss for the side you picked: target on the profit side, stop on the loss side
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
      generationConfig: { temperature: 0, maxOutputTokens: 600 },
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
      model: PROVIDER_INFO.groq.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,   // reasoning model — its thinking counts against this limit
      reasoning_effort: 'low',
      temperature: 0,
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

// The app always shows a side. If a model still answers HOLD/WAIT (or contradicts
// itself), pick its side from its own sentiment, then its target, then the formula —
// and flag it so the UI can say the AI was undecided.
const forceDirection = (parsed, formulaSignal, price) => {
  const sideOf = (opt, sig) => (opt === 'CALL' || opt === 'PUT') ? opt : sig === 'BUY' ? 'CALL' : sig === 'SELL' ? 'PUT' : null
  let side = sideOf(String(parsed.optionType || '').toUpperCase(), String(parsed.signal || '').toUpperCase())
  const undecided = !side
  if (!side && parsed.sentiment === 'Bullish') side = 'CALL'
  if (!side && parsed.sentiment === 'Bearish') side = 'PUT'
  if (!side && parsed.targetZone > 0 && price) side = parsed.targetZone >= price ? 'CALL' : 'PUT'
  if (!side) side = formulaSignal?.type === 'SELL' ? 'PUT' : 'CALL'
  return {
    ...parsed,
    optionType: side,
    signal: side === 'CALL' ? 'BUY' : 'SELL',
    undecided,
    // An undecided model has no edge either way — never show more than a coin flip
    confidence: undecided ? Math.min(parsed.confidence, 52) : parsed.confidence,
  }
}

// ── Main export ────────────────────────────────────────────────────────────
export const getClaudeAnalysis = async (symbol, indicators, formulaSignal, quote, timeframe = '1D') => {
  const provider = getActiveProvider()
  if (!provider) {
    return { error: 'NO_KEY', message: 'No AI API key found. Add VITE_GEMINI_API_KEY or VITE_GROQ_API_KEY to .env' }
  }

  // No candle history → no real indicators. The model would be forced to invent
  // a 55–92 "confidence" from a single price, which is pure hallucination. Refuse
  // to produce a confident directional call on no data — that's the honest answer.
  const hasIndicators = indicators && (indicators.rsi != null || indicators.macd != null)
  if (!hasIndicators) {
    return {
      error: 'NO_DATA',
      message: 'No chart history available (market closed or rate limited). The AI needs candle data to analyze — it will not guess a direction from a single price.',
    }
  }

  const prompt = buildPrompt(symbol, indicators, formulaSignal, quote, timeframe)

  try {
    let raw = ''
    if (provider === 'gemini')    raw = await callGemini(prompt)
    else if (provider === 'groq') raw = await callGroq(prompt)
    else                          raw = await callAnthropic(prompt)

    const parsed = forceDirection(parseResponse(raw), formulaSignal, quote?.price || formulaSignal?.entry)
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
