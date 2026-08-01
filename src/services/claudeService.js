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
// `context` (optional) enriches the prompt with what a real options trader uses:
//   { dailyTrend, adx, pcr, atmIV, winRate, expectancy, samples, recentCloses, daysToExpiry }
const buildPrompt = (symbol, indicators, formulaSignal, quote, context = {}) => {
  const { rsi, macd, macdSignal, ema9, ema20, ema50, bbUpper, bbLower } = indicators || {}
  const price         = quote?.price         || formulaSignal?.entry || 0
  const changePercent = quote?.changePercent || 0
  const open          = quote?.open  || price
  const high          = quote?.high  || price
  const low           = quote?.low   || price
  const histogram     = (macd != null && macdSignal != null) ? ((macd - macdSignal).toFixed(3)) : 'N/A'
  const { dailyTrend, adx, pcr, atmIV, winRate, expectancy, samples, recentCloses, daysToExpiry } = context
  const closesStr = Array.isArray(recentCloses) && recentCloses.length ? recentCloses.map(c => c.toFixed(0)).join(' → ') : 'N/A'

  return `You are a disciplined ${symbol} options analyst giving a SECOND OPINION on a setup that an algorithmic engine has already computed. Your job is NOT to invent price targets — the engine sets those. Your job: judge whether this is a trade worth taking, agree or push back on the engine, and name what would prove it wrong. Return ONLY valid JSON, no markdown.

PRICE (${symbol}):
- Spot ₹${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% today) | O ${open.toFixed(0)} H ${high.toFixed(0)} L ${low.toFixed(0)}
- Recent closes (this timeframe): ${closesStr}

INDICATORS:
- RSI(14) ${rsi?.toFixed(1) ?? 'N/A'} | MACD ${macd?.toFixed(2) ?? 'N/A'} vs signal ${macdSignal?.toFixed(2) ?? 'N/A'} (hist ${histogram})
- EMA9 ${ema9?.toFixed(0) ?? 'N/A'} / EMA20 ${ema20?.toFixed(0) ?? 'N/A'} / EMA50 ${ema50?.toFixed(0) ?? 'N/A'} | price is ${ema20 ? (price > ema20 ? 'ABOVE' : 'BELOW') : 'N/A'} EMA20
- Bollinger ${bbLower?.toFixed(0) ?? 'N/A'} – ${bbUpper?.toFixed(0) ?? 'N/A'}
- ADX (trend strength) ${adx != null ? adx.toFixed(1) + (adx >= 25 ? ' (strong trend)' : ' (weak/choppy)') : 'N/A'}

HIGHER-TIMEFRAME & OPTIONS FLOW:
- DAILY trend: ${dailyTrend ? dailyTrend.toUpperCase() : 'N/A'} (a directional trade should agree with this)
- PCR (put/call OI near spot): ${pcr != null ? pcr : 'N/A'} ${pcr != null ? (pcr > 1.1 ? '(put-heavy → support/bullish bias)' : pcr < 0.9 ? '(call-heavy → resistance/bearish bias)' : '(balanced)') : ''}
- ATM implied volatility: ${atmIV != null ? atmIV.toFixed(1) + '%' : 'N/A'} | Days to expiry: ${daysToExpiry != null ? daysToExpiry : 'N/A'} (theta risk rises as this shrinks)

ENGINE VERDICT & ITS BACKTESTED EDGE:
- Engine signal: ${formulaSignal?.type ?? 'NONE'}
- Backtested win rate: ${winRate != null ? winRate + '%' : 'not enough history'} | Expectancy: ${expectancy != null ? expectancy + ' R/trade' : 'N/A'}${samples != null ? ' (n=' + samples + ')' : ''}

Weigh ALL of the above — especially whether the direction agrees with the DAILY trend, the ADX (don't trust breakouts in a weak/choppy trend), the PCR bias, and the backtested expectancy (negative expectancy = lean toward HOLD). Then return ONLY this JSON:
{"signal":"BUY|SELL|HOLD","optionType":"CALL|PUT|WAIT","confidence":INTEGER_0_TO_100,"agreesWithFormula":true|false,"reasoning":"2-3 sentences citing the specific evidence above","keyRisk":"the single biggest risk to this trade","invalidationLevel":"a price level or condition that would prove this thesis wrong","sentiment":"Bullish|Bearish|Neutral","trendStrength":"Strong|Moderate|Weak","indicators":{"rsiStatus":"","macdStatus":"","emaStatus":"","bbStatus":""}}

Rules:
- Be honest: if the evidence is mixed or expectancy is negative, say HOLD/WAIT with LOW confidence. Do NOT inflate confidence — a real edge is rare.
- confidence: your genuine 0–100 probability this trade works; use the full range.
- Do not output price targets — the engine owns entry/target/stop.`
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
  // Confidence is now a genuine 0–100 (no forced floor); default 50 if missing/NaN.
  const c = parseInt(parsed.confidence, 10)
  parsed.confidence = Number.isFinite(c) ? Math.min(100, Math.max(0, c)) : 50
  return parsed
}

// ── Main export ────────────────────────────────────────────────────────────
export const getClaudeAnalysis = async (symbol, indicators, formulaSignal, quote, context = {}) => {
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

  const prompt = buildPrompt(symbol, indicators, formulaSignal, quote, context)

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
