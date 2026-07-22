/**
 * Unit tests for describeAiError (ISSUE-06)
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '../src/utils/aiError.ts'), 'utf8')
const js = src
  .replace(/export type[\s\S]*?=\n(?:\s*\|[^\n]+\n)+/g, '')
  .replace(/export interface[\s\S]*?\n\}\n+/g, '')
  .replace(/ as \{[^}]+\}/g, '')
  .replace(/: AiErrorCode/g, '')
  .replace(/: AiErrorInfo/g, '')
  .replace(/: unknown/g, '')
  .replace(/: string/g, '')
  .replace(/: boolean/g, '')
  .replace(/export function/g, 'function')

const moduleExports = {}
// eslint-disable-next-line no-new-func
new Function('moduleExports', js + '\nmoduleExports.describeAiError = describeAiError;\nmoduleExports.isAbortLikeError = isAbortLikeError;')(moduleExports)

const { describeAiError, isAbortLikeError } = moduleExports

function check(name, err, expect) {
  const info = describeAiError(err)
  assert.strictEqual(info.code, expect.code, name + ' code')
  assert.strictEqual(info.retryable, expect.retryable, name + ' retryable')
  assert.ok(info.message && info.message.length > 0, name + ' message')
  assert.ok(info.title && info.title.length > 0, name + ' title')
  console.log('  ok', name)
}

console.log('test: aiError')
check('timeout code', Object.assign(new Error('AI 请求超时，请稍后重试'), { code: 'timeout' }), {
  code: 'timeout',
  retryable: true,
})
check('aborted code', Object.assign(new Error('AI 请求已取消'), { code: 'aborted' }), {
  code: 'aborted',
  retryable: false,
})
check('config', Object.assign(new Error('请在 .env.local 中设置 VITE_API_KEY'), { code: 'config' }), {
  code: 'config',
  retryable: false,
})
check('empty', Object.assign(new Error('AI 返回了空内容，请稍后重试'), { code: 'empty' }), {
  code: 'empty',
  retryable: true,
})
check('http', Object.assign(new Error('AI 请求失败 (500): boom'), { code: 'http' }), {
  code: 'http',
  retryable: true,
})

check('model not found 503', Object.assign(new Error('AI 请求失败 (503): {"error":{"code":"model_not_found","message":"No available channel for model agnes-1.5-flash under group cachellm"}}'), { code: 'config' }), {
  code: 'config',
  retryable: true,
})
check('model not found text', new Error('No available channel for model agnes-1.5-flash under group x'), {
  code: 'config',
  retryable: true,
})
check('cloudflare 524', Object.assign(new Error('AI 请求失败 (524): error code: 524'), { code: 'http' }), {
  code: 'timeout',
  retryable: true,
})
check('gateway 504 text', new Error('AI 请求失败 (504): Gateway Time-out'), {
  code: 'timeout',
  retryable: true,
})
check('network text', new Error('Failed to fetch'), {
  code: 'network',
  retryable: true,
})
check('unknown', new Error('something weird'), {
  code: 'unknown',
  retryable: true,
})
assert.strictEqual(isAbortLikeError(Object.assign(new Error('x'), { code: 'aborted' })), true)
assert.strictEqual(isAbortLikeError(new Error('timeout')), false)
console.log('all aiError tests passed')
