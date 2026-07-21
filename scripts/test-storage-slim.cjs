/**
 * ISSUE-09 unit tests for storage slim helpers
 * Run: node scripts/test-storage-slim.cjs
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const srcPath = path.resolve('src/utils/storageSlim.ts')
const source = fs.readFileSync(srcPath, 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: 'storageSlim.ts',
})
const mod = { exports: {} }
const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)
fn(mod.exports, require, mod, srcPath, path.dirname(srcPath))
const slim = mod.exports

function makeMsg(i, role, content) {
  return {
    id: 'm' + i,
    role: role || 'teacher',
    content: content || ('content-' + i + '-'.repeat(10)),
    type: 'text',
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
  }
}

function makeSession(kpId, n, updatedOffset) {
  updatedOffset = updatedOffset || 0
  const messages = []
  for (let i = 0; i < n; i++) messages.push(makeMsg(i, i % 2 ? 'student' : 'teacher'))
  return {
    id: 's-' + kpId + '-' + updatedOffset,
    kpId: kpId,
    messages: messages,
    currentStep: 'asking_question',
    createdAt: new Date(Date.now() - 100000 + updatedOffset).toISOString(),
    updatedAt: new Date(Date.now() - 10000 + updatedOffset).toISOString(),
  }
}

let passed = 0
function ok(name) {
  passed++
  console.log('OK  |', name)
}

function main() {
  // 1. per-session message cap (20 normal)
  {
    const sessions = [makeSession('kp1', 50)]
    const out = slim.pruneTeachingSessions(sessions, 'normal')
    assert.strictEqual(out.length, 1)
    assert.strictEqual(out[0].messages.length, 20)
    assert.strictEqual(out[0].messages[0].id, 'm30')
    ok('max 20 messages per session')
  }

  // 2. per-KP session cap (2 latest)
  {
    const sessions = [
      makeSession('kp1', 4, 1),
      makeSession('kp1', 4, 2),
      makeSession('kp1', 4, 3),
      makeSession('kp2', 4, 4),
    ]
    const out = slim.pruneTeachingSessions(sessions, 'normal')
    const kp1 = out.filter((s) => s.kpId === 'kp1')
    assert.strictEqual(kp1.length, 2)
    assert.ok(out.some((s) => s.kpId === 'kp2'))
    ok('max 2 sessions per KP')
  }

  // 3. long message truncated
  {
    const long = 'x'.repeat(5000)
    const msg = slim.slimMessage(makeMsg(1, 'teacher', long), 3500)
    assert.ok(msg.content.length <= 3510)
    assert.ok(msg.content.includes('已截断'))
    ok('message content truncated')
  }

  // 4. progress docs stripped on aggressive
  {
    const project = {
      id: 'p1',
      progress: [
        {
          knowledgePointId: 'kp1',
          status: 'in_progress',
          notes: 'n'.repeat(5000),
          generatedDocs: '# doc\n' + 'a'.repeat(20000),
          generatedDiagrams: [{ type: 'mermaid', code: 'graph TD; A-->B', caption: 'c' }],
          exercises: new Array(20).fill({ id: 1 }),
        },
      ],
      teachingSessions: [makeSession('kp1', 30)],
      dailySummaries: Array.from({ length: 80 }, (_, i) => ({
        date: '2026-01-' + String((i % 28) + 1).padStart(2, '0'),
      })),
    }
    const normal = slim.pruneProjectData(project, 'normal')
    assert.ok(normal.progress[0].generatedDocs)
    assert.ok(normal.progress[0].generatedDocs.length < 20000)
    assert.ok(normal.progress[0].notes.length <= 2040)
    assert.ok(normal.dailySummaries.length <= 45)
    assert.strictEqual(normal.teachingSessions[0].messages.length, 20)

    const agg = slim.pruneProjectData(project, 'aggressive')
    assert.strictEqual(agg.progress[0].generatedDocs, undefined)
    assert.strictEqual(agg.progress[0].generatedDiagrams, undefined)
    assert.ok(agg.teachingSessions[0].messages.length <= 12)
    ok('normal vs aggressive slim')
  }

  // 5. critical keeps fewer projects
  {
    const list = Array.from({ length: 6 }, (_, i) => ({
      id: 'p' + i,
      updatedAt: new Date(Date.now() + i * 1000).toISOString(),
      progress: [{ knowledgePointId: 'k', status: 'in_progress', generatedDocs: 'big' }],
      teachingSessions: [makeSession('k', 10, i)],
      dailySummaries: [],
    }))
    const out = slim.pruneProjectsData(list, 'critical')
    assert.ok(out.length <= 3)
    assert.ok(out.every((p) => !p.progress[0].generatedDocs))
    ok('critical keeps <=3 projects and strips docs')
  }

  // 6. truncateText edge
  {
    assert.strictEqual(slim.truncateText('abc', 10), 'abc')
    assert.strictEqual(slim.truncateText('hello', 0), '')
    ok('truncateText edges')
  }

  // 7. quota toast strings present
  {
    assert.ok(slim.QUOTA_TOAST.full.includes('导出备份'))
    assert.ok(slim.QUOTA_TOAST.failed.includes('删除旧项目'))
    ok('quota toast copy')
  }

  console.log('==== SUMMARY ====')
  console.log(JSON.stringify({ passed: passed, total: 7 }))
  if (passed !== 7) process.exit(1)
}

main()
