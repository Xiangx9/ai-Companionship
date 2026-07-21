/**
 * Pure helpers for learning store (no Pinia refs).
 */
import type {
  LearningPath,
  LearningProject,
  LearningProgress,
  KnowledgePoint,
  LearningModule,
} from '@/types/learning'
import {
  createProgressSignals,
  type ProgressSignals,
} from '@/utils/progressState'

export function findKnowledgePoint(path: LearningPath, kpId: string): KnowledgePoint | undefined {
  for (const mod of path.modules) {
    const kp = mod.knowledgePoints.find((k) => k.id === kpId)
    if (kp) return kp
  }
  return undefined
}

export function countKnowledgePoints(path: LearningPath): number {
  if (!path?.modules) return 0
  return path.modules.reduce((sum, mod) => sum + (mod?.knowledgePoints?.length ?? 0), 0)
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ensureProgress(project: LearningProject, kpId: string): LearningProgress {
  let prog = project.progress.find((p) => p.knowledgePointId === kpId)
  if (!prog) {
    prog = { knowledgePointId: kpId, status: 'not_started' }
    project.progress.push(prog)
  }
  return prog
}

export function signalsFromProgress(prog: LearningProgress): ProgressSignals {
  return createProgressSignals({
    status: prog.status,
    teachInteractions: prog.teachInteractions ?? 0,
    practicePassCount: prog.practicePassCount ?? 0,
    practiceAttempts: prog.practiceAttempts ?? 0,
    quizScore: prog.quizScore,
    startedAt: prog.startedAt,
    completedAt: prog.completedAt,
  })
}

export function writeSignalsToProgress(prog: LearningProgress, signals: ProgressSignals) {
  prog.status = signals.status
  prog.teachInteractions = signals.teachInteractions
  prog.practicePassCount = signals.practicePassCount
  prog.practiceAttempts = signals.practiceAttempts
  if (typeof signals.quizScore === 'number') prog.quizScore = signals.quizScore
  prog.startedAt = signals.startedAt
  prog.completedAt = signals.completedAt
}

export function getLatestSession(
  project: LearningProject,
  kpId: string,
) {
  const sessions = project.teachingSessions || []
  if (!sessions.length) return undefined
  return [...sessions]
    .filter((s) => s.kpId === kpId)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0]
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string }
  return e.name === 'AbortError' || /abort/i.test(String(e.message || ''))
}

export function listKnowledgePoints(path: LearningPath): KnowledgePoint[] {
  if (!path?.modules) return []
  return path.modules.flatMap((m) => m.knowledgePoints || [])
}

export function findModuleForKp(
  path: LearningPath,
  kpId: string,
): { module: LearningModule; kp: KnowledgePoint } | null {
  for (const mod of path.modules ?? []) {
    const kp = (mod.knowledgePoints ?? []).find((k) => k.id === kpId)
    if (kp) return { module: mod, kp }
  }
  return null
}

export function isDoneStatus(status: string | undefined): boolean {
  return status === 'completed' || status === 'mastered'
}

export function getKnowledgePointProgressFor(
  project: LearningProject,
  kpId: string,
): LearningProgress | undefined {
  return project.progress.find((p) => p.knowledgePointId === kpId)
}

export function normalizeText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

export function isGenerationAborted(err: unknown): boolean {
  return isAbortError(err)
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getTodayPlanDay(project: LearningProject | null | undefined) {
  const plan = project?.studyPlan
  if (!plan?.days?.length) return null
  const key = getTodayKey()
  return plan.days.find((d) => d.date === key) || plan.days[0] || null
}

/** Priority: in_progress -> unfinished today-plan task -> next incomplete KP. */
export type TodayPickReason = 'in_progress' | 'today_plan' | 'next' | 'review'

export type TodayPickResult = {
  kpId: string
  reason: TodayPickReason
  planTaskId?: string
  planTaskTitle?: string
  estimatedMinutes: number
}

export function pickTodayLearningTarget(project: LearningProject): TodayPickResult | null {
  if (!project?.path) return null
  const kps = listKnowledgePoints(project.path)
  if (!kps.length) return null

  const statusOf = (kpId: string) => getKnowledgePointProgressFor(project, kpId)?.status ?? 'not_started'
  const minutesOf = (kpId: string, fallbackMin = 30) => {
    const kp = findKnowledgePoint(project.path, kpId)
    if (kp?.estimatedHours && kp.estimatedHours > 0) return Math.max(10, Math.round(kp.estimatedHours * 60))
    return fallbackMin
  }

  for (const kp of kps) {
    if (statusOf(kp.id) === 'in_progress') {
      return {
        kpId: kp.id,
        reason: 'in_progress',
        estimatedMinutes: minutesOf(kp.id),
      }
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
      return {
        kpId: kp.id,
        reason: 'next',
        estimatedMinutes: minutesOf(kp.id),
      }
    }
  }

  const last = kps[kps.length - 1]
  return {
    kpId: last.id,
    reason: 'review',
    estimatedMinutes: minutesOf(last.id, 20),
  }
}
