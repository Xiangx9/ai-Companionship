/**
 * Project lifecycle actions (create / switch / delete / plan).
 */
import type { ComputedRef, Ref } from 'vue'
import type { LearningProject } from '@/types/learning'
import { generateLearningPath, generateStudyPlan } from '@/services/aiEngine'
import {
  uid,
  listKnowledgePoints,
  isAbortError,
} from './helpers'

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
