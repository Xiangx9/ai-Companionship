/**
 * Rolling study-plan helpers: short periods + continue without wiping history.
 */
import type {
  LearningPath,
  LearningProgress,
  StudyDay,
  StudyPlan,
  StudyTask,
} from '@/types/learning'

export type PlanKpRef = {
  id: string
  title: string
  moduleId: string
  estimatedHours: number
}

export type PlanGenerateMode = 'fresh' | 'continue'

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().split('T')[0]
}

export function addDaysIso(isoDate: string, days: number): string {
  const base = String(isoDate || '').trim() || todayIsoDate()
  const d = new Date(base + 'T12:00:00')
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + days)
    return fallback.toISOString().split('T')[0]
  }
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b
}

export function listPathKnowledgePoints(path?: LearningPath | null): PlanKpRef[] {
  if (!path?.modules?.length) return []
  const out: PlanKpRef[] = []
  for (const mod of path.modules) {
    for (const kp of mod.knowledgePoints || []) {
      out.push({
        id: kp.id,
        title: kp.title,
        moduleId: mod.id,
        estimatedHours: typeof kp.estimatedHours === 'number' ? kp.estimatedHours : 2,
      })
    }
  }
  return out
}

export function doneKnowledgePointIds(progress: LearningProgress[] = []): Set<string> {
  const set = new Set<string>()
  for (const p of progress) {
    if (p.status === 'completed' || p.status === 'mastered') {
      set.add(p.knowledgePointId)
    }
  }
  return set
}

/** KPs still worth scheduling (not completed/mastered). */
export function remainingKnowledgePoints(
  path: LearningPath | null | undefined,
  progress: LearningProgress[] = [],
): PlanKpRef[] {
  const done = doneKnowledgePointIds(progress)
  return listPathKnowledgePoints(path).filter((kp) => !done.has(kp.id))
}

export function summarizeKpsForPrompt(kps: PlanKpRef[], limit = 18): string {
  return kps
    .slice(0, limit)
    .map((kp) => kp.id + ':' + kp.title + '(' + kp.estimatedHours + 'h)')
    .join('; ')
}

export function getPlanLastDay(plan?: StudyPlan | null): StudyDay | null {
  if (!plan?.days?.length) return null
  return [...plan.days].sort((a, b) => a.dayNumber - b.dayNumber).at(-1) || null
}

export function nextPeriodStart(plan?: StudyPlan | null, now = new Date()): {
  startDate: string
  dayNumberOffset: number
} {
  const today = todayIsoDate(now)
  const last = getPlanLastDay(plan)
  if (!last) {
    return { startDate: today, dayNumberOffset: 0 }
  }
  const afterLast = addDaysIso(last.date || today, 1)
  return {
    startDate: maxIsoDate(afterLast, today),
    dayNumberOffset: Math.max(0, Number(last.dayNumber) || plan!.days.length),
  }
}

export function canContinueStudyPlan(
  path: LearningPath | null | undefined,
  progress: LearningProgress[] = [],
  plan?: StudyPlan | null,
): boolean {
  if (!plan?.days?.length) return false
  return remainingKnowledgePoints(path, progress).length > 0
}

function ensureTaskIds(days: StudyDay[], prefix: string): StudyDay[] {
  return days.map((day, di) => ({
    ...day,
    completedTasks: Array.isArray(day.completedTasks) ? day.completedTasks : [],
    tasks: (day.tasks || []).map((task, ti) => ({
      ...task,
      id: task.id && !String(task.id).startsWith('task-')
        ? task.id
        : task.id || prefix + '-' + (di + 1) + '-' + (ti + 1),
    })),
  }))
}

/** Renumber a newly generated period and fix dates relative to startDate. */
export function normalizeNewPeriodDays(
  days: StudyDay[],
  opts: { dayNumberOffset: number; startDate: string; idPrefix?: string },
): StudyDay[] {
  const prefix = opts.idPrefix || 'task-p' + (opts.dayNumberOffset + 1)
  const capped = days.slice(0, 14)
  return capped.map((day, i) => {
    const dayNumber = opts.dayNumberOffset + i + 1
    const date = day.date && day.date >= opts.startDate
      ? day.date
      : addDaysIso(opts.startDate, i)
    const tasks: StudyTask[] = (day.tasks || []).map((task, ti) => ({
      ...task,
      id: prefix + '-' + dayNumber + '-' + (ti + 1),
      order: task.order || ti + 1,
    }))
    return {
      dayNumber,
      date,
      tasks,
      completedTasks: [],
    }
  })
}

/** Append a new period onto an existing plan (preserves completedTasks history). */
export function mergeStudyPlanPeriods(
  existing: StudyPlan,
  incoming: StudyPlan,
  opts: { dayNumberOffset: number; startDate: string; dailyHours: number },
): StudyPlan {
  const oldDays = ensureTaskIds(existing.days || [], 'task-old')
  const newDays = normalizeNewPeriodDays(incoming.days || [], {
    dayNumberOffset: opts.dayNumberOffset,
    startDate: opts.startDate,
    idPrefix: 'task-p' + (opts.dayNumberOffset + 1),
  })
  const days = [...oldDays, ...newDays]
  const first = days[0]
  const last = days[days.length - 1]
  return {
    ...existing,
    title: existing.title || incoming.title || '学习计划',
    dailyHours: opts.dailyHours || existing.dailyHours || incoming.dailyHours,
    startDate: existing.startDate || first?.date || opts.startDate,
    endDate: last?.date || incoming.endDate || opts.startDate,
    days,
    updatedAt: new Date().toISOString(),
  }
}

export function buildFreshStudyPlanShell(
  incoming: StudyPlan,
  opts: { projectId: string; dailyHours: number; startDate: string },
): StudyPlan {
  const days = normalizeNewPeriodDays(incoming.days || [], {
    dayNumberOffset: 0,
    startDate: opts.startDate,
    idPrefix: 'task-p1',
  })
  const last = days[days.length - 1]
  return {
    id: incoming.id || 'plan-' + Date.now(),
    projectId: opts.projectId,
    title: incoming.title || '近期学习计划',
    dailyHours: opts.dailyHours,
    startDate: days[0]?.date || opts.startDate,
    endDate: last?.date || opts.startDate,
    days,
    updatedAt: new Date().toISOString(),
  }
}
