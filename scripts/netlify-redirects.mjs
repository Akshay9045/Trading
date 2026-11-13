// Writes dist/_redirects for Netlify from the API_ORIGIN environment variable:
//   /api/*  → the Railway backend (proxied, so it stays same-origin for the browser)
//   /*      → index.html (client-side routes like /trade, /options)
import fs from 'fs'

const origin = (process.env.API_ORIGIN || '').trim().replace(/\/+$/, '')
if (!/^https:\/\/[^/\s]+$/.test(origin)) {
  console.error('API_ORIGIN must be set to the Railway backend URL, e.g. https://trading-api-production.up.railway.app')
  process.exit(1)
}

fs.writeFileSync('dist/_redirects', [
  `/api/*  ${origin}/api/:splat  200!`,
  '/*      /index.html            200',
  '',
].join('\n'))
console.log(`_redirects: /api/* → ${origin}`)
