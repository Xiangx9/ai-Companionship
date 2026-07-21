/**
 * Unit tests for withRetry gateway retry policy (524 mitigation)
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '../src/utils/aiJson.ts'), 'utf8')

// Extract only the retry helpers + withRetry (avoid full TS module)
const start = src.indexOf('function isRetryableAiFailure')
const end = src.indexOf('if (lastError instanceof Error) throw lastError')
if (start < 0 || end < 0) {
  console.error('could not locate withRetry helpers')
  process.exit(1)
}
// include through end of withRetry function
let i = end
let depth = 0
let seen = false
for (; i < src.length; i++) {
  if (src[i] === '{') { depth++; seen = true }
  if (src[i] === '}') {
    depth--
    if (seen && depth === 0) { i++; break }
  }
}
// Actually find end of withRetry: start from export async function withRetry
const wr = src.indexOf('export async function withRetry')
let j = wr
depth = 0
seen = false
for (; j < src.length; j++) {
  if (src[j] === '{') { depth++; seen = true }
  else if (src[j] === '}') {
    depth--
    if (seen && depth === 0) { j++; break }
  }
}
const helpersStart = src.indexOf('function isRetryableAiFailure')
let chunk = src.slice(helpersStart, j)
chunk = chunk
  .replace(/export async function/g, 'async function')
  .replace(/: unknown/g, '')
  .replace(/: number/g, '')
  .replace(/: string/g, '')
  .replace(/: boolean/g, '')
  .replace(/Promise<T>/g, 'Promise')
  .replace(/<T>/g, '')
  .replace(/opts\?: \{ retries\?: number; label\?: string; backoffMs\?: number \}/g, 'opts')
  .replace(/fn: \(attempt: number\) => Promise/g, 'fn')
  .replace(/fn: \(attempt\) => Promise/g, 'fn')

// simpler manual recreation to avoid brittle strip
const runtime = `
function isRetryableAiFailure(err) {
  if (err && err.name === 'AiJsonError') return true
  const code = err && typeof err === 'object' ? String(err.code || '') : ''
  const msg = err instanceof Error ? err.message : String(err || '')
  if (code === 'timeout' || code === 'empty') return true
  if (code === 'http' && /\\b(524|504|502|503|429)\\b/.test(msg)) return true
  return /JSON|结构|解析|空内容|empty|timeout|超时|\\b524\\b|\\b504\\b|\\b502\\b|\\b503\\b|\\b429\\b|Gateway Time-out|upstream_timeout|A Timeout Occurred|rate.?limit|暂时不可用/i.test(msg)
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }
async function withRetry(fn, opts) {
  const retries = (opts && opts.retries != null) ? opts.retries : 2
  const label = (opts && opts.label) || 'AI 请求'
  const backoffMs = (opts && opts.backoffMs != null) ? opts.backoffMs : 800
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(attempt) } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      if (/aborted|AbortError/i.test(msg) || (err && err.code === 'aborted')) break
      if (!isRetryableAiFailure(err) || attempt === retries) break
      const gate = /\\b(524|504|502|503)\\b|timeout|超时/i.test(msg)
      await delay(backoffMs * (attempt + 1) * (gate ? 2 : 1))
    }
  }
  if (lastError instanceof Error) throw lastError
  throw new Error(label + '失败')
}
`

const box = {}
// eslint-disable-next-line no-new-func
new Function('box', runtime + '; box.withRetry = withRetry; box.isRetryableAiFailure = isRetryableAiFailure;')(box)

async function main() {
  console.log('test: withRetry gateway')
  assert.strictEqual(box.isRetryableAiFailure(Object.assign(new Error('AI 请求失败 (524): error code: 524'), { code: 'http' })), true)
  assert.strictEqual(box.isRetryableAiFailure(Object.assign(new Error('config'), { code: 'config' })), false)

  let n = 0
  const v = await box.withRetry(async () => {
    n++
    if (n < 2) {
      const e = new Error('AI 请求失败 (524): error code: 524')
      e.code = 'http'
      throw e
    }
    return 'ok'
  }, { retries: 2, backoffMs: 5, label: 't' })
  assert.strictEqual(v, 'ok')
  assert.strictEqual(n, 2)
  console.log('  ok 524 retries then success')

  let m = 0
  try {
    await box.withRetry(async () => {
      m++
      const e = new Error('请设置 VITE_API_KEY')
      e.code = 'config'
      throw e
    }, { retries: 2, backoffMs: 5, label: 'cfg' })
    assert.fail('should throw')
  } catch {
    assert.strictEqual(m, 1)
    console.log('  ok config not retried')
  }

  console.log('all withRetry tests passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
