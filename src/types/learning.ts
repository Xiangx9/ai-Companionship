// AI Learning OS - 统一类型定义
// 所有数据结构使用结构化 JSON，不依赖自然语言解析

// ==================== 资源 ====================
export type ResourceType = 'document' | 'video' | 'exercise' | 'tutorial' | 'article' | 'quiz'

export interface LearningResource {
  id: string
  type: ResourceType
  title: string
  description: string
  url: string
  duration?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  tags?: string[]
  isExternal?: boolean
  source?: 'bilibili' | 'youtube' | 'coursera' | 'udemy' | 'mit_ocw' | 'official_doc' | 'ai_generated'
  rating?: number // 推荐指数 1-5
  updatedAt?: string
}

// ==================== 知识点 ====================
export interface KnowledgePoint {
  id: string
  title: string
  description: string
  prerequisites: string[]
  resources: LearningResource[]
  estimatedHours: number
  order: number
  keyPoints: string[]
  commonMistakes: string[]
  mermaidDiagrams?: { type: string; code: string; caption: string }[]
  aiGeneratedDocs?: string // Markdown 格式的 AI 生成文档
}

// ==================== 知识模块 ====================
export interface LearningModule {
  id: string
  title: string
  description: string
  icon: string
  knowledgePoints: KnowledgePoint[]
  estimatedHours: number
}

// ==================== 学习路径 ====================
export interface LearningPath {
  id: string
  title: string
  description: string
  level: 'beginner' | 'intermediate' | 'advanced'
  modules: LearningModule[]
  totalEstimatedHours: number
  tags: string[]
  // AI 生成的知识树扁平化表示（用于知识图谱渲染）
  knowledgeTree?: KnowledgeTreeNode
}

// 知识树节点（用于可缩放/拖动的图谱）
export interface KnowledgeTreeNode {
  id: string
  label: string
  children: KnowledgeTreeNode[]
  kpId?: string // 关联的知识点ID
  x?: number    // 布局坐标
  y?: number
  level?: number
}

// ==================== 学习计划 ====================
export interface StudyPlan {
  id: string
  projectId: string
  title: string
  dailyHours: number
  startDate: string
  endDate: string
  days: StudyDay[]
  updatedAt: string
}

export interface StudyDay {
  dayNumber: number
  date: string
  tasks: StudyTask[]
  completedTasks: string[] // taskIds
}

export interface StudyTask {
  id: string
  kpId: string
  moduleId: string
  title: string
  estimatedMinutes: number
  type: 'learn' | 'practice' | 'review' | 'test'
  order: number
}

// ==================== 学习进度 ====================
export interface LearningProgress {
  knowledgePointId: string
  status: 'not_started' | 'in_progress' | 'completed' | 'mastered'
  startedAt?: string
  completedAt?: string
  notes?: string
  quizScore?: number
  practiceAttempts?: number
  exercises?: any[]  // AI 生成的练习及提交结果
  generatedDocs?: string  // AI 生成的知识点文档(Markdown)
  generatedDiagrams?: { type: string; code: string; caption: string }[]  // AI 生成的 Mermaid 图
}

// ==================== AI 教学会话 ====================
export interface TeachingSession {
  id: string
  kpId: string
  messages: TeachingMessage[]
  currentStep: TeachingStep
  studentAnswer?: string
  score?: number
  createdAt: string
  updatedAt: string
}

export type TeachingStep = 'explaining' | 'giving_example' | 'drawing_diagram' | 'asking_question' | 'waiting_answer' | 'grading' | 'continuing' | 'finished'

export interface TeachingMessage {
  id: string
  role: 'teacher' | 'student'
  content: string
  type: 'text' | 'code' | 'diagram' | 'question' | 'feedback'
  timestamp: string
}

// ==================== 练习与测试 ====================
export interface Exercise {
  id: string
  kpId: string
  type: 'coding' | 'choice' | 'fill_blank' | 'case_study' | 'essay'
  title: string
  description: string
  question: string
  options?: string[] // 选择题选项
  correctAnswer: string
  hint?: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  score: number
  createdAt: string
}

export interface TestResult {
  id: string
  kpId: string
  exercises: ExerciseSubmission[]
  totalScore: number
  maxScore: number
  percentage: number
  weaknesses: string[]
  strengths: string[]
  createdAt: string
}

export interface ExerciseSubmission {
  exerciseId: string
  studentAnswer: string
  isCorrect: boolean
  score: number
  feedback: string
}

// ==================== 每日总结 ====================
export interface DailySummary {
  id: string
  date: string
  projectId: string
  learnedPoints: string[]
  completedHours: number
  quizScores: number[]
  weakPoints: string[]
  suggestions: string[]
  generatedAt: string
}

// ==================== 学习项目 ====================
export interface LearningProject {
  id: string
  name: string
  domain: string
  path: LearningPath
  progress: LearningProgress[]
  currentKnowledgePointId?: string
  studyPlan?: StudyPlan
  dailySummaries: DailySummary[]
  teachingSessions: TeachingSession[]
  createdAt: string
  updatedAt: string
}

// ==================== 学习领域 ====================
export interface LearningDomain {
  id: string
  name: string
  icon: string
  description: string
  popularPaths: string[]
}

// ==================== 导出格式 ====================
export type ExportFormat = 'markdown' | 'word' | 'pdf' | 'excel'

export interface ExportData {
  format: ExportFormat
  content: string
  fileName: string
}