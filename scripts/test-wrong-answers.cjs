/**
 * ISSUE-12 unit tests for wrong-answer queue helpers
 * Run: node scripts/test-wrong-answers.cjs
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const srcPath = path.resolve('src/utils/wrongAnswers.ts')
const source = fs.readFileSync(srcPath, 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: 'wrongAnswers.ts',
})
const mod = { exports: {} }
const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)
fn(mod.exports, require, mod, srcPath, path.dirname(srcPath))
const wa = mod.exports

const slimPath = path.resolve('src/utils/storageSlim.ts')
const slimSrc = fs.readFileSync(slimPath, 'utf8')
const slimOut = ts.transpileModule(slimSrc, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: 'storageSlim.ts',
}).outputText
const slimMod = { exports: {} }
new Function('exports', 'require', 'module', '__filename', '__dirname', slimOut)(
  slimMod.exports,
  require,
  slimMod,
  slimPath,
  path.dirname(slimPath),
)
const slim = slimMod.exports

let passed = 0
function ok(name) {
  passed++
  console.log('OK  |', name)
}

function main() {
  const now = '2026-07-20T10:00:00.000Z'
  const later = '2026-07-20T11:00:00.000Z'
  const passAt = '2026-07-20T12:00:00.000Z'

  {
    let list = []
    list = wa.recordWrongAnswer(list, { kpId: 'kp-a', source: 'quiz', score: 40, maxScore: 100, now })
    assert.strictEqual(list.length, 1)
    assert.strictEqual(list[0].kpId, 'kp-a')
    assert.ok(!list[0].resolvedAt)
    assert.strictEqual(wa.listActiveWrongAnswers(list).length, 1)
    ok('record quiz fail -> active wrong')
  }

  {
    let list = []
    list = wa.recordWrongAnswer(list, { kpId: 'kp-a', source: 'quiz', score: 40, now })
    list = wa.recordWrongAnswer(list, { kpId: 'kp-a', source: 'practice', score: 1, maxScore: 5, now: later })
    const active = wa.listActiveWrongAnswers(list)
    assert.strictEqual(active.length, 1)
    assert.strictEqual(active[0].source, 'practice')
    assert.strictEqual(active[0].score, 1)
    ok('same kp refresh single active')
  }

  {
    let list = wa.recordWrongAnswer([], { kpId: 'kp-b', source: 'quiz', score: 55, now })
    list = wa.resolveWrongAnswer(list, 'kp-b', { now: passAt })
    assert.strictEqual(list.length, 1)
    assert.ok(list[0].resolvedAt)
    assert.strictEqual(list[0].resolveCount, 1)
    assert.strictEqual(wa.listActiveWrongAnswers(list).length, 0)
    ok('resolve keeps history and clears active')
  }

  {
    let list = wa.recordWrongAnswer([], { kpId: 'kp-c', source: 'quiz', score: 30, now })
    list = wa.resolveWrongAnswer(list, 'kp-c', { now: passAt })
    list = wa.recordWrongAnswer(list, { kpId: 'kp-c', source: 'quiz', score: 50, now: later })
    assert.strictEqual(wa.listActiveWrongAnswers(list).length, 1)
    assert.ok(list.length >= 2, 'history retained after re-fail')
    ok('re-fail after resolve keeps history')
  }

  {
    let list = []
    list = wa.recordWrongAnswer(list, { kpId: 'kp-1', source: 'quiz', score: 20, now })
    list = wa.recordWrongAnswer(list, { kpId: 'kp-2', source: 'practice', score: 0, now: later })
    const picked = wa.pickReviewWrongKp(list, 'kp-2')
    assert.strictEqual(picked.kpId, 'kp-1')
    const onlySelf = wa.pickReviewWrongKp(
      wa.recordWrongAnswer([], { kpId: 'kp-x', source: 'manual', now }),
      'kp-x',
    )
    assert.strictEqual(onlySelf.kpId, 'kp-x')
    ok('pickReviewWrongKp exclude + fallback')
  }

  {
    let list = []
    for (let i = 0; i < 90; i++) {
      list = wa.recordWrongAnswer(list, {
        kpId: 'kp-' + i,
        source: 'quiz',
        score: i,
        now: new Date(Date.parse(now) + i * 1000).toISOString(),
      })
    }
    for (let i = 0; i < 45; i++) {
      list = wa.resolveWrongAnswer(list, 'kp-' + i, { now: passAt })
    }
    list = wa.trimWrongAnswers(list)
    assert.ok(list.length <= wa.WRONG_LIMITS.maxRecordsPerProject)
    const active = wa.listActiveWrongAnswers(list)
    assert.ok(active.length >= 40, 'active preserved under trim')
    ok('trim preserves active under cap')
  }

  {
    const wrongAnswers = []
    for (let i = 0; i < 100; i++) {
      wrongAnswers.push({
        id: 'w' + i,
        kpId: 'kp' + i,
        source: 'quiz',
        score: i,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
        resolvedAt: i < 70 ? new Date().toISOString() : undefined,
      })
    }
    const project = { id: 'p1', wrongAnswers }
    const out = slim.slimWrongAnswers(project, 80)
    assert.ok(out.wrongAnswers.length <= 80)
    const active = out.wrongAnswers.filter((w) => !w.resolvedAt)
    assert.strictEqual(active.length, 30)
    ok('slimWrongAnswers prefers active')
  }

  {
    const list = wa.recordWrongAnswer([], { kpId: 'kp-z', source: 'manual', note: 'flag', now })
    const keys = Object.keys(list[0]).sort()
    assert.ok(!keys.includes('interval'))
    assert.ok(!keys.includes('ease'))
    assert.ok(!keys.includes('dueAt'))
    ok('no SRS algorithm fields')
  }

  console.log('==== SUMMARY ====')
  console.log(JSON.stringify({ passed: passed, total: 8 }))
  if (passed !== 8) process.exit(1)
}

main()
