// AI Learning OS - 统一 AI 服务层
// 所有 AI 能力通过此层调用，业务代码不直接调用大模型
// 支持从 prompts/ 目录加载动态 prompt 模板

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
import type {
  LearningPath,
  StudyPlan,
  TeachingMessage,
  Exercise,
  DailySummary,
} from '@/types/learning'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ==================== Prompt 模板缓存 ====================
const promptCache = new Map<string, string>()

// 构建时将所有 prompts/*.md 文件导入到 map 中
const promptModules = import.meta.glob('../../prompts/*.md', { eager: true, as: 'raw' }) as Record<string, string>

function resolvePromptPath(name: string): string | null {
  for (const key of Object.keys(promptModules)) {
    if (key.includes(`/${name}.md`)) return key
  }
  return null
}

export async function loadPrompt(name: string, defaultContent: string): Promise<string> {
  if (promptCache.has(name)) return promptCache.get(name)!

  const resolved = resolvePromptPath(name)
  if (resolved && promptModules[resolved]) {
    const content = promptModules[resolved]
    promptCache.set(name, content)
    return content
  }

  // 回退到默认值
  promptCache.set(name, defaultContent)
  return defaultContent
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  const { model = 'agnes-2.0-flash', temperature = 0.7, maxTokens = 8192 } = opts ?? {}
  const apiKey = import.meta.env.VITE_API_KEY || ''
  if (!apiKey) {
    throw new Error('请在 .env.local 中设置 VITE_API_KEY')
  }
  const response = await fetch(API_BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error('AI 请求失败 (' + response.status + '): ' + errorText)
  }
  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export function cleanJson(text: string): string {
  let result = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  try { JSON.parse(result); return result }
  catch(e) {
    result = result.replace(/(\{|,)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
    try { JSON.parse(result); return result }
    catch(e2) {
      result = result.replace(/'/g, '"')
      result = result.replace(/""/g, '"')
      return result
    }
  }
}

// ==================== 1. 学习路径规划 ====================
export async function generateLearningPath(
  learningGoal: string,
  level: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  dailyHours: number = 2,
): Promise<LearningPath> {
  const systemPrompt = await loadPrompt('roadmap',
    '你是 AI Learning OS 的学习路径规划引擎。\n' +
    '规则：输出严格 JSON，不要 markdown 代码块。\n' +
    '4-8 个模块，每模块 3-6 个知识点。\n' +
    '每个知识点至少 2 个资源（视频+文档+练习）。\n' +
    '视频优先 Bilibili，文档优先 MDN/官方文档。\n' +
    '标注 prerequisites 依赖关系。\n' +
    'knowledgeTree 是模块的嵌套树形结构。\n' +
    '时长合理预估，总时长 20-120 小时。'
  )

  const userLevel = level === 'beginner' ? '零基础' : level === 'intermediate' ? '有一定基础' : '进阶提升'
  const userPrompt = '学习目标：' + learningGoal + '\n当前水平：' + userLevel + '\n每天学习时长：' + dailyHours + '小时\n请生成完整学习路径。'

  const result = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])

  const cleaned = cleanJson(result)
  const raw = JSON.parse(cleaned) as Record<string, unknown>
  const parsed = (raw.learningPath ?? raw) as LearningPath
  parsed.id = 'path-' + Date.now()
  return parsed
}

// ==================== 2. 学习计划生成 ====================
export async function generateStudyPlan(
  path: LearningPath,
  dailyHours: number,
  startDate: string,
): Promise<StudyPlan> {
  const systemPrompt = await loadPrompt('planner',
    '你是学习计划生成引擎。\n' +
    '规则：输出严格 JSON。\n' +
    '每天不超过 dailyHours 小时。\n' +
    '任务类型比例：learn 40% + practice 30% + review 20% + test 10%。\n' +
    '每 5 天安排 1 天复习日。\n' +
    '周末减负，多做复习和练习。\n' +
    '每天任务不超过 3 个。'
  )

  if (!path?.modules || path.modules.length === 0) throw new Error("学习路径没有模块，请重新生成")
  const kpSummary = path.modules.flatMap(m =>
    m.knowledgePoints.map(kp => kp.id + ': ' + kp.title + '(' + kp.estimatedHours + 'h)')
  ).join('; ')

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '学习路径：' + path.title + '\n模块：' + path.modules.map(m => m.title).join('、') + '\n知识点摘要：' + kpSummary + '\n每天学习：' + dailyHours + '小时\n开始日期：' + startDate,
  }])

  const cleaned = cleanJson(result)
  const plan = JSON.parse(cleaned) as StudyPlan
  plan.id = 'plan-' + Date.now()
  return plan
}

// ==================== 3. AI 教学 ====================
export async function teachKnowledgePoint(
  kp: { id: string; title: string; description: string; keyPoints: string[] },
  studentLevel: 'beginner' | 'intermediate' | 'advanced',
  step: TeachingMessage[] = [],
): Promise<TeachingMessage> {
  const systemPrompt = await loadPrompt('teacher',
    '你是 Learning Mentor，一位经验丰富的私人老师。\n' +
    '你不是聊天机器人，你是主动教学的老师。\n' +
    '教学流程：\n' +
    '1. 诊断水平 - 了解学生基础\n' +
    '2. 概念解释 - 简洁语言 + 生活类比\n' +
    '3. 举例说明 - 具体例子 + 可运行代码\n' +
    '4. 可视化辅助 - Mermaid 流程图\n' +
    '5. 提问检查 - 提出 1 个问题，等待回答\n' +
    '6. 评分反馈 - 评估回答，给出分数\n' +
    '7. 继续或复习 - 根据评分决定下一步\n' +
    '人格：亲切但严格，善于引导，用比喻让复杂概念变简单。\n' +
    '不要只回答问题，要主动教学。\n' +
    '不要一次输出所有内容，要循序渐进。'
  )

  const history = step.length > 0
    ? step.slice(-6).map(m => m.role + ': ' + m.content).join('\n')
    : '无历史记录'

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '知识点：' + kp.title + '\n描述：' + kp.description + '\n核心要点：' + kp.keyPoints.join('、') + '\n学生水平：' + studentLevel + '\n历史对话：' + history + '\n请开始教学。',
  }])

  return {
    id: 'msg-' + Date.now(),
    role: 'teacher',
    content: result,
    type: 'text',
    timestamp: new Date().toISOString(),
  }
}

