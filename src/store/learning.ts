// AI Learning OS - 学习 Store
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  LearningProject,
  LearningProgress,
  LearningPath,
  Exercise,
  KnowledgePoint,
  LearningModule,
  ExportFormat,
  ExportData,
  TeachingSession,
  TeachingMessage,
} from '@/types/learning'
import {
  generateLearningPath,
  generateStudyPlan,
  teachKnowledgePoint,
  generateExercises,
  gradeSubmission,
  generateDailySummary,
  generateKnowledgeDoc,
  generateMermaidDiagram,
  chatCompletion,
} from '@/services/aiEngine'
import { parseAndValidateAiJson } from '@/utils/aiJson'
import { safeGetJson, safeSetJson, StorageQuotaError } from '@/utils/storage'
import { toastError, toastWarning } from '@/utils/toast'

export const useLearningStore = defineStore('learning', () => {
  // ==================== State ====================
  const projects = ref<LearningProject[]>([])
  const activeProjectId = ref<string | null>(null)
  const generating = ref(false)
  const generateProgress = ref('')
  const generateError = ref('')
  const generationController = ref<AbortController | null>(null)

  // ==================== Computed ====================
  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeProjectId.value),
  )

  const overallProgress = computed(() => {
    const p = activeProject.value
    if (!p) return 0
    const total = countKnowledgePoints(p.path)
    if (total === 0) return 0
    const completed = p.progress.filter((pr) => pr.status === 'completed' || pr.status === 'mastered').length
    return Math.round((completed / total) * 100)
  })

  const streakDays = computed(() => {
    const summaries = activeProject.value?.dailySummaries ?? []
    if (summaries.length === 0) return 0
    const dates = [...new Set(summaries.map((s) => s.date))].sort()
    if (dates.length === 0) return 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let consecutive = 0
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = new Date(dates[i] + 'T00:00:00')
      d.setHours(0, 0, 0, 0)
      const expected = new Date(today)
      expected.setDate(expected.getDate() - consecutive)
      if (d.getTime() === expected.getTime()) {
        consecutive++
      } else {
        break
      }
    }
    return consecutive
  })

  const totalLearnedHours = computed(() => {
    const p = activeProject.value
    if (!p) return 0
    return p.progress.reduce((sum, pr) => {
      const kp = findKnowledgePoint(p.path, pr.knowledgePointId)
      return sum + (pr.status === 'completed' || pr.status === 'mastered' ? kp?.estimatedHours ?? 0 : 0)
    }, 0)
  })

  // ==================== Helpers ====================
  function findKnowledgePoint(path: LearningPath, kpId: string): KnowledgePoint | undefined {
    for (const mod of path.modules) {
      const kp = mod.knowledgePoints.find((k) => k.id === kpId)
      if (kp) return kp
    }
    return undefined
  }

  function countKnowledgePoints(path: LearningPath): number {
    if (!path?.modules) return 0
    return path.modules.reduce((sum, mod) => sum + (mod?.knowledgePoints?.length ?? 0), 0)
  }

  function uid(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function ensureProgress(project: LearningProject, kpId: string): LearningProgress {
    let prog = project.progress.find((p) => p.knowledgePointId === kpId)
    if (!prog) {
      prog = { knowledgePointId: kpId, status: 'not_started' }
      project.progress.push(prog)
    }
    return prog
  }

  function getLatestSession(project: LearningProject, kpId: string): TeachingSession | undefined {
    const sessions = project.teachingSessions
      .filter((s) => s.kpId === kpId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return sessions[0]
  }

  function isAbortError(err: unknown): boolean {
    if (!err) return false
    if (typeof err === 'object' && (err as { code?: string }).code === 'aborted') return true
    const msg = err instanceof Error ? err.message : String(err)
    return /aborted|AbortError|已取消|取消/i.test(msg)
  }

  function beginGeneration(progressText: string) {
    // cancel any previous long-running generation first
    if (generationController.value) {
      generationController.value.abort()
    }
    const controller = new AbortController()
    generationController.value = controller
    generating.value = true
    generateProgress.value = progressText
    generateError.value = ''
    return controller
  }

  function endGeneration(controller?: AbortController | null) {
    if (controller && generationController.value === controller) {
      generationController.value = null
    } else if (!controller) {
      generationController.value = null
    }
    generating.value = false
    generateProgress.value = '已取消'
  }

  function cancelGeneration() {
    const controller = generationController.value
    if (!controller) return false
    controller.abort()
    generateProgress.value = '已取消'
    generateError.value = ''
    generating.value = false
    generationController.value = null
    return true
  }

  function listKnowledgePoints(path: LearningPath): KnowledgePoint[] {
    if (!path?.modules) return []
    return path.modules.flatMap((mod) =>
      [...(mod.knowledgePoints ?? [])].sort((a, b) => a.order - b.order),
    )
  }

  function findModuleForKp(path: LearningPath, kpId: string): { module: LearningModule; kp: KnowledgePoint } | null {
    for (const mod of path.modules ?? []) {
      const kp = (mod.knowledgePoints ?? []).find((k) => k.id === kpId)
      if (kp) return { module: mod, kp }
    }
    return null
  }

  function isDoneStatus(status?: LearningProgress['status']) {
    return status === 'completed' || status === 'mastered'
  }

  /** Prefer current KP, else first in_progress, else first incomplete. */
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

  function getKnowledgePointProgressFor(project: LearningProject, kpId: string): LearningProgress | undefined {
    return project.progress.find((p) => p.knowledgePointId === kpId)
  }

  function markKnowledgePointStarted(kpId: string) {
    const project = activeProject.value
    if (!project) return
    const prog = ensureProgress(project, kpId)
    if (prog.status === 'not_started') {
      prog.status = 'in_progress'
      prog.startedAt = new Date().toISOString()
      project.currentKnowledgePointId = kpId
      project.updatedAt = new Date().toISOString()
      persist()
    } else if (project.currentKnowledgePointId !== kpId) {
      project.currentKnowledgePointId = kpId
      project.updatedAt = new Date().toISOString()
      persist()
    }
  }

  function applyQuizResult(kpId: string, percentage: number) {
    const project = activeProject.value
    if (!project) return null
    const prog = ensureProgress(project, kpId)
    prog.quizScore = percentage
    prog.practiceAttempts = (prog.practiceAttempts ?? 0) + 1
    if (!prog.startedAt) prog.startedAt = new Date().toISOString()

    if (percentage >= 80) {
      prog.status = 'mastered'
      prog.completedAt = new Date().toISOString()
    } else if (percentage >= 60) {
      prog.status = 'completed'
      prog.completedAt = new Date().toISOString()
    } else if (prog.status === 'not_started') {
      prog.status = 'in_progress'
    }

    project.currentKnowledgePointId = kpId
    project.updatedAt = new Date().toISOString()
    persist()
    return {
      status: prog.status,
      next: getNextKnowledgePoint(kpId, project.id),
    }
  }

  /** Mark current KP finished and advance current pointer to next incomplete KP. */
  function completeAndGetNext(
    kpId: string,
    status: 'completed' | 'mastered' = 'completed',
  ) {
    const project = activeProject.value
    if (!project) return null

    const prog = ensureProgress(project, kpId)
    prog.status = status
    if (!prog.startedAt) prog.startedAt = new Date().toISOString()
    prog.completedAt = new Date().toISOString()

    const next = getNextKnowledgePoint(kpId, project.id)
    project.currentKnowledgePointId = next?.kpId ?? kpId
    project.updatedAt = new Date().toISOString()
    persist()

    return {
      status: prog.status,
      next,
    }
  }

  function normalizeText(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, '')
  }

  /** Actionable weak-point queue from quiz scores + recent report mentions. */
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

    for (const kp of kps) {
      const found = findModuleForKp(project.path, kp.id)
      if (!found) continue
      const prog = getKnowledgePointProgressFor(project, kp.id)
      const score = typeof prog?.quizScore === 'number' ? prog.quizScore : null
      if (score !== null && score < 70) {
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

  function isGenerationAborted(err: unknown) {
    return isAbortError(err)
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

  function getTodayKey() {
    return new Date().toISOString().split('T')[0]
  }

  function getTodayPlanDay(project: LearningProject) {
    const today = getTodayKey()
    return project.studyPlan?.days?.find((d) => d.date === today)
      ?? project.studyPlan?.days?.find((d) => d.dayNumber === 1)
      ?? null
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


  // ==================== Persistence ====================
  const MAX_SESSIONS_PER_PROJECT = 30
  const MAX_MESSAGES_PER_SESSION = 40

  function pruneProjectData(list: LearningProject[]): LearningProject[] {
    return list.map((project) => {
      const sessions = [...(project.teachingSessions ?? [])]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_SESSIONS_PER_PROJECT)
        .map((session) => ({
          ...session,
          messages: Array.isArray(session.messages)
            ? session.messages.slice(-MAX_MESSAGES_PER_SESSION)
            : [],
        }))

      const summaries = [...(project.dailySummaries ?? [])]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 60)

      return {
        ...project,
        teachingSessions: sessions,
        dailySummaries: summaries,
      }
    })
  }

  function init() {
    try {
      const raw = safeGetJson<LearningProject[]>('aios_projects', [])
      projects.value = Array.isArray(raw)
        ? raw.filter((p) => p?.path?.modules && Array.isArray(p.path.modules))
        : []
    } catch {
      projects.value = []
    }
    const savedActive = localStorage.getItem('aios_active_project')
    if (savedActive) activeProjectId.value = savedActive
  }

  function persist() {
    try {
      const pruned = pruneProjectData(projects.value)
      // keep in-memory list aligned with what we persist
      projects.value = pruned
      safeSetJson('aios_projects', pruned)
      if (activeProjectId.value) {
        localStorage.setItem('aios_active_project', activeProjectId.value)
      } else {
        localStorage.removeItem('aios_active_project')
      }
    } catch (err) {
      if (err instanceof StorageQuotaError) {
        toastError(err.message)
        // best-effort emergency prune: drop oldest projects' heavy fields
        projects.value = projects.value.map((p, idx) => {
          if (idx < 2) return p
          return {
            ...p,
            teachingSessions: p.teachingSessions?.slice(0, 5) ?? [],
            dailySummaries: p.dailySummaries?.slice(0, 10) ?? [],
            progress: p.progress.map((pr) => ({
              ...pr,
              generatedDocs: undefined,
              generatedDiagrams: undefined,
            })),
          }
        })
        try {
          safeSetJson('aios_projects', projects.value)
          toastWarning('已自动压缩旧数据以腾出空间，建议导出备份')
        } catch {
          // ignore second failure
        }
        return
      }
      throw err
    }
  }

  function exportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      activeProjectId: activeProjectId.value,
      projects: projects.value,
    }
    return {
      fileName: `ai-learning-os-backup-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(payload, null, 2),
    }
  }

  function importBackup(raw: string): { imported: number } {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('备份文件不是合法 JSON')
    }

    const obj = parsed as { projects?: LearningProject[]; activeProjectId?: string | null }
    const list = Array.isArray(parsed)
      ? (parsed as LearningProject[])
      : Array.isArray(obj?.projects)
        ? obj.projects
        : null

    if (!list) throw new Error('备份中未找到 projects 数据')

    const valid = list.filter((p) => p?.id && p?.path?.modules && Array.isArray(p.path.modules))
    if (!valid.length) throw new Error('备份中没有可导入的有效项目')

    // merge by id (imported wins)
    const map = new Map<string, LearningProject>()
    for (const p of projects.value) map.set(p.id, p)
    for (const p of valid) map.set(p.id, p)
    projects.value = pruneProjectData([...map.values()].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime(),
    ))

    if (obj && typeof obj === 'object' && 'activeProjectId' in obj) {
      const nextActive = obj.activeProjectId
      if (nextActive && projects.value.some((p) => p.id === nextActive)) {
        activeProjectId.value = nextActive
      }
    } else if (!activeProjectId.value && projects.value[0]) {
      activeProjectId.value = projects.value[0].id
    }

    persist()
    return { imported: valid.length }
  }

  // ==================== Actions ====================
  async function createProject(learningGoal: string, level: 'beginner' | 'intermediate' | 'advanced' = 'beginner') {
    const controller = beginGeneration('1/3 分析学习目标...')
    try {
      generateProgress.value = '1/3 正在规划模块与知识点...'
      const path = await generateLearningPath(learningGoal, level, 2, { signal: controller.signal })
      if (controller.signal.aborted) throw Object.assign(new Error('AI 请求已取消'), { code: 'aborted' })

      generateProgress.value = '2/3 整理知识图谱结构...'
      const project: LearningProject = {
        id: uid('proj'),
        name: learningGoal,
        domain: '',
        path,
        progress: [],
        dailySummaries: [],
        teachingSessions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const firstKp = listKnowledgePoints(path)[0]
      if (firstKp) project.currentKnowledgePointId = firstKp.id

      generateProgress.value = '3/3 保存学习项目...'
      projects.value.unshift(project)
      activeProjectId.value = project.id
      persist()
      return project
    } catch (err) {
      if (isAbortError(err)) {
        generateError.value = ''
        throw Object.assign(new Error('已取消生成'), { code: 'aborted' })
      }
      const msg = err instanceof Error ? err.message : '生成失败'
      generateError.value = msg
      throw err
    } finally {
      endGeneration(controller)
    }
  }

  function setActiveProject(id: string) {
    const exists = projects.value.some((p) => p.id === id)
    if (!exists) return false
    activeProjectId.value = id
    persist()
    return true
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id)
    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value[0]?.id ?? null
    }
    persist()
  }

  function updateKnowledgePointProgress(kpId: string, status: LearningProgress['status']) {
    const project = activeProject.value
    if (!project) return
    const prog = ensureProgress(project, kpId)
    prog.status = status
    if (status === 'in_progress' && !prog.startedAt) prog.startedAt = new Date().toISOString()
    if (status === 'completed' || status === 'mastered') prog.completedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()
    persist()
  }

  function saveNotes(kpId: string, notes: string) {
    const project = activeProject.value
    if (!project) return
    const prog = ensureProgress(project, kpId)
    prog.notes = notes
    project.updatedAt = new Date().toISOString()
    persist()
  }

  async function generatePlan(dailyHours: number = 2) {
    const project = activeProject.value
    if (!project) return null
    const controller = beginGeneration('1/3 分析学习路径...')
    try {
      generateProgress.value = '2/3 按每日学时编排任务...'
      const plan = await generateStudyPlan(
        project.path,
        dailyHours,
        new Date().toISOString().split('T')[0],
        { signal: controller.signal },
      )
      if (controller.signal.aborted) throw Object.assign(new Error('AI 请求已取消'), { code: 'aborted' })
      generateProgress.value = '3/3 保存学习计划...'
      plan.projectId = project.id
      plan.days = (plan.days ?? []).map((d) => ({
        ...d,
        completedTasks: Array.isArray(d.completedTasks) ? d.completedTasks : [],
      }))
      project.studyPlan = plan
      project.updatedAt = new Date().toISOString()
      persist()
      return plan
    } catch (err) {
      if (isAbortError(err)) {
        generateError.value = ''
        throw Object.assign(new Error('已取消生成'), { code: 'aborted' })
      }
      throw err
    } finally {
      endGeneration(controller)
    }
  }

  /** Return existing session messages for a knowledge point (latest session). */
  function getTeachingMessages(kpId: string): TeachingMessage[] {
    const project = activeProject.value
    if (!project) return []
    const session = getLatestSession(project, kpId)
    return session?.messages ? [...session.messages] : []
  }

  function getTeachingSession(kpId: string): TeachingSession | null {
    const project = activeProject.value
    if (!project) return null
    return getLatestSession(project, kpId) ?? null
  }

  /**
   * Start or continue teaching for a knowledge point.
   * - Reuses the latest unfinished session when present
   * - Only creates a brand-new session when forceNew is true or none exists
   */
  async function startTeaching(kpId: string, opts?: { forceNew?: boolean }) {
    const project = activeProject.value
    if (!project) return null
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return null

    let session = getLatestSession(project, kpId)
    const forceNew = opts?.forceNew === true

    if (!session || forceNew || session.currentStep === 'finished') {
      session = {
        id: uid('session'),
        kpId,
        messages: [],
        currentStep: 'explaining',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      project.teachingSessions.push(session)
    }

    // If session already has messages, just return last teacher message (resume)
    // unless forceNew already created empty one above
    if (session.messages.length > 0 && !forceNew) {
      // Continue teaching from existing context — append next teacher turn
      const teacherMsg = await teachKnowledgePoint(
        { id: kp.id, title: kp.title, description: kp.description, keyPoints: kp.keyPoints },
        project.path.level,
        session.messages,
      )
      session.messages.push(teacherMsg)
      session.currentStep = 'asking_question'
      session.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      // auto mark in progress
      const prog = ensureProgress(project, kpId)
      if (prog.status === 'not_started') {
        prog.status = 'in_progress'
        prog.startedAt = new Date().toISOString()
      }
      persist()
      return teacherMsg
    }

    const teacherMsg = await teachKnowledgePoint(
      { id: kp.id, title: kp.title, description: kp.description, keyPoints: kp.keyPoints },
      project.path.level,
      session.messages,
    )

    session.messages.push(teacherMsg)
    session.currentStep = 'asking_question'
    session.updatedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()

    const prog = ensureProgress(project, kpId)
    if (prog.status === 'not_started') {
      prog.status = 'in_progress'
      prog.startedAt = new Date().toISOString()
    }
    persist()
    return teacherMsg
  }

  async function submitAnswer(kpId: string, answer: string) {
    const project = activeProject.value
    if (!project) return null
    let session = getLatestSession(project, kpId)
    if (!session) {
      // Auto-create a session so the student can still chat
      session = {
        id: uid('session'),
        kpId,
        messages: [],
        currentStep: 'waiting_answer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      project.teachingSessions.push(session)
    }

    const studentMsg: TeachingMessage = {
      id: uid('msg'),
      role: 'student',
      content: answer,
      type: 'text',
      timestamp: new Date().toISOString(),
    }
    session.messages.push(studentMsg)
    session.currentStep = 'grading'
    session.studentAnswer = answer
    session.updatedAt = new Date().toISOString()

    const lastTeacherMsg = [...session.messages].reverse().find((m) => m.role === 'teacher')
    try {
      const feedback = await chatCompletion([{
        role: 'system',
        content:
          '你是老师，请评价学生的回答，给出分数和改进建议。' +
          '只输出 JSON: {"score": 0-100, "feedback": "评语", "nextHint": "下一步引导"}',
      }, {
        role: 'user',
        content: `知识点对话上下文（最近几条）：\n${session.messages.slice(-6).map((m) => m.role + ': ' + m.content).join('\n')}\n\n老师上次内容：${lastTeacherMsg?.content ?? '无'}\n学生回答：${answer}`,
      }], { temperature: 0.3 })

      const cleaned = parseAndValidateAiJson(
        feedback,
        (v): v is { score: number; feedback: string; nextHint?: string } => {
          return !!v && typeof v === 'object' && typeof (v as { score?: unknown }).score === 'number' && typeof (v as { feedback?: unknown }).feedback === 'string'
        },
        '教学评分',
      )

      session.score = cleaned.score
      const teacherFeedback: TeachingMessage = {
        id: uid('msg'),
        role: 'teacher',
        content: cleaned.nextHint
          ? `${cleaned.feedback}\n\n——\n下一步：${cleaned.nextHint}`
          : cleaned.feedback,
        type: 'feedback',
        timestamp: new Date().toISOString(),
      }
      session.messages.push(teacherFeedback)
      session.currentStep = cleaned.score >= 70 ? 'continuing' : 'asking_question'
    } catch {
      session.messages.push({
        id: uid('msg'),
        role: 'teacher',
        content: 'AI 评分暂时出错了，不过没关系——你能再说说你的理解吗？我换个角度继续教你。',
        type: 'feedback',
        timestamp: new Date().toISOString(),
      })
      session.currentStep = 'asking_question'
    }

    session.updatedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()
    persist()
    return session
  }

  async function generateExercisesForKP(kpId: string, count = 5) {
    const project = activeProject.value
    if (!project) return []
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return []
    return generateExercises(kp, count)
  }

  async function gradeExercise(exercise: Exercise, studentAnswer: string) {
    return gradeSubmission(exercise, studentAnswer)
  }

  async function generateDailyReport() {
    const project = activeProject.value
    if (!project) return null

    const controller = beginGeneration('1/3 汇总今日学习数据...')
    try {
      const today = getTodayKey()
      const stats = getProjectLearningStats(project.id)
      const completedToday = project.progress.filter(
        (p) => p.completedAt && p.completedAt.startsWith(today),
      )
      const activeToday = project.progress.filter((p) => p.status === 'in_progress' || (p.startedAt && p.startedAt.startsWith(today)))

      const learnedSet = new Set<string>()
      for (const p of completedToday) {
        const title = findKnowledgePoint(project.path, p.knowledgePointId)?.title ?? p.knowledgePointId
        learnedSet.add(title)
      }
      for (const p of activeToday) {
        const title = findKnowledgePoint(project.path, p.knowledgePointId)?.title ?? p.knowledgePointId
        learnedSet.add(title)
      }
      const planDay = getTodayPlanDay(project)
      if (planDay) {
        for (const task of planDay.tasks ?? []) {
          if ((planDay.completedTasks ?? []).includes(task.id)) learnedSet.add(task.title)
        }
      }

      const learnedPoints = [...learnedSet]
      const completedHours = completedToday.reduce(
        (sum, p) => sum + (findKnowledgePoint(project.path, p.knowledgePointId)?.estimatedHours ?? 0),
        0,
      )
      const quizScores = project.progress
        .filter((p) => typeof p.quizScore === 'number' && ((p.completedAt && p.completedAt.startsWith(today)) || (p.startedAt && p.startedAt.startsWith(today))))
        .map((p) => p.quizScore as number)

      generateProgress.value = '2/3 AI 生成学习总结与建议...'
      const summary = await generateDailySummary(
        learnedPoints,
        completedHours || Number(((stats?.planDone ?? 0) * 0.5).toFixed(1)),
        quizScores,
        { signal: controller.signal },
      )
      if (controller.signal.aborted) throw Object.assign(new Error('AI 请求已取消'), { code: 'aborted' })

      if (!summary.learnedPoints?.length) summary.learnedPoints = learnedPoints
      if (!summary.completedHours) summary.completedHours = completedHours
      if (!summary.quizScores?.length) summary.quizScores = quizScores
      if (!summary.weakPoints?.length) {
        summary.weakPoints = project.progress
          .filter((p) => typeof p.quizScore === 'number' && (p.quizScore as number) < 70)
          .map((p) => findKnowledgePoint(project.path, p.knowledgePointId)?.title ?? p.knowledgePointId)
          .slice(0, 5)
      }
      if (!summary.suggestions?.length) {
        const next = getContinueTarget(project.id)
        summary.suggestions = [
          next ? `下一步优先学习：${next.kpTitle}` : '今日知识点已完成，可复习薄弱点',
          planDay ? `今日计划进度 ${stats?.planDone ?? 0}/${stats?.planTotal ?? 0}` : '可在计划页生成每日任务',
        ]
      }

      generateProgress.value = '3/3 保存今日报告...'
      summary.projectId = project.id
      summary.date = today
      const others = (project.dailySummaries ?? []).filter((s) => s.date !== today)
      project.dailySummaries = [summary, ...others].sort((a, b) => String(b.date).localeCompare(String(a.date)))
      project.updatedAt = new Date().toISOString()
      persist()
      return summary
    } catch (err) {
      if (isAbortError(err)) {
        generateError.value = ''
        throw Object.assign(new Error('已取消生成'), { code: 'aborted' })
      }
      throw err
    } finally {
      endGeneration(controller)
    }
  }

  async function generateDocForKP(kpId: string) {
    const project = activeProject.value
    if (!project) return ''
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return ''
    const doc = await generateKnowledgeDoc(kp)
    const prog = ensureProgress(project, kpId)
    prog.generatedDocs = doc
    project.updatedAt = new Date().toISOString()
    persist()
    return doc
  }

  async function generateDiagramsForKP(kpId: string) {
    const project = activeProject.value
    if (!project) return []
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return []
    const diagrams = await generateMermaidDiagram(kp.title, kp.description)
    const prog = ensureProgress(project, kpId)
    prog.generatedDiagrams = diagrams
    project.updatedAt = new Date().toISOString()
    persist()
    return diagrams
  }

  function exportProject(format: ExportFormat): ExportData {
    const project = activeProject.value
    if (!project) return { format, content: '', fileName: '' } as ExportData

    if (format === 'markdown') {
      const fileName = `${project.name}.md`
      let content = `# ${project.name}\n\n`
      content += `## 学习路径\n${project.path.title}\n\n`
      content += `## 进度\n\n`
      project.progress.forEach((p) => {
        const status = p.status === 'completed' ? '✅' : p.status === 'in_progress' ? '🔄' : '⬜'
        const kp = findKnowledgePoint(project.path, p.knowledgePointId)
        content += `- ${status} ${kp?.title ?? p.knowledgePointId}\n`
      })
      return { format, content, fileName }
    }

    if (format === 'word') {
      const fileName = `${project.name}.doc`
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${project.name}</title><style>body{font-family:"SimSun",serif;} h1{color:#2c3e50;} h2{color:#34495e;margin-top:24px;} h3{color:#7f8c8d;} table{border-collapse:collapse;width:100%;margin:12px 0;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f5f5f5;}</style></head><body>`
      html += `<h1>${project.name}</h1>`
      html += `<h2>学习路径：${project.path.title}</h2>`
      html += `<p><strong>领域：</strong>${project.domain}</p>`
      html += `<p><strong>预计总学时：</strong>${project.path.totalEstimatedHours} 小时</p>`
      html += '<h2>学习进度</h2>'
      html += '<table><tr><th>知识点</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>笔记</th></tr>'
      const statusMap: Record<string, string> = { not_started: '未开始', in_progress: '学习中', completed: '已完成', mastered: '已掌握' }
      project.progress.forEach((p) => {
        const kp = findKnowledgePoint(project.path, p.knowledgePointId)
        html += `<tr><td>${kp?.title ?? p.knowledgePointId}</td><td>${statusMap[p.status] || p.status}</td><td>${p.startedAt || '-'}</td><td>${p.completedAt || '-'}</td><td>${p.notes || '-'}</td></tr>`
      })
      html += '</table>'
      if (project.studyPlan) {
        html += '<h2>学习计划</h2>'
        html += `<p><strong>计划标题：</strong>${project.studyPlan.title}</p>`
        html += `<p><strong>每日学时：</strong>${project.studyPlan.dailyHours} 小时</p>`
        html += `<p><strong>起止日期：</strong>${project.studyPlan.startDate} 至 ${project.studyPlan.endDate}</p>`
      }
      if (project.dailySummaries && project.dailySummaries.length > 0) {
        html += '<h2>每日总结</h2>'
        project.dailySummaries.forEach((s) => {
          html += `<h3>${s.date}</h3>`
          html += `<p>已学知识点：${s.learnedPoints.join(', ')}</p>`
          html += `<p>学习时长：${s.completedHours} 小时</p>`
          if (s.suggestions && s.suggestions.length > 0) {
            html += '<p><strong>建议：</strong></p><ul>'
            s.suggestions.forEach((sg) => { html += `<li>${sg}</li>` })
            html += '</ul>'
          }
        })
      }
      html += '</body></html>'
      return { format, content: html, fileName }
    }

    if (format === 'excel') {
      const fileName = `${project.name}.csv`
      let csv = '\uFEFF'
      csv += '项目信息\n'
      csv += `名称,${project.name}\n`
      csv += `领域,${project.domain}\n`
      csv += `学习路径,${project.path.title}\n`
      csv += `预计学时,${project.path.totalEstimatedHours}\n\n`
      csv += '学习进度\n'
      csv += '"知识点","状态","开始时间","完成时间","笔记","测验分数","练习次数"\n'
      const statusCN: Record<string, string> = { not_started: '未开始', in_progress: '学习中', completed: '已完成', mastered: '已掌握' }
      project.progress.forEach((p) => {
        const kp = findKnowledgePoint(project.path, p.knowledgePointId)
        csv += `"${(kp?.title ?? p.knowledgePointId).replace(/"/g, '""')}","${statusCN[p.status] || p.status}","${p.startedAt || ''}","${p.completedAt || ''}","${(p.notes || '').replace(/"/g, '""')}","${p.quizScore ?? ''}","${p.practiceAttempts ?? ''}"\n`
      })
      csv += '\n每日总结\n'
      csv += '"日期","已学知识点","学习时长(小时)","建议"\n'
      if (project.dailySummaries) {
        project.dailySummaries.forEach((s) => {
          csv += `"${s.date}","${s.learnedPoints.join('; ')}","${s.completedHours}","${(s.suggestions || []).join('; ').replace(/"/g, '""')}"\n`
        })
      }
      return { format, content: csv, fileName }
    }

    if (format === 'pdf') {
      const fileName = `${project.name}.pdf`
      let html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${project.name}</title><style>body{font-family:"SimSun","Times New Roman",serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#222;} h1{border-bottom:2px solid #333;padding-bottom:10px;} h2{color:#444;margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px;} h3{color:#555;} table{border-collapse:collapse;width:100%;margin:16px 0;} th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;font-size:14px;} th{background:#f0f0f0;} .status-completed{color:green;} .status-in_progress{color:orange;} .status-not_started{color:#999;} .status-mastered{color:#2e7d32;font-weight:bold;} @media print{body{padding:20px;}}</style></head><body>`
      html += `<h1>${project.name}</h1>`
      html += `<h2>学习路径：${project.path.title}</h2>`
      html += `<p><strong>领域：</strong>${project.domain}</p>`
      html += `<p><strong>预计总学时：</strong>${project.path.totalEstimatedHours} 小时</p>`
      html += '<h2>学习进度</h2>'
      html += '<table><tr><th>知识点</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>笔记</th></tr>'
      project.progress.forEach((p) => {
        const kp = findKnowledgePoint(project.path, p.knowledgePointId)
        html += `<tr class="status-${p.status}"><td>${kp?.title ?? p.knowledgePointId}</td><td>${p.status}</td><td>${p.startedAt || '-'}</td><td>${p.completedAt || '-'}</td><td>${p.notes || '-'}</td></tr>`
      })
      html += '</table>'
      if (project.studyPlan) {
        html += '<h2>学习计划</h2>'
        html += `<p><strong>标题：</strong>${project.studyPlan.title}</p>`
        html += `<p><strong>每日学时：</strong>${project.studyPlan.dailyHours} 小时</p>`
        html += `<p><strong>日期范围：</strong>${project.studyPlan.startDate} 至 ${project.studyPlan.endDate}</p>`
      }
      if (project.dailySummaries && project.dailySummaries.length > 0) {
        html += '<h2>每日总结</h2>'
        project.dailySummaries.forEach((s) => {
          html += `<h3>${s.date}</h3>`
          html += `<p>已学知识点：${s.learnedPoints.join(', ')}</p>`
          html += `<p>学习时长：${s.completedHours} 小时</p>`
          if (s.suggestions && s.suggestions.length > 0) {
            html += '<p><strong>建议：</strong></p><ul>'
            s.suggestions.forEach((sg) => { html += `<li>${sg}</li>` })
            html += '</ul>'
          }
        })
      }
      html += '</body></html>'
      return { format, content: html, fileName }
    }

    return { format, content: JSON.stringify(project, null, 2), fileName: `${project.name}.json` }
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
      prog.status = 'in_progress'
      prog.startedAt = new Date().toISOString()
    }
    project.updatedAt = new Date().toISOString()
    persist()
  }

  return {
    projects,
    activeProjectId,
    activeProject,
    generating,
    generateProgress,
    generateError,
    overallProgress,
    streakDays,
    totalLearnedHours,
    init,
    persist,
    createProject,
    cancelGeneration,
    setActiveProject,
    deleteProject,
    updateKnowledgePointProgress,
    saveNotes,
    generatePlan,
    getTeachingMessages,
    getTeachingSession,
    startTeaching,
    submitAnswer,
    generateExercisesForKP,
    gradeExercise,
    generateDailyReport,
    generateDocForKP,
    generateDiagramsForKP,
    exportProject,
    exportBackup,
    importBackup,
    getKnowledgePointProgress,
    setCurrentKnowledgePoint,
    getContinueTarget,
    getNextKnowledgePoint,
    getLatestContinueProject,
    getProjectLearningStats,
    getTodayPlanDay,
    markKnowledgePointStarted,
    applyQuizResult,
    completeAndGetNext,
    getWeakPointQueue,
    getProjectCardStats,
    isGenerationAborted,
    togglePlanTask,
    findKnowledgePoint,
    findModuleForKp,
    listKnowledgePoints,
  }
})
