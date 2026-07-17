// AI Learning OS - 统一 AI 服务层
// 所有 AI 能力通过此层调用，业务代码不直接调用大模型
// 支持从 prompts/ 目录加载动态 prompt 模板

import type {
  LearningPath,
  LearningModule,
  KnowledgePoint,
  LearningResource,
  StudyPlan,
  StudyDay,
  StudyTask,
  TeachingMessage,
  Exercise,
  DailySummary,
} from '@/types/learning'
import {
  AiJsonError,
  parseAndValidateAiJson,
  withRetry,
} from '@/utils/aiJson'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'

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

export class AiRequestError extends Error {
  code?: 'timeout' | 'aborted' | 'http' | 'config' | 'empty'
  constructor(message: string, code?: AiRequestError['code']) {
    super(message)
    this.name = 'AiRequestError'
    this.code = code
  }
}

function asTextCandidate(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        const rec = part as Record<string, unknown>
        if (typeof rec.text === 'string') return rec.text
        if (typeof rec.content === 'string') return rec.content
      }
      return ''
    })
    .join('')
    .trim()
}

function looksLikeFinalAnswer(text: string): boolean {
  if (!text) return false
  // reasoning traces are usually English chain-of-thought, not the final payload
  if (/^Here'?s a thinking process/i.test(text)) return false
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true
  if (trimmed.includes('```')) return true
  // plain chat answers are also valid
  return !/\n\s*\d+\.\s+\*\*/.test(trimmed)
}

function extractAssistantText(data: unknown): string {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const choices = Array.isArray(root.choices) ? root.choices : []
  const first = choices[0] && typeof choices[0] === 'object' ? (choices[0] as Record<string, unknown>) : {}
  const message = first.message && typeof first.message === 'object' ? (first.message as Record<string, unknown>) : {}

  const primary = [
    message.content,
    message.text,
    message.output_text,
    first.text,
    root.output_text,
  ]

  for (const candidate of primary) {
    const text = asTextCandidate(candidate)
    if (text) return text
  }

  // Only fall back to reasoning_content when it already looks like final JSON/text
  const reasoning = asTextCandidate(message.reasoning_content)
  if (reasoning && looksLikeFinalAnswer(reasoning)) return reasoning

  return ''
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: {
    model?: string
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<string> {
  const {
    // 1.5 more reliably returns direct JSON; 2.0 often spends tokens on reasoning
    model = 'agnes-1.5-flash',
    temperature = 0.7,
    maxTokens = 8192,
    signal,
    timeoutMs = 90000,
  } = opts ?? {}
  const apiKey = import.meta.env.VITE_API_KEY || ''
  if (!apiKey) {
    throw new AiRequestError('请在 .env.local 中设置 VITE_API_KEY', 'config')
  }

  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(API_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new AiRequestError('AI 请求失败 (' + response.status + '): ' + errorText, 'http')
    }
    const data = await response.json()
    const content = extractAssistantText(data)
    if (!content) {
      throw new AiRequestError('AI 返回了空内容，请稍后重试', 'empty')
    }
    return content
  } catch (err) {
    if (controller.signal.aborted) {
      if (signal?.aborted) throw new AiRequestError('AI 请求已取消', 'aborted')
      throw new AiRequestError('AI 请求超时，请稍后重试', 'timeout')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

/** @deprecated Prefer parseAndValidateAiJson — kept for callers that still import it. */
function alwaysValid(value: unknown): value is unknown {
  return value !== undefined
}

export function cleanJson(text: string): string {
  try {
    const parsed = parseAndValidateAiJson(text, alwaysValid)
    return JSON.stringify(parsed)
  } catch {
    // fall through to raw text for backward compatibility
    return text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  }
}

// ==================== Validators ====================
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function normalizeResource(raw: unknown, index: number, kpId: string): LearningResource {
  const r = isRecord(raw) ? raw : {}
  return {
    id: asString(r.id, `${kpId}-res-${index + 1}`),
    type: (asString(r.type, 'document') as LearningResource['type']),
    title: asString(r.title, `资源 ${index + 1}`),
    description: asString(r.description),
    url: asString(r.url, '#'),
    duration: typeof r.duration === 'string' ? r.duration : undefined,
    difficulty: r.difficulty as LearningResource['difficulty'],
    tags: asStringArray(r.tags),
    isExternal: typeof r.isExternal === 'boolean' ? r.isExternal : true,
    source: r.source as LearningResource['source'],
    rating: typeof r.rating === 'number' ? r.rating : undefined,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  }
}

function normalizeKnowledgePoint(raw: unknown, index: number, modId: string): KnowledgePoint {
  const k = isRecord(raw) ? raw : {}
  const id = asString(k.id, `${modId}-kp-${index + 1}`)
  const resourcesRaw = Array.isArray(k.resources) ? k.resources : []
  return {
    id,
    title: asString(k.title, `知识点 ${index + 1}`),
    description: asString(k.description),
    prerequisites: asStringArray(k.prerequisites),
    resources: resourcesRaw.map((r, i) => normalizeResource(r, i, id)),
    estimatedHours: asNumber(k.estimatedHours, 1),
    order: asNumber(k.order, index + 1),
    keyPoints: asStringArray(k.keyPoints),
    commonMistakes: asStringArray(k.commonMistakes),
    mermaidDiagrams: Array.isArray(k.mermaidDiagrams)
      ? (k.mermaidDiagrams as KnowledgePoint['mermaidDiagrams'])
      : undefined,
    aiGeneratedDocs: typeof k.aiGeneratedDocs === 'string' ? k.aiGeneratedDocs : undefined,
  }
}

function normalizeModule(raw: unknown, index: number): LearningModule {
  const m = isRecord(raw) ? raw : {}
  const id = asString(m.id, `mod-${index + 1}`)
  const kpsRaw = Array.isArray(m.knowledgePoints) ? m.knowledgePoints : []
  const knowledgePoints = kpsRaw.map((kp, i) => normalizeKnowledgePoint(kp, i, id))
  return {
    id,
    title: asString(m.title, `模块 ${index + 1}`),
    description: asString(m.description),
    icon: asString(m.icon, '📚'),
    knowledgePoints,
    estimatedHours: asNumber(
      m.estimatedHours,
      knowledgePoints.reduce((s, kp) => s + (kp.estimatedHours || 0), 0),
    ),
  }
}

function isLearningPathLike(v: unknown): v is Record<string, unknown> {
  if (!isRecord(v)) return false
  if (Array.isArray(v.modules) && v.modules.length > 0) return true
  if (isRecord(v.learningPath) && Array.isArray(v.learningPath.modules)) return true
  return false
}

function normalizeLearningPath(raw: unknown): LearningPath {
  let data = isRecord(raw) ? raw : {}
  if (isRecord(data.learningPath)) data = data.learningPath

  const modulesRaw = Array.isArray(data.modules) ? data.modules : []
  if (modulesRaw.length === 0) {
    throw new AiJsonError('学习路径缺少 modules', JSON.stringify(raw))
  }

  const modules = modulesRaw.map((m, i) => normalizeModule(m, i))
  const totalEstimatedHours = asNumber(
    data.totalEstimatedHours,
    modules.reduce((s, m) => s + (m.estimatedHours || 0), 0),
  )

  return {
    id: asString(data.id, 'path-' + Date.now()),
    title: asString(data.title, '学习路径'),
    description: asString(data.description),
    level: (asString(data.level, 'beginner') as LearningPath['level']),
    modules,
    totalEstimatedHours,
    tags: asStringArray(data.tags),
    knowledgeTree: data.knowledgeTree as LearningPath['knowledgeTree'],
  }
}

function isStudyPlanLike(v: unknown): v is Record<string, unknown> {
  if (!isRecord(v)) return false
  return Array.isArray(v.days) && v.days.length > 0
}

function normalizeStudyPlan(raw: unknown): StudyPlan {
  const data = isRecord(raw) ? raw : {}
  const daysRaw = Array.isArray(data.days) ? data.days : []
  if (daysRaw.length === 0) throw new AiJsonError('学习计划缺少 days', JSON.stringify(raw))

  const days: StudyDay[] = daysRaw.map((d, i) => {
    const day = isRecord(d) ? d : {}
    const tasksRaw = Array.isArray(day.tasks) ? day.tasks : []
    const tasks: StudyTask[] = tasksRaw.map((t, ti) => {
      const task = isRecord(t) ? t : {}
      return {
        id: asString(task.id, `task-${i + 1}-${ti + 1}`),
        kpId: asString(task.kpId),
        moduleId: asString(task.moduleId),
        title: asString(task.title, `任务 ${ti + 1}`),
        estimatedMinutes: asNumber(task.estimatedMinutes, 30),
        type: (asString(task.type, 'learn') as StudyTask['type']),
        order: asNumber(task.order, ti + 1),
      }
    })
    return {
      dayNumber: asNumber(day.dayNumber, i + 1),
      date: asString(day.date),
      tasks,
      completedTasks: asStringArray(day.completedTasks),
    }
  })

  return {
    id: asString(data.id, 'plan-' + Date.now()),
    projectId: asString(data.projectId),
    title: asString(data.title, '学习计划'),
    dailyHours: asNumber(data.dailyHours, 2),
    startDate: asString(data.startDate),
    endDate: asString(data.endDate),
    days,
    updatedAt: asString(data.updatedAt, new Date().toISOString()),
  }
}

function isExerciseArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0
}

function normalizeExercises(raw: unknown, fallbackKpId: string): Exercise[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (isRecord(raw) && Array.isArray(raw.exercises)) list = raw.exercises
  if (list.length === 0) throw new AiJsonError('练习题列表为空', JSON.stringify(raw))

  return list.map((item, i) => {
    const e = isRecord(item) ? item : {}
    return {
      id: asString(e.id, `ex-${Date.now()}-${i + 1}`),
      kpId: asString(e.kpId, fallbackKpId),
      type: (asString(e.type, 'choice') as Exercise['type']),
      title: asString(e.title, `题目 ${i + 1}`),
      description: asString(e.description),
      question: asString(e.question, asString(e.title, `题目 ${i + 1}`)),
      options: Array.isArray(e.options) ? e.options.filter((x): x is string => typeof x === 'string') : undefined,
      correctAnswer: asString(e.correctAnswer),
      hint: typeof e.hint === 'string' ? e.hint : undefined,
      difficulty: (asString(e.difficulty, 'beginner') as Exercise['difficulty']),
      score: asNumber(e.score, 20),
      createdAt: asString(e.createdAt, new Date().toISOString()),
    }
  })
}

function isGradeResult(v: unknown): v is { isCorrect: boolean; score: number; feedback: string } {
  if (!isRecord(v)) return false
  return typeof v.score === 'number' && typeof v.feedback === 'string'
}

function isDailySummaryLike(v: unknown): v is Record<string, unknown> {
  return isRecord(v)
}

function normalizeDailySummary(raw: unknown): DailySummary {
  const data = isRecord(raw) ? raw : {}
  return {
    id: asString(data.id, 'summary-' + Date.now()),
    date: asString(data.date, new Date().toISOString().split('T')[0]),
    projectId: asString(data.projectId),
    learnedPoints: asStringArray(data.learnedPoints),
    completedHours: asNumber(data.completedHours),
    quizScores: Array.isArray(data.quizScores)
      ? data.quizScores.filter((n): n is number => typeof n === 'number')
      : [],
    weakPoints: asStringArray(data.weakPoints),
    suggestions: asStringArray(data.suggestions),
    generatedAt: asString(data.generatedAt, new Date().toISOString()),
  }
}

function isDiagramArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function normalizeDiagrams(raw: unknown): { type: string; code: string; caption: string }[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (isRecord(raw) && Array.isArray(raw.diagrams)) list = raw.diagrams

  return list
    .map((item) => {
      const d = isRecord(item) ? item : {}
      return {
        type: asString(d.type, 'flowchart'),
        code: asString(d.code),
        caption: asString(d.caption, '示意图'),
      }
    })
    .filter((d) => d.code.trim().length > 0)
}

// ==================== 1. 学习路径规划 ====================
export async function generateLearningPath(
  learningGoal: string,
  level: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  dailyHours: number = 2,
  opts?: { signal?: AbortSignal },
): Promise<LearningPath> {
  const systemPromptBase = await loadPrompt('roadmap',
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

  return withRetry(async (attempt) => {
    const systemPrompt = systemPromptBase + (attempt > 0
      ? '\n\n【重要】上一次输出无法解析。请只输出合法 JSON 对象，不要 markdown 代码块，不要额外说明。'
      : '')
    const result = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      model: 'agnes-1.5-flash',
      temperature: 0.3,
      maxTokens: 8192,
      timeoutMs: 120000,
      signal: opts?.signal,
    })
    const raw = parseAndValidateAiJson(result, isLearningPathLike, '学习路径')
    return normalizeLearningPath(raw)
  }, { retries: 2, label: '生成学习路径' })
}

// ==================== 2. 学习计划生成 ====================
export async function generateStudyPlan(
  path: LearningPath,
  dailyHours: number,
  startDate: string,
  opts?: { signal?: AbortSignal },
): Promise<StudyPlan> {
  const systemPromptBase = await loadPrompt('planner',
    '你是学习计划生成引擎。\n' +
    '规则：输出严格 JSON。\n' +
    '每天不超过 dailyHours 小时。\n' +
    '任务类型比例：learn 40% + practice 30% + review 20% + test 10%。\n' +
    '每 5 天安排 1 天复习日。\n' +
    '周末减负，多做复习和练习。\n' +
    '每天任务不超过 3 个。'
  )

  if (!path?.modules || path.modules.length === 0) throw new Error('学习路径没有模块，请重新生成')
  const kpSummary = path.modules.flatMap(m =>
    m.knowledgePoints.map(kp => kp.id + ': ' + kp.title + '(' + kp.estimatedHours + 'h)')
  ).join('; ')

  return withRetry(async (attempt) => {
    const systemPrompt = systemPromptBase + (attempt > 0
      ? '\n\n【重要】上一次输出无法解析。请只输出合法 JSON，字段包含 days 数组。'
      : '')
    const result = await chatCompletion([{
      role: 'system',
      content: systemPrompt,
    }, {
      role: 'user',
      content: '学习路径：' + path.title + '\n模块：' + path.modules.map(m => m.title).join('、') + '\n知识点摘要：' + kpSummary + '\n每天学习：' + dailyHours + '小时\n开始日期：' + startDate,
    }], {
      temperature: 0.3,
      timeoutMs: 120000,
      signal: opts?.signal,
    })
    const raw = parseAndValidateAiJson(result, isStudyPlanLike, '学习计划')
    const plan = normalizeStudyPlan(raw)
    if (!plan.id) plan.id = 'plan-' + Date.now()
    return plan
  }, { retries: 2, label: '生成学习计划' })
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
  const systemPromptBase = await loadPrompt('quiz',
    '你是出题引擎。\n' +
    '规则：输出严格 JSON。\n' +
    '混合多种题型：choice/fill_blank/coding/case_study/essay。\n' +
    '难度分布：easy 40% + medium 40% + hard 20%。\n' +
    '每题满分 20 分。\n' +
    '选择题必须有 4 个选项。\n' +
    '每道题必须有详细解析。'
  )

  return withRetry(async (attempt) => {
    const systemPrompt = systemPromptBase + (attempt > 0
      ? '\n\n【重要】上一次输出无法解析。请只输出 {"exercises":[...]} JSON。'
      : '')
    const result = await chatCompletion([{
      role: 'system',
      content: systemPrompt,
    }, {
      role: 'user',
      content: '知识点：' + kp.title + ' - ' + kp.description + '\n生成 ' + count + ' 道练习题。',
    }])
    const raw = parseAndValidateAiJson(result, isExerciseArray, '练习题')
    return normalizeExercises(raw, kp.id)
  }, { retries: 2, label: '生成练习题' })
}

// ==================== 5. 作业评分 ====================
export async function gradeSubmission(
  exercise: Exercise,
  studentAnswer: string,
): Promise<{ isCorrect: boolean; score: number; feedback: string }> {
  const systemPromptBase = await loadPrompt('reviewer',
    '你是评分引擎。\n' +
    '规则：输出严格 JSON {"isCorrect": bool, "score": 0-100, "feedback": "评语"}。\n' +
    '评分维度：正确性 40% + 完整性 25% + 规范性 20% + 创新性 15%。\n' +
    '评语先肯定优点，再指出不足。\n' +
    '给出具体的改进建议。\n' +
    '评语 100-200 字。'
  )

  return withRetry(async (attempt) => {
    const systemPrompt = systemPromptBase + (attempt > 0
      ? '\n\n【重要】只输出 JSON：{"isCorrect":bool,"score":number,"feedback":string}'
      : '')
    const result = await chatCompletion([{
      role: 'system',
      content: systemPrompt,
    }, {
      role: 'user',
      content: '题目：' + exercise.question + '\n正确答案：' + exercise.correctAnswer + '\n学生回答：' + studentAnswer + '\n满分：' + exercise.score,
    }])
    const raw = parseAndValidateAiJson(result, isGradeResult, '评分结果')
    return {
      isCorrect: Boolean(raw.isCorrect),
      score: asNumber(raw.score, 0),
      feedback: asString(raw.feedback, '已评分'),
    }
  }, { retries: 1, label: '评分' })
}

// ==================== 6. 每日总结 ====================
export async function generateDailySummary(
  learnedPoints: string[],
  completedHours: number,
  quizScores: number[],
  opts?: { signal?: AbortSignal },
): Promise<DailySummary> {
  const avgScore = quizScores.length > 0
    ? Math.round(quizScores.reduce((a: number, b: number) => a + b, 0) / quizScores.length)
    : 0

  const systemPromptBase = await loadPrompt('summary',
    '你是学习总结引擎。\n' +
    '规则：输出严格 JSON。\n' +
    '基于实际数据，不编造。\n' +
    '低于 70 分标记为薄弱点。\n' +
    '建议要具体，不说空话。\n' +
    '以鼓励为主。\n' +
    '给出明日计划建议。'
  )

  return withRetry(async (attempt) => {
    const systemPrompt = systemPromptBase + (attempt > 0
      ? '\n\n【重要】只输出合法 JSON 对象，包含 learnedPoints/suggestions/weakPoints。'
      : '')
    const result = await chatCompletion([{
      role: 'system',
      content: systemPrompt,
    }, {
      role: 'user',
      content: '今日学习内容：' + (learnedPoints.join('、') || '无') + '\n学习时长：' + completedHours + '小时\n测验分数：' + (quizScores.join(', ') || '无') + '分（平均 ' + avgScore + ' 分）',
    }], {
      temperature: 0.3,
      timeoutMs: 90000,
      signal: opts?.signal,
    })
    const raw = parseAndValidateAiJson(result, isDailySummaryLike, '每日总结')
    const summary = normalizeDailySummary(raw)
    if (!summary.learnedPoints.length) summary.learnedPoints = learnedPoints
    if (!summary.completedHours) summary.completedHours = completedHours
    if (!summary.quizScores.length) summary.quizScores = quizScores
    return summary
  }, { retries: 2, label: '生成每日总结' })
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

  // Docs are Markdown, not JSON — return as-is (strip accidental fences)
  return result.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

// ==================== 8. RAG - 流程图 ====================
export async function generateMermaidDiagram(
  topic: string,
  description: string,
): Promise<{ type: string; code: string; caption: string }[]> {
  const systemPromptBase = await loadPrompt('diagram',
    '你是流程图生成引擎。\n' +
    '规则：输出严格 JSON {"diagrams": [{"type": "flowchart|sequenceDiagram|graph", "code": "mermaid 代码", "caption": "图注"}]}。\n' +
    '用 Mermaid 语法绘制。\n' +
    '帮助理解知识结构。'
  )

  return withRetry(async (attempt) => {
    const systemPrompt = systemPromptBase + (attempt > 0
      ? '\n\n【重要】只输出 {"diagrams":[...]} JSON。code 必须是合法 Mermaid。'
      : '')
    const result = await chatCompletion([{
      role: 'system',
      content: systemPrompt,
    }, {
      role: 'user',
      content: '主题：' + topic + '\n描述：' + description,
    }])
    const raw = parseAndValidateAiJson(result, isDiagramArray, '流程图')
    const diagrams = normalizeDiagrams(raw)
    if (diagrams.length === 0) throw new AiJsonError('流程图为空', result)
    return diagrams
  }, { retries: 1, label: '生成流程图' })
}

// ==================== 9. 情感陪伴 ====================
export async function chatWithCompanion(
  messages: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
): Promise<string> {
  const systemPrompt = await loadPrompt('companion',
    '你是「星语」，AI Learning OS 里的情感陪伴伙伴。\n' +
    '用户可能学累了、焦虑、迷茫、孤独或只想找人聊聊。\n' +
    '你的原则：\n' +
    '1. 先共情，再回应；不说教，不评判。\n' +
    '2. 语气温暖、真诚、轻松，像懂事的朋友。\n' +
    '3. 适度简短：通常 80-180 字，必要时可稍长。\n' +
    '4. 可给轻量放松建议（呼吸、休息、散步），但不要替代专业心理咨询。\n' +
    '5. 若用户表达自伤/轻生等危机倾向，温和劝其寻求现实中亲友或专业帮助。\n' +
    '6. 不要主动把话题拉回学习，除非用户自己想聊。\n' +
    '7. 用中文回复。'
  )

  const history = messages.slice(-12).map((m) => ({
    role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
    content: m.content,
  }))

  const result = await chatCompletion([
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ], { temperature: 0.85, maxTokens: 1024 })

  return result.trim() || '我在这儿呢。想说什么都可以。'
}
