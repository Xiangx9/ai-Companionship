/**
 * ISSUE-02 unit tests for normalizeMarkdown
 * Run: node scripts/test-markdown.cjs
 *        npm run test:markdown
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

// Isolate pure normalizeMarkdown without pulling DOMPurify/marked into Node.
const srcPath = path.resolve('src/utils/markdown.ts')
const source = fs.readFileSync(srcPath, 'utf8')
const match = source.match(
  /export function normalizeMarkdown\(source: string\): string \{[\s\S]*?\n\}/,
)
if (!match) {
  console.error('FAIL | could not extract normalizeMarkdown from', srcPath)
  process.exit(1)
}
const body = match[0]
  .replace(/^export function normalizeMarkdown\(source: string\): string/, 'function normalizeMarkdown(source)')
const factory = new Function(`${body}\nreturn normalizeMarkdown;`)
const normalizeMarkdown = factory()

let passed = 0
function ok(name) {
  passed++
  console.log('OK  |', name)
}

function main() {
  // 1. empty / whitespace
  {
    assert.strictEqual(normalizeMarkdown(''), '')
    assert.strictEqual(normalizeMarkdown('   \n  '), '')
    ok('empty input')
  }

  // 2. \python pseudo-fence -> real fence
  {
    const out = normalizeMarkdown('说明如下\n\\python\nprint(1)\n```')
    assert.ok(out.includes('```python'), out)
    assert.ok(!/\\python/.test(out), out)
    ok('\\python -> fenced python')
  }

  // 3. \js at start of text
  {
    const out = normalizeMarkdown('\\js\nconst a = 1\n')
    assert.ok(out.startsWith('```js') || out.includes('```js'), out)
    // unclosed fence should be auto-closed
    const opens = (out.match(/^```/gm) || []).length
    assert.strictEqual(opens % 2, 0, 'fences balanced: ' + out)
    ok('\\js unclosed fence auto-closed')
  }

  // 4. unclosed fence at EOF
  {
    const out = normalizeMarkdown('code:\n```ts\nconst x = 1')
    assert.ok(out.trimEnd().endsWith('```'), out)
    const count = (out.match(/^```/gm) || []).length
    assert.strictEqual(count % 2, 0, out)
    ok('unclosed fence closed at EOF')
  }

  // 5. Step heading upgrade (English + Chinese content)
  {
    const out = normalizeMarkdown('前言\nStep 1: 理解响应式\n细节说明')
    assert.ok(/###\s*Step\s*1[:：]/.test(out) || out.includes('### Step 1'), out)
    assert.ok(out.includes('理解响应式'), out)
    ok('Step title with Chinese upgraded')
  }

  // 6. Chinese 步骤 title upgrade
  {
    const out = normalizeMarkdown('开始\n步骤 2：写出第一个组件\n结束')
    assert.ok(out.includes('### 步骤 2') || /###\s*步骤\s*2/.test(out), out)
    ok('Chinese 步骤 title upgraded')
  }

  // 7. already-heading Step not double-wrapped
  {
    const out = normalizeMarkdown('### Step 3: 已是标题')
    assert.ok(!out.includes('### ###'), out)
    assert.ok(out.includes('### Step 3'), out)
    ok('existing heading not double-wrapped')
  }

  // 8. collapse 3+ blank lines
  {
    const out = normalizeMarkdown('a\n\n\n\n\nb')
    assert.strictEqual(out, 'a\n\nb')
    ok('collapse 3+ blank lines')
  }

  // 9. blank line padding around fences
  {
    const out = normalizeMarkdown('上文\n```js\n1\n```\n下文')
    assert.ok(/上文\n\n```js/.test(out) || /上文\n\n```/.test(out), out)
    ok('blank line before fence')
  }

  // 10. CRLF normalized
  {
    const out = normalizeMarkdown('Step 1: 第一行\r\n\r\n\r\n第二行')
    assert.ok(!out.includes('\r'), out)
    assert.ok(out.includes('### Step 1'), out)
    assert.ok(!/\n{3,}/.test(out), out)
    ok('CRLF + Step + collapse')
  }

  console.log('==== SUMMARY ====')
  console.log(JSON.stringify({ passed, total: 10 }))
  if (passed !== 10) process.exit(1)
}

main()
