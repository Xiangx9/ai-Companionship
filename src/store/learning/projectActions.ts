/**
 * Project lifecycle actions (create / switch / delete / plan).
 */
import type { ComputedRef, Ref } from 'vue'
import type { LearningProject, StudyPlan } from '@/types/learning'
import { generateLearningPath, generateStudyPlan } from '@/services/aiEngine'
import {
  uid,
  listKnowledgePoints,
  isAbortError,
} from './helpers'
import {
  buildFreshStudyPlanShell,
  canContinueStudyPlan,
  mergeStudyPlanPeriods,
  nextPeriodStart,
  remainingKnowledgePoints,
  type PlanGenerateMode,
} from '@/utils/studyPlanRoll'

export type ProjectApiDeps = {
  projects: Ref<LearningProject[]>
  activeProjectId: Ref<string | null>
  activeProject: ComputedRef<LearningProject | undefined>
  generateProgress: Ref<string>
  generateError: Ref<string>
  persist: () => void
  beginGeneration: (progressText: string) => AbortController
  endGeneration: (controller?: AbortController | null, opts?: { cancelled?: boolean }) => void
  mapGenerationError: (err: unknown) => unknown
}

export function createProjectApi(deps: ProjectApiDeps) {
  const {
    projects,
    activeProjectId,
    activeProject,
    generateProgress,
    generateError,
    persist,
    beginGeneration,
    endGeneration,
    mapGenerationError,
  } = deps

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
      mapGenerationError(err)
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

  /**
   * Rolling plan:
   * - fresh: replace with a new 10–14 day period (keeps path; drops old plan days)
   * - continue: append next period after last day; preserves completedTasks history
   */
  async function generatePlan(
    dailyHours: number = 2,
    mode: PlanGenerateMode = 'fresh',
  ): Promise<StudyPlan | null> {
    const project = activeProject.value
    if (!project) return null

    const remaining = remainingKnowledgePoints(project.path, project.progress)
    if (mode === 'continue') {
      if (!canContinueStudyPlan(project.path, project.progress, project.studyPlan)) {
        throw new Error(
          remaining.length === 0
            ? '当前路径知识点已全部完成，无需续期'
            : '请先生成近期计划，再续期',
        )
      }
    } else if (remaining.length === 0) {
      // Allow restart only if there is something left; if all done, still error
      throw new Error('当前路径知识点已全部完成，无需再生成计划')
    }

    const existing = project.studyPlan
    const { startDate, dayNumberOffset } =
      mode === 'continue' && existing
        ? nextPeriodStart(existing)
        : { startDate: new Date().toISOString().split('T')[0], dayNumberOffset: 0 }

    const controller = beginGeneration(
      mode === 'continue' ? '1/3 分析待学知识点...' : '1/3 分析学习路径...',
    )
    try {
      generateProgress.value =
        mode === 'continue' ? '2/3 编排下一期任务...' : '2/3 按每日学时编排近期任务...'

      const incoming = await generateStudyPlan(
        project.path,
        dailyHours,
        startDate,
        {
          signal: controller.signal,
          mode,
          focusKnowledgePoints: remaining,
          dayNumberOffset,
        },
      )
      if (controller.signal.aborted) throw Object.assign(new Error('AI 请求已取消'), { code: 'aborted' })

      generateProgress.value = '3/3 保存学习计划...'
      let plan: StudyPlan
      if (mode === 'continue' && existing) {
        plan = mergeStudyPlanPeriods(existing, incoming, {
          dayNumberOffset,
          startDate,
          dailyHours,
        })
        plan.projectId = project.id
        if (!/续期|近期/.test(plan.title || '')) {
          plan.title = (plan.title || '学习计划') + ' · 已续期'
        }
      } else {
        plan = buildFreshStudyPlanShell(incoming, {
          projectId: project.id,
          dailyHours,
          startDate,
        })
      }

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
      mapGenerationError(err)
      throw err
    } finally {
      endGeneration(controller)
    }
  }

  return {
    createProject,
    setActiveProject,
    deleteProject,
    generatePlan,
  }
}
