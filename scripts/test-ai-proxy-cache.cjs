const assert = require('assert')

// Pure mirror of buildAiRequest cache-key behavior
function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}
function buildProxiedModelsUrl(baseUrl) {
  const base = normalizeBaseUrl(baseUrl)
  const qs = '__ai_target=' + encodeURIComponent(base)
  return '/__ai_proxy/models?' + qs
}

const a = buildProxiedModelsUrl('https://apihub.agnes-ai.com/v1')
const b = buildProxiedModelsUrl('https://gy.hetaosu.xyz/v1')
assert.notStrictEqual(a, b, 'proxy URLs must differ per host')
assert.ok(a.includes(encodeURIComponent('https://apihub.agnes-ai.com/v1')))
assert.ok(b.includes(encodeURIComponent('https://gy.hetaosu.xyz/v1')))
console.log('ok proxy cache-key uniqueness')

// upstream strip
function upstreamPathAndQuery(rawUrl) {
  const PREFIX = '/__ai_proxy'
  const TARGET_QUERY = '__ai_target'
  const pathAndQuery = rawUrl.startsWith(PREFIX) ? rawUrl.slice(PREFIX.length) || '/' : rawUrl
  const u = new URL(pathAndQuery, 'http://local.invalid')
  u.searchParams.delete(TARGET_QUERY)
  const q = u.searchParams.toString()
  return u.pathname + (q ? '?' + q : '')
}
assert.strictEqual(
  upstreamPathAndQuery('/__ai_proxy/models?__ai_target=https%3A%2F%2Fx%2Fv1'),
  '/models',
)
assert.strictEqual(
  upstreamPathAndQuery('/__ai_proxy/models?foo=1&__ai_target=https%3A%2F%2Fx%2Fv1'),
  '/models?foo=1',
)
console.log('ok strip __ai_target before upstream')
console.log('all cache-key tests passed')
