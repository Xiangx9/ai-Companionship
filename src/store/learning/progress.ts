/**
 * Progress / continue / stats / weak-queue actions for learning store.
 */
import type { ComputedRef, Ref } from 'vue'
import type { LearningProject, LearningProgress, WrongAnswerItem } from '@/types/learning'
import {
  recordWrongAnswer as pushWrongAnswer,
  resolveWrongAnswer as markWrongResolved,
  listActiveWrongAnswers,
  pickReviewWrongKp,
  latestActiveByKp,
  type WrongSource,
} from '@/utils/wrongAnswers'
import {
  applyProgressEvent,
  isPracticePassed,
  type ProgressEvent,
} from '@/utils/progressState'
import {
  ensureProgress,
  signalsFromProgress,
  writeSignalsToProgress,
  listKnowledgePoints,
  findModuleForKp,
  isDoneStatus,
  getKnowledgePointProgressFor,
  normalizeText,
  getTodayKey,
  getTodayPlanDay,
  findKnowledgePoint,
  pickTodayLearningTarget,
  type TodayPickReason,
} from './helpers'

export type ProgressApiDeps = {
  projects: Ref<LearningProject[]>
  activeProject: ComputedRef<LearningProject | undefined>
  persist: () => void
}

export function createProgressApi(deps: ProgressApiDeps) {
  const { projects, activeProject, persist } = deps

  function applyKpProgressEvent(kpId: string, event: ProgressEvent) {
    const project = activeProject.value
    if (!project) return null
    const prog = ensureProgress(project, kpId)
    const next = applyProgressEvent(signalsFromProgress(prog), event)
    writeSignalsToProgress(prog, next)
    project.currentKnowledgePointId = kpId
    project.updatedAt = new Date().toISOString()
    persist()
    return { status: prog.status, progress: prog }
  }

  function getContinueTarget(projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project?.path) return null

    const kps = listKnowledgePoints(project.path)
    if (!kps.length) return null

    const pick = (kpId: string) => {
      const found = findModuleForKp(project.path, kpId)
      if (!found) return null
      return {
        projectId: project.id,
        projectName: project.name,
        kpId: found.kp.id,
        kpTitle: found.kp.title,
        moduleId: found.module.id,
        moduleTitle: found.module.title,
        moduleIcon: found.module.icon,
        status: getKnowledgePointProgressFor(project, found.kp.id)?.status ?? 'not_started',
      }
    }

    if (project.currentKnowledgePointId) {
      const current = pick(project.currentKnowledgePointId)
      if (current && !isDoneStatus(current.status)) return current
    }

    for (const kp of kps) {
      const st = getKnowledgePointProgressFor(project, kp.id)?.status
      if (st === 'in_progress') return pick(kp.id)
    }

    for (const kp of kps) {
      const st = getKnowledgePointProgressFor(project, kp.id)?.status
      if (!isDoneStatus(st)) return pick(kp.id)
    }

    // all done: return last KP as review target
    const last = kps[kps.length - 1]
    return last ? pick(last.id) : null
  }

  function getNextKnowledgePoint(kpId: string, projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project?.path) return null
    const kps = listKnowledgePoints(project.path)
    const idx = kps.findIndex((k) => k.id === kpId)
    if (idx < 0) return null

    for (let i = idx + 1; i < kps.length; i++) {
      const st = getKnowledgePointProgressFor(project, kps[i].id)?.status
      if (!isDoneStatus(st)) {
        const found = findModuleForKp(project.path, kps[i].id)
        if (!found) continue
        return {
          projectId: project.id,
          kpId: found.kp.id,
          kpTitle: found.kp.title,
          moduleId: found.module.id,
          moduleTitle: found.module.title,
          moduleIcon: found.module.icon,
          status: st ?? 'not_started',
        }
      }
    }
    return null
  }

  function markKnowledgePointStarted(kpId: string) {
    const project = activeProject.value
    if (!project) return
    const prog = ensureProgress(project, kpId)
    if (prog.status === 'not_started') {
      applyKpProgressEvent(kpId, { type: 'open' })
    } else if (project.currentKnowledgePointId !== kpId) {
      project.currentKnowledgePointId = kpId
      project.updatedAt = new Date().toISOString()
      persist()
    }
  }

  function applyQuizResult(kpId: string, percentage: number) {
    const project = activeProject.value
    if (!project) return null
    applyKpProgressEvent(kpId, { type: 'quiz_result', percentage })
    if (percentage < 70) {
      recordWrongAnswer(kpId, {
        source: 'quiz',
        score: percentage,
        maxScore: 100,
        note: '测试未达标',
      })
    } else {
      resolveWrongAnswer(kpId)
    }
    return {
      status: ensureProgress(project, kpId).status,
      next: getNextKnowledgePoint(kpId, project.id),
    }
  }

  function completeAndGetNext(
    kpId: string,
    status: 'completed' | 'mastered' = 'completed',
  ) {
    const project = activeProject.value
    if (!project) return null

    applyKpProgressEvent(kpId, { type: 'manual', status })
    const next = getNextKnowledgePoint(kpId, project.id)
    project.currentKnowledgePointId = next?.kpId ?? kpId
    project.updatedAt = new Date().toISOString()
    persist()

    return {
      status: ensureProgress(project, kpId).status,
      next,
    }
  }

  
  function ensureWrongList(project: LearningProject): WrongAnswerItem[] {
    if (!Array.isArray(project.wrongAnswers)) project.wrongAnswers = []
    return project.wrongAnswers
  }

  function recordWrongAnswer(
    kpId: string,
    opts: {
      source: WrongSource
      score?: number
      maxScore?: number
      note?: string
    },
  ) {
    const project = activeProject.value
    if (!project || !kpId) return null
    project.wrongAnswers = pushWrongAnswer(ensureWrongList(project), {
      kpId,
      source: opts.source,
      score: opts.score,
      maxScore: opts.maxScore,
      note: opts.note,
    }) as WrongAnswerItem[]
    project.updatedAt = new Date().toISOString()
    persist()
    return listActiveWrongAnswers(project.wrongAnswers)
  }

  function resolveWrongAnswer(kpId: string) {
    const project = activeProject.value
    if (!project || !kpId) return false
    const before = listActiveWrongAnswers(project.wrongAnswers).length
    project.wrongAnswers = markWrongResolved(project.wrongAnswers as WrongAnswerItem[] | undefined, kpId) as WrongAnswerItem[]
    const after = listActiveWrongAnswers(project.wrongAnswers).length
    if (after !== before) {
      project.updatedAt = new Date().toISOString()
      persist()
      return true
    }
    return false
  }

  function getWrongAnswerQueue(projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project?.path) return []

    const activeMap = latestActiveByKp(project.wrongAnswers as WrongAnswerItem[] | undefined)
    const items = [...activeMap.values()].map((w) => {
      const found = findModuleForKp(project.path, w.kpId)
      const prog = getKnowledgePointProgressFor(project, w.kpId)
      return {
        id: w.id,
        kpId: w.kpId,
        kpTitle: found?.kp.title ?? w.kpId,
        moduleId: found?.module.id ?? '',
        moduleTitle: found?.module.title ?? '',
        moduleIcon: found?.module.icon ?? '',
        source: w.source,
        score: typeof w.score === 'number' ? w.score : null,
        maxScore: typeof w.maxScore === 'number' ? w.maxScore : null,
        note: w.note || '',
        createdAt: w.createdAt,
        status: prog?.status ?? 'not_started',
        reason:
          w.source === 'quiz'
            ? '测试答错'
            : w.source === 'practice'
              ? '练习未过'
              : '手动加入',
        priority: typeof w.score === 'number' ? w.score : 40,
      }
    })
    return items.sort((a, b) => {
      const as = a.score ?? a.priority
      const bs = b.score ?? b.priority
      if (as !== bs) return as - bs
      return String(b.createdAt).localeCompare(String(a.createdAt))
    })
  }

