/**
 * Credible knowledge-point progress state machine (pure functions).
 * Status stays within existing enum: not_started | in_progress | completed | mastered
 */

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed' | 'mastered'

export const PROGRESS_THRESHOLDS = {
  /** Min teach interactions before practice can promote to completed */
  minTeachForComplete: 1,
  /** Min passed practice items before promote to completed */
  minPracticePassForComplete: 1,
  /** Exercise score / maxScore to count as "passed" */
  practicePassRatio: 0.6,
  /** Quiz % for completed */
  quizComplete: 60,
  /** Quiz % for mastered */
  quizMaster: 80,
} as const

export type ProgressEvent =
  | { type: 'open' }
  | { type: 'teach_interact' }
  | { type: 'practice_result'; passed: boolean }
  | { type: 'quiz_result'; percentage: number }
  | { type: 'manual'; status: ProgressStatus }

export interface ProgressSignals {
  status: ProgressStatus
  teachInteractions: number
  practicePassCount: number
  practiceAttempts: number
  quizScore?: number
  startedAt?: string
  completedAt?: string
}

export function createProgressSignals(
  partial?: Partial<ProgressSignals> & { status?: ProgressStatus },
): ProgressSignals {
  return {
    status: partial?.status ?? 'not_started',
    teachInteractions: partial?.teachInteractions ?? 0,
    practicePassCount: partial?.practicePassCount ?? 0,
    practiceAttempts: partial?.practiceAttempts ?? 0,
    quizScore: partial?.quizScore,
    startedAt: partial?.startedAt,
    completedAt: partial?.completedAt,
  }
}

function ensureStarted(state: ProgressSignals, now: string): ProgressSignals {
  if (state.status === 'not_started') {
    return {
      ...state,
      status: 'in_progress',
      startedAt: state.startedAt || now,
    }
  }
  if (!state.startedAt) {
    return { ...state, startedAt: now }
  }
  return state
}

/** Promote in_progress → completed when teach + practice thresholds met. Never touches mastered. */
function maybePromoteFromPractice(state: ProgressSignals, now: string): ProgressSignals {
  if (state.status === 'mastered' || state.status === 'completed') return state
  if (
    state.teachInteractions >= PROGRESS_THRESHOLDS.minTeachForComplete &&
    state.practicePassCount >= PROGRESS_THRESHOLDS.minPracticePassForComplete
  ) {
    return {
      ...state,
      status: 'completed',
      completedAt: now,
      startedAt: state.startedAt || now,
    }
  }
  return state
}

/**
 * Apply one learning event. Pure: does not mutate input.
 * Opening alone never yields completed/mastered.
 */
export function applyProgressEvent(
  state: ProgressSignals,
  event: ProgressEvent,
  now: string = new Date().toISOString(),
): ProgressSignals {
  let next = { ...state }

  switch (event.type) {
    case 'open': {
      next = ensureStarted(next, now)
      return next
    }
    case 'teach_interact': {
      next = ensureStarted(next, now)
      next.teachInteractions = (next.teachInteractions || 0) + 1
      return maybePromoteFromPractice(next, now)
    }
    case 'practice_result': {
      next = ensureStarted(next, now)
      next.practiceAttempts = (next.practiceAttempts || 0) + 1
      if (event.passed) {
        next.practicePassCount = (next.practicePassCount || 0) + 1
      }
      return maybePromoteFromPractice(next, now)
    }
    case 'quiz_result': {
      next = ensureStarted(next, now)
      next.quizScore = event.percentage
      if (event.percentage >= PROGRESS_THRESHOLDS.quizMaster) {
        next.status = 'mastered'
        next.completedAt = now
      } else if (event.percentage >= PROGRESS_THRESHOLDS.quizComplete) {
        // Do not demote mastered
        if (next.status !== 'mastered') {
          next.status = 'completed'
          next.completedAt = now
        }
      }
      // Failed quiz: keep completed/mastered; only ensure in_progress
      return next
    }
    case 'manual': {
      next.status = event.status
      if (event.status === 'not_started') {
        next.completedAt = undefined
        return next
      }
      next.startedAt = next.startedAt || now
      if (event.status === 'completed' || event.status === 'mastered') {
        next.completedAt = now
      }
      return next
    }
    default:
      return next
  }
}