// ==================== 4. 练习题生成 ====================
export async function generateExercises(
  kp: { id: string; title: string; description: string },
  count: number = 5,
): Promise<Exercise[]> {
  const systemPrompt = await loadPrompt('quiz',
    '你是出题引擎。\n' +
    '规则：输出严格 JSON。\n' +
    '混合多种题型：choice/fill_blank/coding/case_study/essay。\n' +
    '难度分布：easy 40% + medium 40% + hard 20%。\n' +
    '每题满分 20 分。\n' +
    '选择题必须有 4 个选项。\n' +
    '每道题必须有详细解析。'
  )

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '知识点：' + kp.title + ' - ' + kp.description + '\n生成 ' + count + ' 道练习题。',
  }])

  const cleaned = cleanJson(result)
  const data = JSON.parse(cleaned)
  return data.exercises as Exercise[]
}

// ==================== 5. 作业评分 ====================
export async function gradeSubmission(
  exercise: Exercise,
  studentAnswer: string,
): Promise<{ isCorrect: boolean; score: number; feedback: string }> {
  const systemPrompt = await loadPrompt('reviewer',
    '你是评分引擎。\n' +
    '规则：输出严格 JSON {"isCorrect": bool, "score": 0-100, "feedback": "评语"}。\n' +
    '评分维度：正确性 40% + 完整性 25% + 规范性 20% + 创新性 15%。\n' +
    '评语先肯定优点，再指出不足。\n' +
    '给出具体的改进建议。\n' +
    '评语 100-200 字。'
  )

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '题目：' + exercise.question + '\n正确答案：' + exercise.correctAnswer + '\n学生回答：' + studentAnswer,
  }])

  const cleaned = cleanJson(result)
  return JSON.parse(cleaned) as { isCorrect: boolean; score: number; feedback: string }
}

// ==================== 6. 每日总结 ====================
export async function generateDailySummary(
  learnedPoints: string[],
  completedHours: number,
  quizScores: number[],
): Promise<DailySummary> {
  const avgScore = quizScores.length > 0
    ? Math.round(quizScores.reduce((a: number, b: number) => a + b, 0) / quizScores.length)
    : 0

  const systemPrompt = await loadPrompt('summary',
    '你是学习总结引擎。\n' +
    '规则：输出严格 JSON。\n' +
    '基于实际数据，不编造。\n' +
    '低于 70 分标记为薄弱点。\n' +
    '建议要具体，不说空话。\n' +
    '以鼓励为主。\n' +
    '给出明日计划建议。'
  )

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '今日学习内容：' + learnedPoints.join('、') + '\n学习时长：' + completedHours + '小时\n测验分数：' + quizScores.join(', ') + '分（平均 ' + avgScore + ' 分）',
  }])

  const cleaned = cleanJson(result)
  const summary = JSON.parse(cleaned) as DailySummary
  summary.id = 'summary-' + Date.now()
  summary.date = new Date().toISOString().split('T')[0]
  return summary
}

// ==================== 7. RAG - 文档生成 ====================
export async function generateKnowledgeDoc(
  kp: { id: string; title: string; description: string; keyPoints: string[] },
): Promise<string> {
  const systemPrompt = await loadPrompt('rag',
    '你是文档生成引擎。\n' +
    '规则：输出 Markdown 格式。\n' +
    '结构：概念 -> 原理 -> 案例 -> 代码 -> 总结 -> 重点 -> 常见错误 -> 练习 -> 延伸阅读。\n' +
    '面向初学者，避免过度专业术语。\n' +
    '代码示例必须可运行。\n' +
    '使用 Mermaid 图辅助理解。\n' +
    '长度 1000-3000 字。'
  )

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '知识点：' + kp.title + '\n描述：' + kp.description + '\n核心要点：' + kp.keyPoints.join('、'),
  }])

  return cleanJson(result)
}

// ==================== 8. RAG - 流程图 ====================
export async function generateMermaidDiagram(
  topic: string,
  description: string,
): Promise<{ type: string; code: string; caption: string }[]> {
  const systemPrompt = await loadPrompt('diagram',
    '你是流程图生成引擎。\n' +
    '规则：输出严格 JSON {"diagrams": [{"type": "flowchart|sequenceDiagram|graph", "code": "mermaid 代码", "caption": "图注"}]}。\n' +
    '用 Mermaid 语法绘制。\n' +
    '帮助理解知识结构。'
  )

  const result = await chatCompletion([{
    role: 'system',
    content: systemPrompt,
  }, {
    role: 'user',
    content: '主题：' + topic + '\n描述：' + description,
  }])

  const cleaned = cleanJson(result)
  const data = JSON.parse(cleaned)
  return data.diagrams
}
