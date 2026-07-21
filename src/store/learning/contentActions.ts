/**
 * Content generation & export actions (exercises, docs, diagrams, report).
 */
import type { ComputedRef, Ref } from 'vue'
import type {
  LearningProject,
  Exercise,
  ExportFormat,
  ExportData,
} from '@/types/learning'
import {
  generateExercises,
  gradeSubmission,
  generateDailySummary,
  generateKnowledgeDoc,
  generateMermaidDiagram,
} from '@/services/aiEngine'
import {
  findKnowledgePoint,
  ensureProgress,
  getTodayKey,
  getTodayPlanDay,
  isAbortError,
} from './helpers'

export type ContentApiDeps = {
  activeProject: ComputedRef<LearningProject | undefined>
  generateProgress: Ref<string>
  generateError: Ref<string>
  persist: () => void
  beginGeneration: (progressText: string) => AbortController
  endGeneration: (controller?: AbortController | null, opts?: { cancelled?: boolean }) => void
  mapGenerationError: (err: unknown) => unknown
  getProjectLearningStats: (projectId?: string | null) => any
  getContinueTarget: (projectId?: string | null) => any
}

export function createContentApi(deps: ContentApiDeps) {
  const {
    activeProject,
    generateProgress,
    generateError,
    persist,
    beginGeneration,
    endGeneration,
    mapGenerationError,
    getProjectLearningStats,
    getContinueTarget,
  } = deps

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
      mapGenerationError(err)
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

  return {
    generateExercisesForKP,
    gradeExercise,
    generateDailyReport,
    generateDocForKP,
    generateDiagramsForKP,
    exportProject,
  }
}
