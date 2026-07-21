/**
 * Unit tests for pickTodayLearningTarget (ISSUE-11)
 * Run: node scripts/test-today-card.cjs
 */
const assert = require('assert')

// Minimal stubs mirroring helpers logic (copied to avoid TS transpile)
function isDoneStatus(st) {
  return st === 'completed' || st === 'mastered'
}

function listKnowledgePoints(path) {
  const out = []
  for (const mod of path.modules || []) {
    for (const kp of mod.knowledgePoints || []) out.push(kp)
  }
  return out
}

function findKnowledgePoint(path, kpId) {
  for (const mod of path.modules || []) {
    const kp = (mod.knowledgePoints || []).find((k) => k.id === kpId)
    if (kp) return kp
  }
  return undefined
}

function getKnowledgePointProgressFor(project, kpId) {
  return (project.progress || []).find((p) => p.knowledgePointId === kpId)
}

function getTodayKey() {
  return '2026-07-20'
}

function getTodayPlanDay(project) {
  const plan = project?.studyPlan
  if (!plan?.days?.length) return null
  const key = getTodayKey()
  return plan.days.find((d) => d.date === key) || plan.days[0] || null
}

function pickTodayLearningTarget(project) {
  if (!project?.path) return null
  const kps = listKnowledgePoints(project.path)
  if (!kps.length) return null

  const statusOf = (kpId) => getKnowledgePointProgressFor(project, kpId)?.status ?? 'not_started'
  const minutesOf = (kpId, fallbackMin = 30) => {
    const kp = findKnowledgePoint(project.path, kpId)
    if (kp?.estimatedHours && kp.estimatedHours > 0) return Math.max(10, Math.round(kp.estimatedHours * 60))
    return fallbackMin
  }

  for (const kp of kps) {
    if (statusOf(kp.id) === 'in_progress') {
      return { kpId: kp.id, reason: 'in_progress', estimatedMinutes: minutesOf(kp.id) }
    }
  }

  const planDay = getTodayPlanDay(project)
  if (planDay?.tasks?.length) {
    const done = new Set(planDay.completedTasks ?? [])
    const unfinished = [...planDay.tasks]
      .filter((t) => t?.kpId && !done.has(t.id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const task of unfinished) {
      const st = statusOf(task.kpId)
      if (!isDoneStatus(st)) {
        return {
          kpId: task.kpId,
          reason: 'today_plan',
          planTaskId: task.id,
          planTaskTitle: task.title,
          estimatedMinutes: task.estimatedMinutes > 0 ? task.estimatedMinutes : minutesOf(task.kpId),
        }
      }
    }
  }

  for (const kp of kps) {
    if (!isDoneStatus(statusOf(kp.id))) {
      return { kpId: kp.id, reason: 'next', estimatedMinutes: minutesOf(kp.id) }
    }
  }

  const last = kps[kps.length - 1]
  return { kpId: last.id, reason: 'review', estimatedMinutes: minutesOf(last.id, 20) }
}

function makeProject(overrides = {}) {
  return {
    id: 'p1',
    name: 'Demo',
    path: {
      modules: [
        {
          id: 'm1',
          title: 'M1',
          knowledgePoints: [
            { id: 'k1', title: 'KP1', estimatedHours: 0.5, order: 1 },
            { id: 'k2', title: 'KP2', estimatedHours: 1, order: 2 },
            { id: 'k3', title: 'KP3', estimatedHours: 0.5, order: 3 },
          ],
        },
      ],
    },
    progress: [],
    studyPlan: null,
    ...overrides,
  }
}

let passed = 0
function ok(name, cond) {
  assert.ok(cond, name)
  console.log('OK  |', name)
  passed++
}

// 1 in_progress wins over plan and next
{
  const p = makeProject({
    progress: [{ knowledgePointId: 'k2', status: 'in_progress' }],
    studyPlan: {
      days: [{
        date: '2026-07-20',
        tasks: [{ id: 't1', kpId: 'k1', title: 'learn k1', order: 1, estimatedMinutes: 20 }],
        completedTasks: [],
      }],
    },
  })
  const r = pickTodayLearningTarget(p)
  ok('in_progress preferred', r && r.kpId === 'k2' && r.reason === 'in_progress')
  ok('in_progress minutes from hours', r && r.estimatedMinutes === 60)
}

// 2 today plan when no in_progress
{
  const p = makeProject({
    progress: [{ knowledgePointId: 'k1', status: 'completed' }],
    studyPlan: {
      days: [{
        date: '2026-07-20',
        tasks: [
          { id: 't1', kpId: 'k1', title: 'done', order: 1, estimatedMinutes: 20 },
          { id: 't2', kpId: 'k3', title: 'focus k3', order: 2, estimatedMinutes: 25 },
        ],
        completedTasks: ['t1'],
      }],
    },
  })
  const r = pickTodayLearningTarget(p)
  ok('today_plan preferred', r && r.kpId === 'k3' && r.reason === 'today_plan')
  ok('plan minutes used', r && r.estimatedMinutes === 25)
}

// 3 next not_started
{
  const p = makeProject({
    progress: [{ knowledgePointId: 'k1', status: 'completed' }],
  })
  const r = pickTodayLearningTarget(p)
  ok('next incomplete', r && r.kpId === 'k2' && r.reason === 'next')
}

// 4 all done -> review last
{
  const p = makeProject({
    progress: [
      { knowledgePointId: 'k1', status: 'completed' },
      { knowledgePointId: 'k2', status: 'mastered' },
      { knowledgePointId: 'k3', status: 'completed' },
    ],
  })
  const r = pickTodayLearningTarget(p)
  ok('review when all done', r && r.kpId === 'k3' && r.reason === 'review')
}

console.log('==== SUMMARY ====')
console.log(JSON.stringify({ passed, total: 6 }))
if (passed !== 6) process.exit(1)