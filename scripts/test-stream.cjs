/**
 * ISSUE-08 unit tests: SSE parse + simulated stream helpers
 * Run: node scripts/test-stream.cjs
 */
const assert = require('assert')

function asTextCandidate(value) {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        if (typeof part.text === 'string') return part.text
        if (typeof part.content === 'string') return part.content
      }
      return ''
    })
    .join('')
    .trim()
}

function extractStreamDelta(data) {
  if (!data || typeof data !== 'object') return ''
  const choices = Array.isArray(data.choices) ? data.choices : []
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] : {}
  const delta = first.delta && typeof first.delta === 'object' ? first.delta : {}
  const fromDelta = asTextCandidate(delta.content ?? delta.text)
  if (fromDelta) return fromDelta
  const message = first.message && typeof first.message === 'object' ? first.message : {}
  return asTextCandidate(message.content ?? first.text)
}

function parseSseDataLine(line) {
  const raw = line.replace(/^data:\s?/, '').trim()
  if (!raw || raw === '[DONE]') return { done: true, chunk: '' }
  try {
    const json = JSON.parse(raw)
    return { done: false, chunk: extractStreamDelta(json) }
  } catch {
    return { done: false, chunk: raw }
  }
}

async function simulateTextStream(text, onDelta, signal) {
  if (!onDelta) return text
  if (!text) {
    onDelta('', '')
    return text
  }
  const chunkSize = Math.max(6, Math.min(28, Math.ceil(text.length / 20)))
  let acc = ''
  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal?.aborted) throw new Error('AI 请求已取消')
    const piece = text.slice(i, i + chunkSize)
    acc += piece
    onDelta(acc, piece)
    await new Promise((r) => setTimeout(r, 0))
  }
  return text
}

async function main() {
  let passed = 0
  function ok(name) {
    passed++
    console.log('OK  |', name)
  }

  assert.strictEqual(
    extractStreamDelta({ choices: [{ delta: { content: '你好' } }] }),
    '你好',
  )
  ok('extractStreamDelta content')

  assert.deepStrictEqual(parseSseDataLine('data: [DONE]'), { done: true, chunk: '' })
  ok('parseSse DONE')

  const parsed = parseSseDataLine('data: {"choices":[{"delta":{"content":"Step"}}]}')
  assert.strictEqual(parsed.done, false)
  assert.strictEqual(parsed.chunk, 'Step')
  ok('parseSse content chunk')

  const chunks = []
  const full = await simulateTextStream('abcdefghij', (acc, piece) => chunks.push({ acc, piece }))
  assert.strictEqual(full, 'abcdefghij')
  assert.ok(chunks.length >= 2, 'expected multiple chunks, got ' + chunks.length)
  assert.strictEqual(chunks[chunks.length - 1].acc, 'abcdefghij')
  assert.ok(chunks[0].acc.length < full.length, 'first chunk should be partial')
  ok('simulateTextStream progressive')

  const ac = new AbortController()
  let saw = 0
  let aborted = false
  try {
    await simulateTextStream(
      'x'.repeat(200),
      () => {
        saw++
        if (saw === 1) ac.abort()
      },
      ac.signal,
    )
  } catch (e) {
    aborted = /取消|abort/i.test(String(e.message || e))
  }
  assert.ok(aborted, 'should abort')
  ok('simulateTextStream abort')

  assert.strictEqual(extractStreamDelta({ choices: [{ delta: {} }] }), '')
  ok('empty delta')

  console.log('==== SUMMARY ====')
  console.log(JSON.stringify({ passed, total: 6 }))
  if (passed !== 6) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
