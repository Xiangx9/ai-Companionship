/**
 * ISSUE-14 · one-click automated regression (unit suite)
 * Run: npm run test:regression
 *
 * Manual checklist: docs/WEEK2_REGRESSION.md
 * Browser smoke (optional): npm run test:smoke
 */
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const steps = [
  { name: 'progress-state', script: 'scripts/test-progress-state.cjs' },
  { name: 'ai-error', script: 'scripts/test-ai-error.cjs' },
  { name: 'stream', script: 'scripts/test-stream.cjs' },
  { name: 'storage-slim', script: 'scripts/test-storage-slim.cjs' },
  { name: 'today-card', script: 'scripts/test-today-card.cjs' },
  { name: 'wrong-answers', script: 'scripts/test-wrong-answers.cjs' },
  { name: 'markdown', script: 'scripts/test-markdown.cjs' },
]

let failed = 0
const results = []

console.log('==== Week2 regression (auto) ====')
console.log('checklist: docs/WEEK2_REGRESSION.md')
console.log('')

for (const step of steps) {
  process.stdout.write('>> ' + step.name + ' ... ')
  const r = spawnSync(process.execPath, [path.resolve(root, step.script)], {
    cwd: root,
    encoding: 'utf8',
  })
  const ok = r.status === 0
  if (!ok) failed++
  results.push({ name: step.name, ok, code: r.status })
  console.log(ok ? 'OK' : 'FAIL')
  if (!ok) {
    if (r.stdout) console.log(String(r.stdout).slice(-800))
    if (r.stderr) console.error(String(r.stderr).slice(-800))
  }
}

console.log('')
console.log('==== SUMMARY ====')
console.log(JSON.stringify({
  passed: results.filter((x) => x.ok).length,
  failed,
  total: results.length,
  results,
  manualChecklist: 'docs/WEEK2_REGRESSION.md',
}, null, 2))

if (failed) {
  console.error('regression FAILED')
  process.exit(1)
}
console.log('regression PASSED (auto unit suite)')
console.log('Next: tick manual items in docs/WEEK2_REGRESSION.md before demo')