function getWeakPointQueue(projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project?.path) return []

    type WeakItem = {
      kpId: string
      kpTitle: string
      moduleId: string
      moduleTitle: string
      moduleIcon: string
      quizScore: number | null
      status: LearningProgress['status']
      reason: string
      priority: number
    }

    const map = new Map<string, WeakItem>()
    const kps = listKnowledgePoints(project.path)

    // merge wrong-answer queue
    for (const w of getWrongAnswerQueue(project.id)) {
      map.set(w.kpId, {
        kpId: w.kpId,
        kpTitle: w.kpTitle,
        moduleId: w.moduleId,
        moduleTitle: w.moduleTitle,
        moduleIcon: w.moduleIcon,
        quizScore: w.score,
        status: w.status as LearningProgress['status'],
        reason: w.reason,
        priority: w.priority,
      })
    }


    for (const kp of kps) {
      const found = findModuleForKp(project.path, kp.id)
      if (!found) continue
      const prog = getKnowledgePointProgressFor(project, kp.id)
      const score = typeof prog?.quizScore === 'number' ? prog.quizScore : null
      if (!map.has(kp.id) && score !== null && score < 70) {
        map.set(kp.id, {
          kpId: kp.id,
          kpTitle: kp.title,
          moduleId: found.module.id,
          moduleTitle: found.module.title,
          moduleIcon: found.module.icon,
          quizScore: score,
          status: prog?.status ?? 'not_started',
          reason: score < 60 ? '测试未通过' : '掌握不稳',
          priority: score,
        })
      }
    }

    // Map recent report weakPoints text back to KP titles when possible
    const recent = [...(project.dailySummaries ?? [])]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5)

    for (const summary of recent) {
      for (const weak of summary.weakPoints ?? []) {
        const weakNorm = normalizeText(String(weak || ''))
        if (!weakNorm) continue
        for (const kp of kps) {
          const titleNorm = normalizeText(kp.title)
          if (!titleNorm) continue
          if (weakNorm.includes(titleNorm) || titleNorm.includes(weakNorm)) {
            const found = findModuleForKp(project.path, kp.id)
            if (!found) continue
            const existing = map.get(kp.id)
            if (existing) {
              if (!existing.reason.includes('报告')) {
                existing.reason = existing.reason + ' · 报告提及'
              }
            } else {
              const prog = getKnowledgePointProgressFor(project, kp.id)
              map.set(kp.id, {
                kpId: kp.id,
                kpTitle: kp.title,
                moduleId: found.module.id,
                moduleTitle: found.module.title,
                moduleIcon: found.module.icon,
                quizScore: typeof prog?.quizScore === 'number' ? prog.quizScore : null,
                status: prog?.status ?? 'not_started',
                reason: '报告提及薄弱点',
                priority: typeof prog?.quizScore === 'number' ? prog.quizScore : 50,
              })
            }
          }
        }
      }
    }

    return [...map.values()].sort((a, b) => {
      const as = a.quizScore ?? a.priority
      const bs = b.quizScore ?? b.priority
      if (as !== bs) return as - bs
      return a.kpTitle.localeCompare(b.kpTitle, 'zh')
    })
  }

  function getProjectCardStats(projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project) return null

    const stats = getProjectLearningStats(project.id)
    const weakQueue = getWeakPointQueue(project.id)
    const continueTarget = getContinueTarget(project.id)

    // lightweight streak from summaries for project cards
    const dates = [...new Set((project.dailySummaries ?? []).map((s) => s.date))].sort()
    let streak = 0
    if (dates.length) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (let i = dates.length - 1; i >= 0; i--) {
        const d = new Date(dates[i] + 'T00:00:00')
        d.setHours(0, 0, 0, 0)
        const expected = new Date(today)
        expected.setDate(expected.getDate() - streak)
        if (d.getTime() === expected.getTime()) streak++
        else break
      }
    }

    return {
      ...stats,
      weakCount: weakQueue.length,
      weakTop: weakQueue.slice(0, 3),
      continueTarget,
      streakDays: streak,
    }
  }

  function togglePlanTask(dayNumber: number, taskId: string, completed?: boolean) {
    const project = activeProject.value
    if (!project?.studyPlan) return false
    const day = project.studyPlan.days.find((d) => d.dayNumber === dayNumber)
    if (!day) return false
    const task = day.tasks.find((t) => t.id === taskId)
    if (!task) return false

    const done = new Set(day.completedTasks ?? [])
    const shouldComplete = completed ?? !done.has(taskId)
    if (shouldComplete) done.add(taskId)
    else done.delete(taskId)
    day.completedTasks = [...done]

    // keep KP progress loosely in sync for learn/practice tasks
    if (task.kpId) {
      const prog = ensureProgress(project, task.kpId)
      if (shouldComplete) {
        if (prog.status === 'not_started') {
          prog.status = 'in_progress'
          prog.startedAt = new Date().toISOString()
        }
        if (task.type === 'test' || task.type === 'practice') {
          // completing a practice/test task marks completed unless already mastered
          if (prog.status !== 'mastered') {
            prog.status = 'completed'
            prog.completedAt = new Date().toISOString()
          }
        }
      }
    }

    project.studyPlan.updatedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()
    persist()
    return true
  }

  function getProjectLearningStats(projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project) return null

    const kps = listKnowledgePoints(project.path)
    const progressMap = new Map(project.progress.map((p) => [p.knowledgePointId, p]))
    let completed = 0
    let inProgress = 0
    let mastered = 0
    for (const kp of kps) {
      const st = progressMap.get(kp.id)?.status
      if (st === 'mastered') { mastered++; completed++ }
      else if (st === 'completed') completed++
      else if (st === 'in_progress') inProgress++
    }

    const today = getTodayKey()
    const completedToday = project.progress.filter((p) => p.completedAt && p.completedAt.startsWith(today))
    const planDay = getTodayPlanDay(project)
    const planTotal = planDay?.tasks?.length ?? 0
    const planDone = planDay?.completedTasks?.length ?? 0

    return {
      projectId: project.id,
      totalKp: kps.length,
      completed,
      mastered,
      inProgress,
      overallPercent: kps.length ? Math.round(((completed + inProgress * 0.5) / kps.length) * 100) : 0,
      completedTodayCount: completedToday.length,
      completedTodayTitles: completedToday.map((p) => findKnowledgePoint(project.path, p.knowledgePointId)?.title ?? p.knowledgePointId),
      planDay,
      planTotal,
      planDone,
      planPercent: planTotal ? Math.round((planDone / planTotal) * 100) : 0,
      continueTarget: getContinueTarget(project.id),
    }
  }

  function getLatestContinueProject() {
    const sorted = [...projects.value].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime(),
    )
    for (const p of sorted) {
      const target = getContinueTarget(p.id)
      if (target) return { project: p, target }
    }
    return null
  }

  function updateKnowledgePointProgress(kpId: string, status: LearningProgress['status']) {
    applyKpProgressEvent(kpId, { type: 'manual', status })
  }

  function recordTeachInteraction(kpId: string) {
    return applyKpProgressEvent(kpId, { type: 'teach_interact' })
  }

  function recordPracticeResult(kpId: string, score: number, maxScore: number) {
    const passed = isPracticePassed(score, maxScore)
    const result = applyKpProgressEvent(kpId, {
      type: 'practice_result',
      passed,
    })
    if (!passed) {
      recordWrongAnswer(kpId, {
        source: 'practice',
        score,
        maxScore,
        note: '练习未达标',
      })
    } else {
      // practice pass down-weights / clears active wrong for this KP
      resolveWrongAnswer(kpId)
    }
    return result
  }

  function saveNotes(kpId: string, notes: string) {
    const project = activeProject.value
    if (!project) return
    const prog = ensureProgress(project, kpId)
    prog.notes = notes
    project.updatedAt = new Date().toISOString()
    persist()
  }

  function getKnowledgePointProgress(kpId: string): LearningProgress | undefined {
    const project = activeProject.value
    if (!project) return undefined
    return project.progress.find((p) => p.knowledgePointId === kpId)
  }

  function setCurrentKnowledgePoint(kpId: string) {
    const project = activeProject.value
    if (!project) return
    project.currentKnowledgePointId = kpId
    const prog = ensureProgress(project, kpId)
    if (prog.status === 'not_started') {
      applyKpProgressEvent(kpId, { type: 'open' })
      return
    }
    project.updatedAt = new Date().toISOString()
    persist()
  }


  function reasonLabel(reason: TodayPickReason) {
    if (reason === 'in_progress') return '进行中'
    if (reason === 'today_plan') return '今日计划'
    if (reason === 'review') return '复习巩固'
    return '下一步'
  }

  function statusLabel(status: LearningProgress['status'] | string) {
    if (status === 'in_progress') return '学习中'
    if (status === 'completed') return '已完成'
    if (status === 'mastered') return '已掌握'
    return '未开始'
  }

  /** Today learning card payload for Home / project page. */
  function getTodayLearningCard(projectId?: string | null) {
    const project = projectId
      ? projects.value.find((p) => p.id === projectId)
      : activeProject.value
    if (!project?.path) return null

    const pick = pickTodayLearningTarget(project)
    if (!pick) return null

    const found = findModuleForKp(project.path, pick.kpId)
    if (!found) return null

    const status = getKnowledgePointProgressFor(project, found.kp.id)?.status ?? 'not_started'
    const planDay = getTodayPlanDay(project)
    const planTotal = planDay?.tasks?.length ?? 0
    const planDone = planDay?.completedTasks?.length ?? 0
    const today = getTodayKey()
    const completedTodayCount = project.progress.filter(
      (p) => p.completedAt && p.completedAt.startsWith(today),
    ).length

    const reviewWrong = pickReviewWrongKp(project.wrongAnswers as WrongAnswerItem[] | undefined, found.kp.id)
    let reviewItem: null | {
      kpId: string
      kpTitle: string
      moduleId: string
      moduleTitle: string
      moduleIcon: string
      reasonLabel: string
      score: number | null
    } = null
    if (reviewWrong) {
      const rf = findModuleForKp(project.path, reviewWrong.kpId)
      if (rf) {
        reviewItem = {
          kpId: rf.kp.id,
          kpTitle: rf.kp.title,
          moduleId: rf.module.id,
          moduleTitle: rf.module.title,
          moduleIcon: rf.module.icon,
          reasonLabel: '复习错题',
          score: typeof reviewWrong.score === 'number' ? reviewWrong.score : null,
        }
      }
    }

    return {
      projectId: project.id,
      projectName: project.name,
      kpId: found.kp.id,
      kpTitle: found.kp.title,
      kpDescription: found.kp.description,
      moduleId: found.module.id,
      moduleTitle: found.module.title,
      moduleIcon: found.module.icon,
      status,
      statusLabel: statusLabel(status),
      reason: pick.reason,
      reasonLabel: reasonLabel(pick.reason),
      estimatedMinutes: pick.estimatedMinutes,
      estimatedHours: Number((pick.estimatedMinutes / 60).toFixed(1)),
      planTaskId: pick.planTaskId,
      planTaskTitle: pick.planTaskTitle,
      planDone,
      planTotal,
      planPercent: planTotal ? Math.round((planDone / planTotal) * 100) : 0,
      completedTodayCount,
      isAllDone: pick.reason === 'review' && isDoneStatus(status),
      wrongCount: listActiveWrongAnswers(project.wrongAnswers as WrongAnswerItem[] | undefined).length,
      reviewItem,
    }
  }

  return {
    applyKpProgressEvent,
    getContinueTarget,
    getTodayLearningCard,
    getNextKnowledgePoint,
    markKnowledgePointStarted,
    applyQuizResult,
    completeAndGetNext,
    getWeakPointQueue,
    getWrongAnswerQueue,
    recordWrongAnswer,
    resolveWrongAnswer,
    getProjectCardStats,
    togglePlanTask,
    getProjectLearningStats,
    getLatestContinueProject,
    updateKnowledgePointProgress,
    recordTeachInteraction,
    recordPracticeResult,
    saveNotes,
    getKnowledgePointProgress,
    setCurrentKnowledgePoint,
  }
}
