// AI Learning OS - 学习 Store
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  LearningProject,
  LearningProgress,
  LearningPath,
  Exercise,
  KnowledgePoint,
  KnowledgeTreeNode,
  ExportFormat,
  ExportData,
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
  cleanJson,
} from '@/services/aiEngine'

export const useLearningStore = defineStore('learning', () => {
  // ==================== State ====================
  const projects = ref<LearningProject[]>([])
  const activeProjectId = ref<string | null>(null)
  const generating = ref(false)
  const generateProgress = ref('')
  const generateError = ref('')

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
    // 计算真正的连续学习天数（基于日期去重倒推）
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
      return sum + (pr.status === 'completed' ? kp?.estimatedHours ?? 0 : 0)
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


  // ==================== Persistence ====================
  function init() {
    try {
      const saved = localStorage.getItem('aios_projects')
      if (saved) {
        const raw = JSON.parse(saved)
        projects.value = raw.filter((p: any) => p?.path?.modules && Array.isArray(p.path.modules))
      }
    } catch { projects.value = [] }
    const savedActive = localStorage.getItem('aios_active_project')
    if (savedActive) activeProjectId.value = savedActive
  }

  function persist() {
    localStorage.setItem('aios_projects', JSON.stringify(projects.value))
    if (activeProjectId.value) localStorage.setItem('aios_active_project', activeProjectId.value)
  }

  // ==================== Actions ====================
  async function createProject(learningGoal: string, level: 'beginner' | 'intermediate' | 'advanced' = 'beginner') {
    generating.value = true
    generateProgress.value = '🤖 AI 正在分析学习目标...'
    generateError.value = ''

    try {
      const path = await generateLearningPath(learningGoal, level)
      generateProgress.value = '📋 正在生成知识图谱...'

      const project: LearningProject = {
        id: `proj-${Date.now()}`,
        name: learningGoal,
        domain: '',
        path,
        progress: [],
        dailySummaries: [],
        teachingSessions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      projects.value.unshift(project)
      activeProjectId.value = project.id
      persist()
      return project
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败'
      generateError.value = msg
      throw err
    } finally {
      generating.value = false
    }
  }

  function setActiveProject(id: string) {
    activeProjectId.value = id
    persist()
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
    let prog = project.progress.find((p) => p.knowledgePointId === kpId)
    if (!prog) {
      prog = { knowledgePointId: kpId, status }
      project.progress.push(prog)
    }
    prog.status = status
    if (status === 'in_progress' && !prog.startedAt) prog.startedAt = new Date().toISOString()
    if (status === 'completed') prog.completedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()
    persist()
  }

  async function generatePlan(dailyHours: number = 2) {
    const project = activeProject.value
    if (!project) return null
    generateProgress.value = '📅 正在生成每日学习计划...'
    try {
      const plan = await generateStudyPlan(project.path, dailyHours, new Date().toISOString().split('T')[0])
      project.studyPlan = plan
      project.updatedAt = new Date().toISOString()
      persist()
      return plan
    } catch (err) {
      throw err
    } finally {
      generateProgress.value = ''
    }
  }

  async function startTeaching(kpId: string) {
    const project = activeProject.value
    if (!project) return null
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return null

    let session = project.teachingSessions.find((s) => s.kpId === kpId && !s.messages.length)
    if (!session) {
      session = {
        id: `session-${Date.now()}`,
        kpId,
        messages: [],
        currentStep: 'explaining',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      project.teachingSessions.push(session)
    }

    const teacherMsg = await teachKnowledgePoint(
      { id: kp.id, title: kp.title, description: kp.description, keyPoints: kp.keyPoints },
      project.path.level,
      session.messages,
    )

    session.messages.push(teacherMsg)
    session.updatedAt = new Date().toISOString()
    persist()
    return teacherMsg
  }

  async function submitAnswer(kpId: string, answer: string) {
    const project = activeProject.value
    if (!project) return null
    const session = project.teachingSessions.find((s) => s.kpId === kpId)
    if (!session) return null

    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'student',
      content: answer,
      type: 'text',
      timestamp: new Date().toISOString(),
    })
    session.updatedAt = new Date().toISOString()

    // AI 评分并回复
    const lastTeacherMsg = session.messages.filter((m) => m.role === 'teacher').pop()
    if (lastTeacherMsg) {
      const feedback = await chatCompletion([{
        role: 'system',
        content: '你是老师，请评价学生的回答，给出分数和改进建议。输出 JSON: {"score": 0-100, "feedback": "评语"}',
      }, {
        role: 'user',
        content: `老师上次问：${lastTeacherMsg.content}\n学生回答：${answer}`,
      }])

      let cleaned: { score: number; feedback: string }
      try {
        cleaned = JSON.parse(cleanJson(feedback)) as { score: number; feedback: string }
      } catch {
        session.messages.push({
          id: `msg-${Date.now()}`,
          role: 'teacher',
          content: 'AI 评分出错，请稍后重试',
          type: 'feedback',
          timestamp: new Date().toISOString(),
        })
        session.updatedAt = new Date().toISOString()
        persist()
        return session
      }
      session.messages.push({
        id: `msg-${Date.now()}`,
        role: 'teacher',
        content: cleaned.feedback,
        type: 'feedback',
        timestamp: new Date().toISOString(),
      })
      session.updatedAt = new Date().toISOString()
      persist()
    }

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

    const today = new Date().toISOString().split('T')[0]
    const completedToday = project.progress.filter(
      (p) => p.completedAt && p.completedAt.startsWith(today),
    )
    const learnedPoints = completedToday.map((p) => {
      const kp = findKnowledgePoint(project.path, p.knowledgePointId)
      return kp?.title ?? p.knowledgePointId
    })

    const summary = await generateDailySummary(
      learnedPoints,
      completedToday.reduce((sum, p) => sum + (findKnowledgePoint(project.path, p.knowledgePointId)?.estimatedHours ?? 0), 0),
      completedToday.map((p) => p.quizScore ?? 0),
    )

    project.dailySummaries.push(summary)
    project.updatedAt = new Date().toISOString()
    persist()
    return summary
  }

  async function generateDocForKP(kpId: string) {
    const project = activeProject.value
    if (!project) return ''
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return ''
    return generateKnowledgeDoc(kp)
  }

  async function generateDiagramsForKP(kpId: string) {
    const project = activeProject.value
    if (!project) return []
    const kp = findKnowledgePoint(project.path, kpId)
    if (!kp) return []
    return generateMermaidDiagram(kp.title, kp.description)
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
        content += `- ${status} ${p.knowledgePointId}\n`
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
      html += '<table><tr><th>知识点ID</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>笔记</th></tr>'
      const statusMap: Record<string, string> = { not_started: '未开始', in_progress: '学习中', completed: '已完成', mastered: '已掌握' }
      project.progress.forEach((p) => {
        html += `<tr><td>${p.knowledgePointId}</td><td>${statusMap[p.status] || p.status}</td><td>${p.startedAt || '-'}</td><td>${p.completedAt || '-'}</td><td>${p.notes || '-'}</td></tr>`
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
      csv += '"知识点ID","状态","开始时间","完成时间","笔记","测验分数","练习次数"\n'
      const statusCN: Record<string, string> = { not_started: '未开始', in_progress: '学习中', completed: '已完成', mastered: '已掌握' }
      project.progress.forEach((p) => {
        csv += `"${p.knowledgePointId}","${statusCN[p.status] || p.status}","${p.startedAt || ''}","${p.completedAt || ''}","${(p.notes || '').replace(/"/g, '""')}","${p.quizScore ?? ''}","${p.practiceAttempts ?? ''}"\n`
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
      html += '<table><tr><th>知识点ID</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>笔记</th></tr>'
      project.progress.forEach((p) => {
        html += `<tr class="status-${p.status}"><td>${p.knowledgePointId}</td><td>${p.status}</td><td>${p.startedAt || '-'}</td><td>${p.completedAt || '-'}</td><td>${p.notes || '-'}</td></tr>`
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

    // Fallback: JSON
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
    setActiveProject,
    deleteProject,
    updateKnowledgePointProgress,
    generatePlan,
    startTeaching,
    submitAnswer,
    generateExercisesForKP,
    gradeExercise,
    generateDailyReport,
    generateDocForKP,
    generateDiagramsForKP,
    exportProject,
    getKnowledgePointProgress,
    setCurrentKnowledgePoint,
  }
})

