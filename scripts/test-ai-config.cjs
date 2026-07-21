/**
 * Unit tests for aiConfig pure helpers
 */
const assert = require('assert')

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, '')
}

function resolveAiConfig(stored, envDefaults) {
  const env = envDefaults || {
    baseUrl: '',
    apiKey: '',
    model: '',
  }
  const baseUrl = normalizeBaseUrl((stored && stored.baseUrl) || '') || env.baseUrl
  const apiKey = (((stored && stored.apiKey) || '') + '').trim() || env.apiKey
  const model = (((stored && stored.model) || '') + '').trim() || env.model
  return { baseUrl, apiKey, model }
}

function maskApiKey(key) {
  const k = (key || '').trim()
  if (!k) return ''
  if (k.length <= 8) return '********'
  return k.slice(0, 4) + '****' + k.slice(-4)
}

console.log('test: aiConfig')

assert.strictEqual(normalizeBaseUrl(' https://x.com/v1/ '), 'https://x.com/v1')
assert.strictEqual(normalizeBaseUrl('https://x.com/v1///'), 'https://x.com/v1')
console.log('  ok normalizeBaseUrl')

const env = {
  baseUrl: 'https://env.example/v1',
  apiKey: 'env-key',
  model: 'env-model',
}

assert.deepStrictEqual(resolveAiConfig(null, env), env)
assert.deepStrictEqual(
  resolveAiConfig({ baseUrl: 'https://user.example/v1/', apiKey: ' user-key ', model: 'user-model' }, env),
  { baseUrl: 'https://user.example/v1', apiKey: 'user-key', model: 'user-model' },
)
assert.deepStrictEqual(
  resolveAiConfig({ baseUrl: '', apiKey: '', model: '' }, env),
  env,
)
assert.deepStrictEqual(
  resolveAiConfig({ model: 'only-model' }, env),
  { baseUrl: env.baseUrl, apiKey: env.apiKey, model: 'only-model' },
)
console.log('  ok resolveAiConfig priority')

assert.strictEqual(maskApiKey(''), '')
assert.ok(maskApiKey('short').includes('*'))
assert.ok(maskApiKey('sk-abcdefghijklmnop').startsWith('sk-a'))
console.log('  ok maskApiKey')

// Keep source-contract checks so implementation does not drift silently
const fs = require('fs')
const path = require('path')
const src = fs.readFileSync(path.join(__dirname, '../src/services/aiConfig.ts'), 'utf8')
assert.ok(src.includes('export function normalizeBaseUrl'), 'source exports normalizeBaseUrl')
assert.ok(src.includes('export function resolveAiConfig'), 'source exports resolveAiConfig')
assert.ok(src.includes('export async function listAiModels'), 'source exports listAiModels')
assert.ok(src.includes('export async function testAiConnection'), 'source exports testAiConnection')
assert.ok(src.includes('AI_SETTINGS_STORAGE_KEY'), 'source has storage key')
console.log('  ok source contracts')

console.log('all aiConfig tests passed')