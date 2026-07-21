/**
 * Local persistence slim/trim policies for AI Learning OS.
 * Pure helpers — safe to unit-test in Node without Vue.
 */

export const STORAGE_LIMITS = {
  /** Keep at most this many sessions per project after ranking by recency */
  maxSessionsPerProject: 24,
  /** Per knowledge point, keep only the latest N sessions */
  maxSessionsPerKp: 2,
  /** Last N messages inside a session (≈ N/2 轮对话) */
  maxMessagesPerSession: 20,
  /** Hard cap for a single message body when persisting */
  maxMessageChars: 3500,
  maxDailySummaries: 45,
  maxNotesChars: 2000,
  maxDocChars: 8000,
  maxDiagramsPerKp: 4,
  maxDiagramCodeChars: 2000,
  maxExercisesPerKp: 12,
  maxWrongAnswers: 80,
  /** Soft warn threshold (~4MB of JSON) */
  softByteBudget: 3_500_000,
} as const

export type SlimLevel = 'normal' | 'aggressive' | 'critical'

export interface SlimTeachingMessage {
  id: string
  role: 'teacher' | 'student'
  content: string
  displayContent?: string
  type: string
  timestamp: string
}

export interface SlimTeachingSession {
  id: string
  kpId: string
  messages: SlimTeachingMessage[]
  currentStep: string
  studentAnswer?: string
  score?: number
  createdAt: string
  updatedAt: string
}

export interface SlimProgress {
  knowledgePointId: string
  status: string
  startedAt?: string
  completedAt?: string
  notes?: string
  quizScore?: number
  practiceAttempts?: number
  teachInteractions?: number
  practicePassCount?: number
  exercises?: unknown[]
  generatedDocs?: string
  generatedDiagrams?: { type: string; code: string; caption: string }[]
  [key: string]: unknown
}