export function isPracticePassed(score: number, maxScore: number): boolean {
  if (maxScore <= 0) return score > 0
  return score / maxScore >= PROGRESS_THRESHOLDS.practicePassRatio
}

export function progressPercent(state: ProgressSignals): number {
  if (state.status === 'mastered') return 100
  if (state.status === 'completed') return 80
  if (state.status === 'not_started') return 0
  let p = 15
  if ((state.teachInteractions || 0) >= 1) p += 25
  if ((state.practicePassCount || 0) >= 1) p += 25
  if (typeof state.quizScore === 'number') {
    p += Math.min(20, Math.round(state.quizScore * 0.2))
  }
  return Math.min(75, p)
}

export function progressStatusLabel(status?: ProgressStatus | string): string {
  if (status === 'mastered') return '已掌握'
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '学习中'
  return '未开始'
}

export function progressStatusColor(status?: ProgressStatus | string): string {
  if (status === 'mastered') return '#22c3a6'
  if (status === 'completed') return '#3d9cf0'
  if (status === 'in_progress') return '#f0b429'
  return '#7b8aa3'
}

/** One-line hint: how to reach the next status */
export function progressUpgradeHint(state: ProgressSignals): string {
  if (state.status === 'mastered') {
    return '已掌握：可复习笔记，或进入下一个知识点'
  }
  if (state.status === 'completed') {
    return '已完成：自测 ≥80% 可升级为「已掌握」'
  }
  const needTeach = (state.teachInteractions || 0) < PROGRESS_THRESHOLDS.minTeachForComplete
  const needPractice = (state.practicePassCount || 0) < PROGRESS_THRESHOLDS.minPracticePassForComplete
  if (needTeach && needPractice) {
    return '学习中：完成 1 次讲解互动 + 1 道达标练习 → 已完成'
  }
  if (needTeach) {
    return '还差讲解互动：在 AI 讲解里回答一次或点快捷按钮'
  }
  if (needPractice) {
    return '还差练习达标：在练习 Tab 做对至少 1 题（≥60%）'
  }
  return '条件已满足，状态将更新为「已完成」'
}

export type NextStepTab = 'explain' | 'exercise' | 'test' | 'note' | 'doc' | 'video' | 'diagram'

export interface NextStepRecommendation {
  action: 'explain' | 'exercise' | 'test' | 'review' | 'done'
  tab: NextStepTab
  title: string
  detail: string
  cta: string
}

export function recommendNextStep(input: {
  status: ProgressStatus
  teachInteractions: number
  practicePassCount: number
  quizScore?: number
  hasTeacherMessage?: boolean
}): NextStepRecommendation {
  const { status, teachInteractions, practicePassCount, quizScore, hasTeacherMessage } = input

  if (status === 'mastered') {
    return {
      action: 'review',
      tab: 'note',
      title: '已掌握，可以复盘',
      detail: '写一点笔记巩固，或去下一个知识点',
      cta: '去写笔记',
    }
  }

  const taught = teachInteractions >= 1 || !!hasTeacherMessage
  if (!taught) {
    return {
      action: 'explain',
      tab: 'explain',
      title: '开始 AI 讲解',
      detail: '先跟着老师学这一步，再做练习更稳',
      cta: '去讲解',
    }
  }

  if (practicePassCount < 1) {
    return {
      action: 'exercise',
      tab: 'exercise',
      title: '去做练习',
      detail: '至少完成 1 道达标题（得分 ≥60%），巩固理解',
      cta: '去练习',
    }
  }

  if (quizScore === undefined || quizScore < PROGRESS_THRESHOLDS.quizMaster) {
    const failed = typeof quizScore === 'number' && quizScore < PROGRESS_THRESHOLDS.quizComplete
    return {
      action: 'test',
      tab: 'test',
      title: failed ? '再测一次' : '去做自测',
      detail: failed
        ? '上次未过线，自测 ≥60% 完成，≥80% 掌握'
        : '自测 ≥80% 可标记为「已掌握」',
      cta: '去自测',
    }
  }

  return {
    action: 'done',
    tab: 'explain',
    title: '本点学习目标已达成',
    detail: '可以进入下一个知识点继续',
    cta: '查看讲解',
  }
}
