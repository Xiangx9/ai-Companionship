const fs = require('fs');

const old = fs.readFileSync('src/store/learning.ts', 'utf-8');

const newExport = `  function exportProject(format: ExportFormat): ExportData {
    const project = activeProject.value
    if (!project) return { format, content: '', fileName: '' } as ExportData

    if (format === 'markdown') {
      const fileName = \\\`\\\${project.name}.md\\\`
      let content = \\\`# \\\${project.name}\\\\n\\\\n\\\`
      content += \\\`## 学习路径\\\\n\\\${project.path.title}\\\\n\\\\n\\\`
      content += \\\`## 进度\\\\n\\\`
      project.progress.forEach((p) => {
        const status = p.status === 'completed' ? '\\\\u2705' : p.status === 'in_progress' ? '\\\\u{1F504}' : '\\\\u2B1C'
        content += \\\`- \\\${status} \\\${p.knowledgePointId}\\\\n\\\`
      })
      return { format, content, fileName }
    }

    if (format === 'word') {
      const fileName = \\\`\\\${project.name}.doc\\\`
      let html = \\\`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>\\\`
      html += \\\`\\\${project.name}</title><style>body{font-family:"SimSun",serif;} h1{color:#2c3e50;} h2{color:#34495e;margin-top:24px;} h3{color:#7f8c8d;} table{border-collapse:collapse;width:100%;margin:12px 0;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f5f5f5;}</style></head><body>\\\`
      html += \\\`<h1>\\\${project.name}</h1>\\\`
      html += \\\`<h2>学习路径：\\\${project.path.title}</h2>\\\`
      html += \\\`<p><strong>领域：</strong>\\\${project.domain}</p>\\\`
      html += \\\`<p><strong>预计总学时：</strong>\\\${project.path.totalEstimatedHours} 小时</p>\\\`
      html += '<h2>学习进度</h2>'
      html += '<table><tr><th>知识点ID</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>笔记</th></tr>'
      project.progress.forEach((p) => {
        const statusMap = { not_started: '未开始', in_progress: '学习中', completed: '已完成', mastered: '已掌握' }
        html += \\\`<tr><td>\\\${p.knowledgePointId}</td><td>\\\${statusMap[p.status] || p.status}</td><td>\\\${p.startedAt || '-'} </td><td>\\\${p.completedAt || '-'} </td><td>\\\${p.notes || '-'} </td></tr>\\\`
      })
      html += '</table>'
      if (project.studyPlan) {
        html += '<h2>学习计划</h2>'
        html += \\\`<p><strong>计划标题：</strong>\\\${project.studyPlan.title}</p>\\\`
        html += \\\`<p><strong>每日学时：</strong>\\\${project.studyPlan.dailyHours} 小时</p>\\\`
        html += \\\`<p><strong>起止日期：</strong>\\\${project.studyPlan.startDate} 至 \\\${project.studyPlan.endDate}</p>\\\`
      }
      if (project.dailySummaries && project.dailySummaries.length > 0) {
        html += '<h2>每日总结</h2>'
        project.dailySummaries.forEach((s) => {
          html += \\\`<h3>\\\${s.date}</h3>\\\`
          html += \\\`<p>已学知识点：\\\${s.learnedPoints.join(', ')}</p>\\\`
          html += \\\`<p>学习时长：\\\${s.completedHours} 小时</p>\\\`
          if (s.suggestions && s.suggestions.length > 0) {
            html += '<p><strong>建议：</strong></p><ul>'
            s.suggestions.forEach((sg) => { html += \\\`<li>\\\${sg}</li>\\\` })
            html += '</ul>'
          }
        })
      }
      html += '</body></html>'
      return { format, content: html, fileName }
    }

    if (format === 'excel') {
      const fileName = \\\`\\\${project.name}.csv\\\`
      let csv = '\\\\uFEFF'
      csv += '"项目信息"\\\\n'
      csv += \\\`"名称","\\\${project.name}"\\\\n\\\`
      csv += \\\`"领域","\\\${project.domain}"\\\\n\\\`
      csv += \\\`"学习路径","\\\${project.path.title}"\\\\n\\\`
      csv += \\\`"预计学时","\\\${project.path.totalEstimatedHours}"\\\\n\\\\n\\\`
      csv += '"学习进度"\\\\n'
      csv += '"知识点ID","状态","开始时间","完成时间","笔记","测验分数","练习次数"\\\\n'
      const statusCN = { not_started: '未开始', in_progress: '学习中', completed: '已完成', mastered: '已掌握' }
      project.progress.forEach((p) => {
        csv += \\\`"\\\${p.knowledgePointId}","\\\${statusCN[p.status] || p.status}","\\\${p.startedAt || ''}","\\\${p.completedAt || ''}","\\\${(p.notes || '').replace(/"/g, '""')}","\\\${p.quizScore ?? ''}","\\\${p.practiceAttempts ?? ''}"\\\\n\\\`
      })
      csv += '\\\\n"每日总结"\\\\n'
      csv += '"日期","已学知识点","学习时长(小时)","建议"\\\\n'
      if (project.dailySummaries) {
        project.dailySummaries.forEach((s) => {
          csv += \\\`"\\\${s.date}","\\\${s.learnedPoints.join('; ')}","\\\${s.completedHours}","\\\${(s.suggestions || []).join('; ').replace(/"/g, '""')}"\\\\n\\\`
        })
      }
      return { format, content: csv, fileName }
    }

    if (format === 'pdf') {
      const fileName = \\\`\\\${project.name}.html\\\`
      let html = '<!DOCTYPE html>\\\\n<html><head><meta charset="utf-8"><title>'
      html += \\\`\\\${project.name}</title><style>body{font-family:"SimSun","Times New Roman",serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#222;} h1{border-bottom:2px solid #333;padding-bottom:10px;} h2{color:#444;margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px;} h3{color:#555;} table{border-collapse:collapse;width:100%;margin:16px 0;} th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;font-size:14px;} th{background:#f0f0f0;} .status-completed{color:green;} .status-in_progress{color:orange;} .status-not_started{color:#999;} .status-mastered{color:#2e7d32;font-weight:bold;} @media print{body{padding:20px;}}</style></head><body>\\\`
      html += \\\`<h1>\\\${project.name}</h1>\\\`
      html += \\\`<h2>学习路径：\\\${project.path.title}</h2>\\\`
      html += \\\`<p><strong>领域：</strong>\\\${project.domain}</p>\\\`
      html += \\\`<p><strong>预计总学时：</strong>\\\${project.path.totalEstimatedHours} 小时</p>\\\`
      html += \\\`<h2>学习进度</h2>\\\`
      html += '<table><tr><th>知识点ID</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>笔记</th></tr>'
      project.progress.forEach((p) => {
        html += \\\`<tr class="status-\\\${p.status}"><td>\\\${p.knowledgePointId}</td><td>\\\${p.status}</td><td>\\\${p.startedAt || '-'} </td><td>\\\${p.completedAt || '-'} </td><td>\\\${p.notes || '-'} </td></tr>\\\`
      })
      html += '</table>'
      if (project.studyPlan) {
        html += '<h2>学习计划</h2>'
        html += \\\`<p><strong>标题：</strong>\\\${project.studyPlan.title}</p>\\\`
        html += \\\`<p><strong>每日学时：</strong>\\\${project.studyPlan.dailyHours} 小时</p>\\\`
        html += \\\`<p><strong>日期范围：</strong>\\\${project.studyPlan.startDate} 至 \\\${project.studyPlan.endDate}</p>\\\`
      }
      if (project.dailySummaries && project.dailySummaries.length > 0) {
        html += '<h2>每日总结</h2>'
        project.dailySummaries.forEach((s) => {
          html += \\\`<h3>\\\${s.date}</h3>\\\`
          html += \\\`<p>已学知识点：\\\${s.learnedPoints.join(', ')}</p>\\\`
          html += \\\`<p>学习时长：\\\${s.completedHours} 小时</p>\\\`
          if (s.suggestions && s.suggestions.length > 0) {
            html += '<p><strong>建议：</strong></p><ul>'
            s.suggestions.forEach((sg) => { html += \\\`<li>\\\${sg}</li>\\\` })
            html += '</ul>'
          }
        })
      }
      html += '</body></html>'
      return { format, content: html, fileName }
    }

    // Fallback: JSON
    return { format, content: JSON.stringify(project, null, 2), fileName: \\\`\\\${project.name}.json\\\` }
  }

`;

const startMarker = '  function exportProject(format: ExportFormat): ExportData {'
const endMarker = '  function cleanJson'

const startIdx = old.indexOf(startMarker)
const endIdx = old.indexOf(endMarker)

const result = old.substring(0, startIdx) + newExport + old.substring(endIdx)

fs.writeFileSync('src/store/learning.ts', result, 'utf-8')
console.log('Done. Old:', old.length, '-> New:', result.length)