export interface SlimProject {
  id: string
  name?: string
  domain?: string
  path?: unknown
  progress?: SlimProgress[]
  currentKnowledgePointId?: string
  studyPlan?: unknown
  dailySummaries?: { date?: string; [k: string]: unknown }[]
  teachingSessions?: SlimTeachingSession[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function limitsFor(level: SlimLevel) {
  if (level === 'critical') {
    return {
      maxSessionsPerProject: 8,
      maxSessionsPerKp: 1,
      maxMessagesPerSession: 8,
      maxMessageChars: 1200,
      maxDailySummaries: 7,
      maxNotesChars: 500,
      maxDocChars: 0,
      maxDiagramsPerKp: 0,
      maxDiagramCodeChars: 0,
      maxExercisesPerKp: 0,
      stripDocs: true as const,
      stripDiagrams: true as const,
      stripExercises: true as const,
      stripStudyPlan: false as const,
    }
  }
  if (level === 'aggressive') {
    return {
      maxSessionsPerProject: 12,
      maxSessionsPerKp: 1,
      maxMessagesPerSession: 12,
      maxMessageChars: 2000,
      maxDailySummaries: 14,
      maxNotesChars: 1000,
      maxDocChars: 0,
      maxDiagramsPerKp: 0,
      maxDiagramCodeChars: 0,
      maxExercisesPerKp: 5,
      stripDocs: true as const,
      stripDiagrams: true as const,
      stripExercises: false as const,
      stripStudyPlan: false as const,
    }
  }
  return {
    maxSessionsPerProject: STORAGE_LIMITS.maxSessionsPerProject,
    maxSessionsPerKp: STORAGE_LIMITS.maxSessionsPerKp,
    maxMessagesPerSession: STORAGE_LIMITS.maxMessagesPerSession,
    maxMessageChars: STORAGE_LIMITS.maxMessageChars,
    maxDailySummaries: STORAGE_LIMITS.maxDailySummaries,
    maxNotesChars: STORAGE_LIMITS.maxNotesChars,
    maxDocChars: STORAGE_LIMITS.maxDocChars,
    maxDiagramsPerKp: STORAGE_LIMITS.maxDiagramsPerKp,
    maxDiagramCodeChars: STORAGE_LIMITS.maxDiagramCodeChars,
    maxExercisesPerKp: STORAGE_LIMITS.maxExercisesPerKp,
    stripDocs: false as const,
    stripDiagrams: false as const,
    stripExercises: false as const,
    stripStudyPlan: false as const,
  }
}

export function truncateText(text: string, maxChars: number, suffix = '\n\n…(已截断以节省本地空间)'): string {
  if (!text || maxChars <= 0) return maxChars <= 0 ? '' : text
  if (text.length <= maxChars) return text
  const keep = Math.max(0, maxChars - suffix.length)
  return text.slice(0, keep) + suffix
}

export function slimMessage(
  msg: SlimTeachingMessage,
  maxChars: number = STORAGE_LIMITS.maxMessageChars,
): SlimTeachingMessage {
  return {
    ...msg,
    content: truncateText(String(msg.content || ''), maxChars),
    displayContent:
      typeof msg.displayContent === 'string'
        ? truncateText(msg.displayContent, Math.min(200, maxChars))
        : msg.displayContent,
  }
}

/**
 * Keep latest sessions per KP, then cap project total; trim messages per session.
 */
export function pruneTeachingSessions(
  sessions: SlimTeachingSession[] | undefined,
  level: SlimLevel = 'normal',
): SlimTeachingSession[] {
  const lim = limitsFor(level)
  const list = Array.isArray(sessions) ? sessions.slice() : []
  if (!list.length) return []

  const byKp = new Map<string, SlimTeachingSession[]>()
  for (const s of list) {
    if (!s || !s.kpId) continue
    const arr = byKp.get(s.kpId) || []
    arr.push(s)
    byKp.set(s.kpId, arr)
  }

  const picked: SlimTeachingSession[] = []
  for (const [, group] of byKp) {
    group
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
      .slice(0, lim.maxSessionsPerKp)
      .forEach((session) => {
        const messages = Array.isArray(session.messages)
          ? session.messages.slice(-lim.maxMessagesPerSession).map((m) => slimMessage(m, lim.maxMessageChars))
          : []
        picked.push({
          ...session,
          messages,
          studentAnswer:
            typeof session.studentAnswer === 'string'
              ? truncateText(session.studentAnswer, Math.min(800, lim.maxMessageChars))
              : session.studentAnswer,
        })
      })
  }

  return picked
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, lim.maxSessionsPerProject)
}

export function slimProgressItem(prog: SlimProgress, level: SlimLevel = 'normal'): SlimProgress {
  const lim = limitsFor(level)
  const next: SlimProgress = { ...prog }

  if (typeof next.notes === 'string') {
    next.notes = truncateText(next.notes, lim.maxNotesChars)
  }

  if (lim.stripDocs || lim.maxDocChars <= 0) {
    delete next.generatedDocs
  } else if (typeof next.generatedDocs === 'string') {
    next.generatedDocs = truncateText(next.generatedDocs, lim.maxDocChars)
  }

  if (lim.stripDiagrams || lim.maxDiagramsPerKp <= 0) {
    delete next.generatedDiagrams
  } else if (Array.isArray(next.generatedDiagrams)) {
    next.generatedDiagrams = next.generatedDiagrams.slice(0, lim.maxDiagramsPerKp).map((d) => ({
      type: String(d?.type || 'mermaid'),
      caption: truncateText(String(d?.caption || ''), 200),
      code: truncateText(String(d?.code || ''), lim.maxDiagramCodeChars, '\n%% truncated'),
    }))
  }

  if (lim.stripExercises || lim.maxExercisesPerKp <= 0) {
    delete next.exercises
  } else if (Array.isArray(next.exercises)) {
    next.exercises = next.exercises.slice(0, lim.maxExercisesPerKp)
  }

  return next
}

export function pruneProjectData<T extends SlimProject>(project: T, level: SlimLevel = 'normal'): T {
  const lim = limitsFor(level)
  const summaries = [...(project.dailySummaries ?? [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, lim.maxDailySummaries)

  const base = {
    ...project,
    teachingSessions: pruneTeachingSessions(project.teachingSessions as SlimTeachingSession[] | undefined, level),
    dailySummaries: summaries,
    progress: Array.isArray(project.progress)
      ? project.progress.map((p) => slimProgressItem(p as SlimProgress, level))
      : [],
    studyPlan: lim.stripStudyPlan ? undefined : project.studyPlan,
  } as T
  return slimWrongAnswers(base, STORAGE_LIMITS.maxWrongAnswers)
}

export function pruneProjectsData<T extends SlimProject>(list: T[], level: SlimLevel = 'normal'): T[] {
  const arr = Array.isArray(list) ? list : []
  if (level === 'critical' && arr.length > 3) {
    // Prefer projects with more recent updatedAt
    const ranked = arr
      .slice()
      .sort((a, b) => new Date(String(b.updatedAt || 0)).getTime() - new Date(String(a.updatedAt || 0)).getTime())
    const keepIds = new Set(ranked.slice(0, 3).map((p) => p.id))
    return arr
      .filter((p) => keepIds.has(p.id))
      .map((p) => pruneProjectData(p, level))
  }
  return arr.map((p) => pruneProjectData(p, level))
}

export function estimateJsonBytes(value: unknown): number {
  try {
    // Blob may be missing in some Node versions without polyfill
    if (typeof Blob !== 'undefined') {
      return new Blob([JSON.stringify(value)]).size
    }
  } catch {
    /* fall through */
  }
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

export function needsSoftPrune(value: unknown, budget = STORAGE_LIMITS.softByteBudget): boolean {
  return estimateJsonBytes(value) > budget
}

export const QUOTA_TOAST = {
  full: '本地存储已满。已尝试压缩数据；请尽快「导出备份」，再删除不用的旧项目。',
  compacted: '已自动压缩本地数据以腾出空间。建议立刻导出备份，避免进度丢失。',
  critical: '存储严重不足，已仅保留最近项目与关键进度。请导出备份后清理旧项目。',
  failed: '本地存储已满且无法继续保存。请导出备份或删除旧项目后再试。',
} as const


/** Cap wrong-answer history on a project snapshot. */
export function slimWrongAnswers<T extends SlimProject>(
  project: T,
  max = STORAGE_LIMITS.maxWrongAnswers,
): T {
  const list = project.wrongAnswers
  if (!Array.isArray(list) || list.length <= max) return project
  const active = list.filter((w) => !w.resolvedAt)
  const resolved = list
    .filter((w) => !!w.resolvedAt)
    .sort((a, b) => String(b.resolvedAt || b.createdAt || '').localeCompare(String(a.resolvedAt || a.createdAt || '')))
  const room = Math.max(0, max - active.length)
  return {
    ...project,
    wrongAnswers: [...active, ...resolved.slice(0, room)],
  } as T
}
