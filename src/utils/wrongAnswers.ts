/**
 * Minimal wrong-answer / weak-item queue (no SRS).
 * Pure helpers for store + unit tests.
 */

export type WrongSource = 'quiz' | 'practice' | 'manual'

export type WrongAnswerRecord = {
  id: string
  kpId: string
  source: WrongSource
  score?: number
  maxScore?: number
  note?: string
  createdAt: string
  resolvedAt?: string
  resolveCount?: number
}

export const WRONG_LIMITS = {
  maxRecordsPerProject: 80,
  /** Active unresolved queue soft cap for UI */
  maxActiveShown: 20,
} as const

export function isWrongActive(item: WrongAnswerRecord | null | undefined): boolean {
  return !!item && !item.resolvedAt
}

export function listActiveWrongAnswers(list: WrongAnswerRecord[] | null | undefined): WrongAnswerRecord[] {
  return (list ?? []).filter(isWrongActive)
}

/** One open item per kp - prefer newest active. */
export function latestActiveByKp(list: WrongAnswerRecord[] | null | undefined): Map<string, WrongAnswerRecord> {
  const map = new Map<string, WrongAnswerRecord>()
  const items = listActiveWrongAnswers(list).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  )
  for (const item of items) {
    if (!map.has(item.kpId)) map.set(item.kpId, item)
  }
  return map
}

export function makeWrongId(): string {
  return `wrong-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Record a miss. If an active item for same kp exists, refresh it (keep history id).
 */
export function recordWrongAnswer(
  list: WrongAnswerRecord[] | null | undefined,
  input: {
    kpId: string
    source: WrongSource
    score?: number
    maxScore?: number
    note?: string
    now?: string
  },
): WrongAnswerRecord[] {
  const now = input.now || new Date().toISOString()
  const next = [...(list ?? [])]
  const activeIdx = next.findIndex((w) => w.kpId === input.kpId && !w.resolvedAt)
  if (activeIdx >= 0) {
    const prev = next[activeIdx]
    next[activeIdx] = {
      ...prev,
      source: input.source,
      score: input.score ?? prev.score,
      maxScore: input.maxScore ?? prev.maxScore,
      note: input.note ?? prev.note,
      // bump recency for sorting without losing original createdAt too much
      createdAt: now,
    }
  } else {
    next.unshift({
      id: makeWrongId(),
      kpId: input.kpId,
      source: input.source,
      score: input.score,
      maxScore: input.maxScore,
      note: input.note,
      createdAt: now,
    })
  }
  return trimWrongAnswers(next)
}

/**
 * Resolve active wrong for kp (keep history).
 * mode=pass sets resolvedAt; returns list.
 */
export function resolveWrongAnswer(
  list: WrongAnswerRecord[] | null | undefined,
  kpId: string,
  opts?: { now?: string },
): WrongAnswerRecord[] {
  const now = opts?.now || new Date().toISOString()
  const next = [...(list ?? [])]
  let changed = false
  for (let i = 0; i < next.length; i++) {
    const w = next[i]
    if (w.kpId === kpId && !w.resolvedAt) {
      next[i] = {
        ...w,
        resolvedAt: now,
        resolveCount: (w.resolveCount ?? 0) + 1,
      }
      changed = true
    }
  }
  return changed ? trimWrongAnswers(next) : next
}

export function trimWrongAnswers(list: WrongAnswerRecord[]): WrongAnswerRecord[] {
  if (list.length <= WRONG_LIMITS.maxRecordsPerProject) return list
  // keep all active first, then newest resolved
  const active = list.filter(isWrongActive)
  const resolved = list
    .filter((w) => !isWrongActive(w))
    .sort((a, b) => String(b.resolvedAt || b.createdAt).localeCompare(String(a.resolvedAt || a.createdAt)))
  const room = Math.max(0, WRONG_LIMITS.maxRecordsPerProject - active.length)
  return [...active, ...resolved.slice(0, room)]
}

/** Pick one review kp id for today card (exclude optional primary). */
export function pickReviewWrongKp(
  list: WrongAnswerRecord[] | null | undefined,
  excludeKpId?: string | null,
): WrongAnswerRecord | null {
  const active = listActiveWrongAnswers(list).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  )
  for (const item of active) {
    if (excludeKpId && item.kpId === excludeKpId) continue
    return item
  }
  // if only the primary itself is wrong, still return it
  return active[0] ?? null
}
