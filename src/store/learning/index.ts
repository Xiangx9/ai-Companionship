// AI Learning OS - 学习 Store（组合入口）
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LearningProject } from '@/types/learning'
import {
  countKnowledgePoints,
  findKnowledgePoint,
  findModuleForKp,
  listKnowledgePoints,
  isGenerationAborted,
  getTodayPlanDay,
} from './helpers'
import { createGenerationApi } from './generation'
import { createPersistenceApi } from './persistence'
import { createProgressApi } from './progress'
import { createProjectApi } from './projectActions'
import { createTeachSessionApi } from './teachSession'
import { createContentApi } from './contentActions'

export const useLearningStore = defineStore('learning', () => {
  // ==================== State ====================
  const projects = ref<LearningProject[]>([])
  const activeProjectId = ref<string | null>(null)
  const generating = ref(false)
  const generateProgress = ref('')
  const generateError = ref('')
  const generationController = ref<AbortController | null>(null)

  const {
    beginGeneration,
    endGeneration,
    clearGenerateError,
    mapGenerationError,
    cancelGeneration,
  } = createGenerationApi({
    generating,
    generateProgress,
    generateError,
    generationController,
  })

  const {
    init,
    persist,
    exportBackup,
    importBackup,
  } = createPersistenceApi({
    projects,
    activeProjectId,
  })

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

  // ==================== Domain APIs ====================
  const progressApi = createProgressApi({
    projects,
    activeProject,
    persist,
  })

  const {
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
  } = progressApi

  const {
    createProject,
    setActiveProject,
    deleteProject,
    generatePlan,
  } = createProjectApi({
    projects,
    activeProjectId,
    activeProject,
    generateProgress,
    generateError,
    persist,
    beginGeneration,
    endGeneration,
    mapGenerationError,
  })

  const {
    getTeachingMessages,
    getTeachingSession,
    startTeaching,
    submitAnswer,
  } = createTeachSessionApi({
    activeProject,
    persist,
    recordTeachInteraction,
  })

  const {
    generateExercisesForKP,
    gradeExercise,
    generateDailyReport,
    generateDocForKP,
    generateDiagramsForKP,
    exportProject,
  } = createContentApi({
    activeProject,
    generateProgress,
    generateError,
    persist,
    beginGeneration,
    endGeneration,
    mapGenerationError,
    getProjectLearningStats,
    getContinueTarget,
  })

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
    clearGenerateError,
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
    getTodayLearningCard,
    getNextKnowledgePoint,
    getLatestContinueProject,
    getProjectLearningStats,
    getTodayPlanDay,
    markKnowledgePointStarted,
    applyQuizResult,
    recordTeachInteraction,
    recordPracticeResult,
    completeAndGetNext,
    getWeakPointQueue,
    getWrongAnswerQueue,
    recordWrongAnswer,
    resolveWrongAnswer,
    getProjectCardStats,
    isGenerationAborted,
    togglePlanTask,
    findKnowledgePoint,
    findModuleForKp,
    listKnowledgePoints,
  }
})
