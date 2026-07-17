<!-- 知识点详情面板 -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useLearningStore } from '@/store/learning'
import { toastError, toastSuccess, toastWarning } from '@/utils/toast'
import type {
  KnowledgePoint,
  LearningProgress,
  Exercise,
  ExerciseSubmission,
  TestResult,
  TeachingMessage,
} from '@/types/learning'
import AiChat from '@/components/AiChat.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { renderMarkdown, sanitizeSvg } from '@/utils/markdown'

interface Props {
  kp: KnowledgePoint
  module: { title: string; icon: string }
  progress?: LearningProgress
}
const props = defineProps<Props>()
const emit = defineEmits<{ close: []; next: [kpId: string] }>()
const store = useLearningStore()

const activeTab = ref<'explain' | 'doc' | 'video' | 'exercise' | 'test' | 'note' | 'diagram'>('explain')
const chatMessages = ref<TeachingMessage[]>([])
const chatBusy = ref(false)
const docMarkdown = ref('')
const docHtml = computed(() => (docMarkdown.value ? renderMarkdown(docMarkdown.value) : ''))
const showDocLoading = ref(false)
const localNotes = ref('')

const diagramLoading = ref(false)
const diagrams = ref<{ type: string; code: string; caption: string }[]>([])
const mermaidHtml = ref<string[]>([])

const exercises = ref<Exercise[]>([])
const exerciseLoading = ref(false)
const exerciseAnswers = ref<Record<string, string>>({})
const exerciseGrades = ref<Map<string, { isCorrect: boolean; score: number; feedback: string }>>(new Map())

const testExercises = ref<Exercise[]>([])
const testLoading = ref(false)
const testGrading = ref(false)
const testAnswers = ref<Record<string, string>>({})
const testResults = ref<TestResult | null>(null)
const testSubmitted = ref(false)

function restoreSessionForKp(kpId: string) {
  chatMessages.value = store.getTeachingMessages(kpId)
  const prog = store.getKnowledgePointProgress(kpId)
  if (prog?.generatedDocs) docMarkdown.value = prog.generatedDocs
  else docMarkdown.value = ''

  if (prog?.generatedDiagrams?.length) {
    diagrams.value = prog.generatedDiagrams
    mermaidHtml.value = []
  } else {
    diagrams.value = []
    mermaidHtml.value = []
  }

  localNotes.value = prog?.notes ?? ''
  exercises.value = []
  exerciseAnswers.value = {}
  exerciseGrades.value = new Map()
  testExercises.value = []
  testAnswers.value = {}
  testResults.value = null
  testSubmitted.value = false
}

restoreSessionForKp(props.kp.id)
store.markKnowledgePointStarted(props.kp.id)

const nextTarget = computed(() => store.getNextKnowledgePoint(props.kp.id))
const isCurrentDone = computed(() => {
  const st = props.progress?.status
  return st === 'completed' || st === 'mastered'
})
const quizSummary = ref<{ status: string; percentage: number } | null>(null)

watch(
  () => props.kp.id,
  (id) => {
    activeTab.value = 'explain'
    restoreSessionForKp(id)
    quizSummary.value = null
    store.markKnowledgePointStarted(id)
  },
)

watch(
  () => props.progress?.notes,
  (val) => {
    if (val !== undefined) localNotes.value = val
  },
)

const tabs = [
  { key: 'explain' as const, label: 'AI 讲解', icon: '🤖' },
  { key: 'doc' as const, label: '学习文档', icon: '📄' },
  { key: 'video' as const, label: '推荐视频', icon: '🎬' },
  { key: 'exercise' as const, label: '练习', icon: '💪' },
  { key: 'test' as const, label: '测试', icon: '📋' },
  { key: 'diagram' as const, label: '图表', icon: '📊' },
  { key: 'note' as const, label: '笔记', icon: '📝' },
]

function getStatusColor(status?: string) {
  if (status === 'completed' || status === 'mastered') return '#22c3a6'
  if (status === 'in_progress') return '#f0b429'
  return '#7b8aa3'
}

function getStatusLabel(status?: string) {
  if (status === 'completed' || status === 'mastered') return '已掌握'
  if (status === 'in_progress') return '学习中'
  return '未开始'
}

async function loadDoc() {
  if (docMarkdown.value) return
  showDocLoading.value = true
  try {
    docMarkdown.value = await store.generateDocForKP(props.kp.id)
  } catch {
    docMarkdown.value = '## 文档生成失败\n\n请稍后重试。'
  } finally {
    showDocLoading.value = false
  }
}

function updateProgress(status: LearningProgress['status']) {
  store.updateKnowledgePointProgress(props.kp.id, status)
}

async function handleChatSend(answer: string) {
  if (chatBusy.value) return
  chatBusy.value = true
  try {
    const session = await store.submitAnswer(props.kp.id, answer)
    chatMessages.value = session?.messages ? [...session.messages] : store.getTeachingMessages(props.kp.id)
  } catch (e) {
    chatMessages.value = [
      ...chatMessages.value,
      {
        id: 'err-' + Date.now(),
        role: 'teacher',
        content: e instanceof Error ? e.message : '发送失败，请重试',
        type: 'feedback',
        timestamp: new Date().toISOString(),
      },
    ]
  } finally {
    chatBusy.value = false
  }
}

async function startTeachingSession(forceNew = false) {
  if (chatBusy.value) return
  chatBusy.value = true
  try {
    await store.startTeaching(props.kp.id, { forceNew })
    chatMessages.value = store.getTeachingMessages(props.kp.id)
  } catch (e) {
    chatMessages.value = [
      ...chatMessages.value,
      {
        id: 'err-' + Date.now(),
        role: 'teacher',
        content: e instanceof Error ? `教学启动失败：${e.message}` : '教学启动失败，请重试',
        type: 'text',
        timestamp: new Date().toISOString(),
      },
    ]
  } finally {
    chatBusy.value = false
  }
}

function saveNotes() {
  store.saveNotes(props.kp.id, localNotes.value)
}

async function renderDiagramSvgs() {
  mermaidHtml.value = []
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' })
  for (let idx = 0; idx < diagrams.value.length; idx++) {
    const diag = diagrams.value[idx]
    try {
      const id = 'mermaid-diagram-' + props.kp.id.replace(/[^a-zA-Z0-9_-]/g, '') + '-' + idx + '-' + Date.now()
      const result = await mermaid.render(id, diag.code)
      mermaidHtml.value.push(sanitizeSvg(result.svg))
    } catch {
      mermaidHtml.value.push('<p class="diagram-error">图表渲染失败</p>')
    }
  }
}

async function loadDiagrams() {
  if (diagrams.value.length && mermaidHtml.value.length) return
  diagramLoading.value = true
  try {
    if (!diagrams.value.length) {
      diagrams.value = await store.generateDiagramsForKP(props.kp.id)
    }
    await renderDiagramSvgs()
  } catch {
    diagrams.value = []
    mermaidHtml.value = []
  } finally {
    diagramLoading.value = false
  }
}

async function generateExercises() {
  exerciseLoading.value = true
  exercises.value = []
  exerciseAnswers.value = {}
  exerciseGrades.value = new Map()
  try {
    exercises.value = await store.generateExercisesForKP(props.kp.id, 5)
  } catch {
    exercises.value = []
    toastError('练习题生成失败，请重试')
  } finally {
    exerciseLoading.value = false
  }
}

async function gradeSingleExercise(exercise: Exercise) {
  const answer = exerciseAnswers.value[exercise.id] ?? ''
  if (!answer.trim()) {
    toastWarning('请先作答再提交')
    return
  }
  try {
    const result = await store.gradeExercise(exercise, answer)
    exerciseGrades.value.set(exercise.id, result)
  } catch {
    toastError('评分失败，请重试')
  }
}

function getExerciseTypeLabel(type: string): string {
  const map: Record<string, string> = {
    choice: '单选题',
    fill_blank: '填空题',
    coding: '编程题',
    case_study: '案例分析',
    essay: '论述题',
  }
  return map[type] || type
}

async function generateTest() {
  testLoading.value = true
  testExercises.value = []
  testAnswers.value = {}
  testResults.value = null
  testSubmitted.value = false
  try {
    testExercises.value = await store.generateExercisesForKP(props.kp.id, 10)
  } catch {
    testExercises.value = []
    toastError('测试题生成失败，请重试')
  } finally {
    testLoading.value = false
  }
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length || 1) }, () => run())
  await Promise.all(runners)
  return results
}

async function submitTest() {
  if (!testExercises.value.length) {
    toastWarning('请先生成测试题目')
    return
  }
  const unanswered = testExercises.value.filter((e) => !testAnswers.value[e.id]?.trim())
  if (unanswered.length) {
    if (!confirm(`还有 ${unanswered.length} 题未作答，确定要提交吗？未答题将计 0 分。`)) return
  }

  testSubmitted.value = true
  testGrading.value = true

  try {
    const graded = await mapPool(testExercises.value, 4, async (ex) => {
      const answer = testAnswers.value[ex.id] ?? ''
      try {
        const result = await store.gradeExercise(ex, answer)
        return { ex, answer, result }
      } catch {
        return {
          ex,
          answer,
          result: { isCorrect: false, score: 0, feedback: '评分失败' },
        }
      }
    })

    const submissions: ExerciseSubmission[] = []
    let totalScore = 0
    const maxScore = testExercises.value.reduce((s, e) => s + e.score, 0)
    const weaknesses: string[] = []
    const strengths: string[] = []

    for (const item of graded) {
      submissions.push({
        exerciseId: item.ex.id,
        studentAnswer: item.answer,
        ...item.result,
      })
      totalScore += item.result.score
      if (item.ex.score > 0 && item.result.score / item.ex.score < 0.6) weaknesses.push(item.ex.title)
      else strengths.push(item.ex.title)
    }

    testResults.value = {
      id: `test-${Date.now()}`,
      kpId: props.kp.id,
      exercises: submissions,
      totalScore,
      maxScore,
      percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
      weaknesses,
      strengths,
      createdAt: new Date().toISOString(),
    }

    const applied = store.applyQuizResult(props.kp.id, testResults.value.percentage)
    if (applied) {
      quizSummary.value = {
        status: applied.status,
        percentage: testResults.value.percentage,
      }
    }
  } finally {
    testGrading.value = false
  }
}

function getTestGradeColor(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  if (pct >= 80) return '#22c3a6'
  if (pct >= 60) return '#f0b429'
  return '#ff5d6c'
}

function goNextKnowledgePoint() {
  const next = nextTarget.value
  if (!next) return
  emit('next', next.kpId)
}

function completeAndGoNext(status: 'completed' | 'mastered' = 'completed') {
  const result = store.completeAndGetNext(props.kp.id, status)
  if (!result) {
    toastError('无法更新进度，请稍后重试')
    return
  }
  if (result.next) {
    toastSuccess(status === 'mastered' ? '已掌握，进入下一个' : '已完成，进入下一个')
    emit('next', result.next.kpId)
    return
  }
  toastSuccess('当前路径知识点已全部完成')
}

function reviewAgain() {
  activeTab.value = 'exercise'
  toastWarning('建议先巩固练习，再重新测试')
}

function statusHint(status?: string) {
  if (status === 'mastered') return '已掌握'
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '学习中'
  return '未开始'
}
</script>

<template>
  <div class="detail-panel">
    <div class="panel-header">
      <div class="header-info">
        <span class="module-tag">{{ module.icon }} {{ module.title }}</span>
        <h2>{{ kp.title }}</h2>
        <p class="kp-desc">{{ kp.description }}</p>
      </div>
      <button class="close-btn" type="button" @click="emit('close')">✕</button>
    </div>

    <div class="progress-control">
      <div class="progress-info">
        <span class="progress-label">掌握程度</span>
        <span class="progress-value" :style="{ color: getStatusColor(progress?.status) }">{{ getStatusLabel(progress?.status) }}</span>
      </div>
      <ProgressBar
        :percent="progress?.status === 'completed' || progress?.status === 'mastered' ? 100 : progress?.status === 'in_progress' ? 50 : 0"
        size="sm"
        :show-label="false"
      />
      <div class="progress-buttons">
        <button class="p-btn" type="button" :class="{ active: progress?.status === 'not_started' }" @click="updateProgress('not_started')">未开始</button>
        <button class="p-btn" type="button" :class="{ active: progress?.status === 'in_progress' }" @click="updateProgress('in_progress')">学习中</button>
        <button class="p-btn completed" type="button" :class="{ active: progress?.status === 'completed' || progress?.status === 'mastered' }" @click="updateProgress('completed')">已完成</button>
      </div>
      <div class="finish-actions">
        <button
          class="btn btn-primary finish-next-btn"
          type="button"
          @click="completeAndGoNext(isCurrentDone && progress?.status === 'mastered' ? 'mastered' : 'completed')"
        >
          {{ nextTarget ? '学完并进入下一个' : '标记学完' }}
        </button>
        <button
          v-if="nextTarget"
          class="btn btn-secondary"
          type="button"
          @click="goNextKnowledgePoint"
        >
          跳过，直接下一个
        </button>
      </div>
      <div v-if="nextTarget" class="next-learning">
        <div class="next-learning-text">
          <strong>下一步</strong>
          <span>{{ nextTarget.kpTitle }}</span>
        </div>
      </div>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span>{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="tab-content">
      <div v-if="activeTab === 'explain'" class="tab-pane explain-pane">
        <AiChat :messages="chatMessages" :kp-title="kp.title" :disabled="chatBusy" class="chat-container" @send="handleChatSend" />
        <div class="teach-actions">
          <button class="btn btn-primary" type="button" :disabled="chatBusy" @click="startTeachingSession(false)">
            {{ chatBusy ? '思考中...' : (chatMessages.length ? '继续教学' : '开始 AI 教学') }}
          </button>
          <button
            v-if="chatMessages.length"
            class="btn btn-secondary"
            type="button"
            :disabled="chatBusy"
            @click="startTeachingSession(true)"
          >
            重新开课
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'doc'" class="tab-pane">
        <div v-if="!docMarkdown && !showDocLoading" class="empty-state">
          <p>AI 会根据当前知识点生成结构化学习文档</p>
          <button class="btn btn-secondary" type="button" @click="loadDoc">生成文档</button>
        </div>
        <div v-else-if="showDocLoading" class="empty-state"><p>正在生成文档...</p></div>
        <div v-else class="doc-content" v-html="docHtml"></div>
      </div>

      <div v-if="activeTab === 'video'" class="tab-pane">
        <div class="video-list">
          <div v-for="res in kp.resources.filter(r => r.type === 'video')" :key="res.id" class="video-card">
            <span class="video-icon">🎬</span>
            <div class="video-info">
              <h4>{{ res.title }}</h4>
              <p>{{ res.description }}</p>
              <div class="video-meta">
                <span v-if="res.duration">{{ res.duration }}</span>
                <span v-if="res.source">{{ res.source }}</span>
                <span v-if="res.rating">{{ '⭐'.repeat(res.rating!) }}</span>
              </div>
            </div>
            <a :href="res.url" target="_blank" class="video-link">观看</a>
          </div>
          <div v-if="kp.resources.filter(r => r.type === 'video').length === 0" class="empty-state"><p>暂无视频资源</p></div>
        </div>
      </div>

      <div v-if="activeTab === 'exercise'" class="tab-pane">
        <div v-if="!exercises.length && !exerciseLoading" class="empty-state">
          <p>生成练习题，巩固当前知识点</p>
          <button class="btn btn-secondary" type="button" :disabled="exerciseLoading" @click="generateExercises">
            {{ exerciseLoading ? '生成中...' : '生成练习题' }}
          </button>
        </div>
        <div v-else-if="exerciseLoading" class="empty-state"><p>正在生成练习题...</p></div>
        <div v-else class="card-list">
          <div v-for="(ex, idx) in exercises" :key="ex.id" class="content-card">
            <div class="card-head">
              <span class="type-badge" :class="ex.type">{{ getExerciseTypeLabel(ex.type) }}</span>
              <span class="score-tag">{{ ex.score }} 分</span>
            </div>
            <h4>{{ ex.title }}</h4>
            <p class="question">{{ ex.question }}</p>

            <template v-if="ex.type === 'choice' && ex.options">
              <div class="choice-options">
                <label v-for="(opt, oi) in ex.options" :key="oi" class="choice-label">
                  <input type="radio" :name="'ex-' + idx" :value="opt" v-model="exerciseAnswers[ex.id]" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </template>
            <template v-else-if="ex.type === 'coding'">
              <textarea v-model="exerciseAnswers[ex.id]" class="field-input code-input" rows="6" placeholder="请在此编写代码..." />
            </template>
            <template v-else>
              <textarea
                v-model="exerciseAnswers[ex.id]"
                class="field-input"
                :rows="ex.type === 'fill_blank' ? 2 : 4"
                :placeholder="ex.type === 'fill_blank' ? '请输入答案...' : '请输入你的分析...'"
              />
            </template>

            <div v-if="exerciseGrades.has(ex.id)" class="result-box" :class="{ correct: exerciseGrades.get(ex.id)!.isCorrect }">
              <div class="result-score">得分：{{ exerciseGrades.get(ex.id)!.score }} / {{ ex.score }}</div>
              <p>{{ exerciseGrades.get(ex.id)!.feedback }}</p>
              <div v-if="ex.type === 'choice' || ex.type === 'fill_blank'" class="correct-answer">正确答案：{{ ex.correctAnswer }}</div>
            </div>
            <button v-else class="btn btn-primary" type="button" @click="gradeSingleExercise(ex)">提交答案</button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'test'" class="tab-pane">
        <div v-if="!testExercises.length && !testLoading && !testSubmitted" class="empty-state">
          <p>生成一组题目做自测，检验学习成果</p>
          <button class="btn btn-secondary" type="button" :disabled="testLoading" @click="generateTest">
            {{ testLoading ? '生成中...' : '生成测试题' }}
          </button>
        </div>
        <div v-else-if="testLoading" class="empty-state"><p>正在生成测试题目...</p></div>
        <div v-else-if="testResults" class="card-list">
          <div class="summary-card">
            <div class="score-big" :style="{ color: getTestGradeColor(testResults.totalScore, testResults.maxScore) }">
              {{ testResults.percentage }} 分
            </div>
            <div class="muted">总分 {{ testResults.totalScore }} / {{ testResults.maxScore }}</div>
            <div v-if="quizSummary" class="quiz-auto-result">
              自动更新进度为：{{ statusHint(quizSummary.status) }}
            </div>
            <div
              v-if="quizSummary && (quizSummary.status === 'completed' || quizSummary.status === 'mastered')"
              class="next-learning compact"
            >
              <div class="next-learning-text">
                <strong>{{ nextTarget ? '下一知识点' : '本路径已完成' }}</strong>
                <span>{{ nextTarget ? nextTarget.kpTitle : '可以回到知识树复盘薄弱点' }}</span>
              </div>
              <button
                v-if="nextTarget"
                class="btn btn-primary"
                type="button"
                @click="completeAndGoNext(quizSummary.status === 'mastered' ? 'mastered' : 'completed')"
              >
                学完并进入下一个
              </button>
            </div>
            <div
              v-else-if="quizSummary && quizSummary.percentage < 60"
              class="next-learning compact weak-cta"
            >
              <div class="next-learning-text">
                <strong>建议先复习</strong>
                <span>当前得分偏低，巩固后再推进</span>
              </div>
              <button class="btn btn-secondary" type="button" @click="reviewAgain">去练习</button>
            </div>
            <div class="bar-rows">
              <div class="bar-row">
                <span>正确</span>
                <div class="bar-track"><div class="bar-fill good" :style="{ width: (testResults.strengths.length / testExercises.length * 100) + '%' }"></div></div>
                <span>{{ testResults.strengths.length }}</span>
              </div>
              <div class="bar-row">
                <span>薄弱</span>
                <div class="bar-track"><div class="bar-fill bad" :style="{ width: (testResults.weaknesses.length / testExercises.length * 100) + '%' }"></div></div>
                <span>{{ testResults.weaknesses.length }}</span>
              </div>
            </div>
          </div>

          <div v-if="testResults.weaknesses.length" class="content-card">
            <h4>薄弱点</h4>
            <ul><li v-for="w in testResults.weaknesses" :key="w">{{ w }}</li></ul>
          </div>
          <div class="content-card">
            <h4>掌握良好</h4>
            <ul><li v-for="s in testResults.strengths" :key="s">{{ s }}</li></ul>
          </div>

          <div class="content-card" v-for="(sub, si) in testResults.exercises" :key="si">
            <div class="card-head">
              <span>第 {{ si + 1 }} 题</span>
              <span :style="{ color: getTestGradeColor(sub.score, testExercises[si]?.score || 1) }">
                {{ sub.score }} / {{ testExercises[si]?.score || '?' }}
              </span>
            </div>
            <p class="question">{{ testExercises[si]?.question }}</p>
            <p class="muted">你的答案：{{ sub.studentAnswer || '(未作答)' }}</p>
            <p v-if="testExercises[si]?.type === 'choice'" class="good-text">正确答案：{{ testExercises[si]?.correctAnswer }}</p>
            <p class="muted">{{ sub.feedback }}</p>
          </div>

          <button class="btn btn-secondary" type="button" @click="generateTest">重新测试</button>
        </div>
        <div v-else class="card-list">
          <div class="empty-state tight"><p>共 {{ testExercises.length }} 题，请连续作答后提交</p></div>
          <div v-for="(ex, idx) in testExercises" :key="ex.id" class="content-card">
            <div class="card-head">
              <span class="type-badge" :class="ex.type">{{ getExerciseTypeLabel(ex.type) }}</span>
              <span class="score-tag">{{ ex.score }} 分</span>
            </div>
            <h4>第 {{ idx + 1 }} 题：{{ ex.title }}</h4>
            <p class="question">{{ ex.question }}</p>
            <template v-if="ex.type === 'choice' && ex.options">
              <div class="choice-options">
                <label v-for="(opt, oi) in ex.options" :key="oi" class="choice-label">
                  <input type="radio" :name="'test-' + idx" :value="opt" v-model="testAnswers[ex.id]" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </template>
            <template v-else-if="ex.type === 'coding'">
              <textarea v-model="testAnswers[ex.id]" class="field-input code-input" rows="6" placeholder="请在此编写代码..." />
            </template>
            <template v-else>
              <textarea
                v-model="testAnswers[ex.id]"
                class="field-input"
                :rows="ex.type === 'fill_blank' ? 2 : 4"
                :placeholder="ex.type === 'fill_blank' ? '请输入答案...' : '请输入你的分析...'"
              />
            </template>
          </div>
          <button class="btn btn-teal" type="button" :disabled="testGrading" @click="submitTest">
            {{ testGrading ? 'AI 评分中...' : '提交全部' }}
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'diagram'" class="tab-pane">
        <div v-if="!diagrams.length && !diagramLoading" class="empty-state">
          <p>生成思维导图和流程图，帮助理解结构</p>
          <button class="btn btn-secondary" type="button" :disabled="diagramLoading" @click="loadDiagrams">
            {{ diagramLoading ? '生成中...' : '生成图表' }}
          </button>
        </div>
        <div v-else-if="diagramLoading" class="empty-state"><p>正在生成图表...</p></div>
        <div v-else class="card-list">
          <div v-for="(diag, idx) in diagrams" :key="idx" class="content-card">
            <h4>{{ diag.caption }}</h4>
            <div class="mermaid-container" v-html="mermaidHtml[idx]"></div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'note'" class="tab-pane">
        <textarea
          v-model="localNotes"
          class="field-input note-area"
          rows="10"
          placeholder="记录你的学习笔记..."
          @blur="saveNotes"
        />
      </div>
    </div>

    <div class="kp-details">
      <div v-if="kp.keyPoints?.length" class="detail-block">
        <h3>核心要点</h3>
        <ul><li v-for="(p, i) in kp.keyPoints" :key="i">{{ p }}</li></ul>
      </div>
      <div v-if="kp.commonMistakes?.length" class="detail-block">
        <h3>常见误区</h3>
        <ul><li v-for="(m, i) in kp.commonMistakes" :key="i">{{ m }}</li></ul>
      </div>
      <div v-if="kp.estimatedHours" class="detail-block">
        <h3>预计学习时长</h3>
        <p>{{ kp.estimatedHours }} 小时</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  width: min(920px, 100vw);
  height: 100vh;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(79,140,255,0.05), transparent 16%),
    rgba(10, 15, 26, 0.98);
  border-left: 1px solid var(--border);
  box-shadow: -20px 0 50px rgba(0,0,0,0.35);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}

.header-info {
  min-width: 0;
  flex: 1;
}

.module-tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(79,140,255,0.25);
  background: rgba(79,140,255,0.12);
  color: #c7dbff;
  font-size: 12px;
  margin-bottom: 10px;
}

.panel-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #f4f7ff;
  line-height: 1.3;
}

.kp-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.close-btn:hover {
  color: #fff;
  border-color: rgba(255,93,108,0.35);
  background: rgba(255,93,108,0.08);
}

.progress-control {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.015);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-label {
  font-size: 12px;
  color: var(--text-muted);
}

.progress-value {
  font-size: 13px;
  font-weight: 650;
}

.progress-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.finish-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.finish-next-btn {
  flex: 1 1 auto;
  min-width: 140px;
}

.next-learning {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(79, 140, 255, 0.25);
  background: rgba(79, 140, 255, 0.08);
}

.next-learning.compact {
  margin-top: 14px;
}

.next-learning.weak-cta {
  border-color: rgba(255, 93, 108, 0.28);
  background: rgba(255, 93, 108, 0.08);
}

.next-learning-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.next-learning-text strong {
  font-size: 11px;
  color: #9ec0ff;
}

.next-learning-text span {
  font-size: 13px;
  color: #f2f6ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quiz-auto-result {
  margin-top: 10px;
  font-size: 12px;
  color: #8ef0da;
}

.p-btn {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.p-btn.active {
  color: #dce9ff;
  border-color: rgba(79,140,255,0.4);
  background: rgba(79,140,255,0.14);
}

.p-btn.completed.active {
  color: #b8fff0;
  border-color: rgba(34,195,166,0.4);
  background: rgba(34,195,166,0.14);
}

.tab-bar {
  display: flex;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.tab-btn.active {
  color: #dce9ff;
  background: rgba(79,140,255,0.14);
  border-color: rgba(79,140,255,0.28);
}

.tab-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 20px;
}

.tab-pane {
  min-height: 280px;
}

.explain-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-container {
  min-height: 320px;
}

.teach-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.empty-state.tight {
  padding: 12px 0 4px;
}

.empty-state p,
.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.doc-content {
  color: var(--text-secondary);
  line-height: 1.8;
  font-size: 14px;
}

.doc-content :deep(h1),
.doc-content :deep(h2),
.doc-content :deep(h3) {
  color: #f2f6ff;
  margin: 1.1em 0 0.45em;
}

.doc-content :deep(h1) { font-size: 1.35rem; }
.doc-content :deep(h2) { font-size: 1.15rem; }
.doc-content :deep(h3) { font-size: 1rem; }
.doc-content :deep(p) { margin: 0.55em 0; }
.doc-content :deep(ul),
.doc-content :deep(ol) { padding-left: 1.2em; margin: 0.55em 0; }
.doc-content :deep(pre) {
  background: rgba(0,0,0,0.28);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  overflow-x: auto;
  font-size: 12px;
}
.doc-content :deep(code) { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.doc-content :deep(a) { color: #9ec0ff; }

.video-list,
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.video-card,
.content-card,
.summary-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255,255,255,0.025);
  padding: 14px;
}

.video-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.video-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.video-info {
  min-width: 0;
  flex: 1;
}

.video-info h4,
.content-card h4,
.summary-card h4,
.detail-block h3 {
  margin: 0 0 6px;
  color: #f2f6ff;
  font-size: 14px;
}

.video-info p,
.question {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.video-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.video-link {
  color: #8ef0da;
  text-decoration: none;
  font-size: 13px;
  flex-shrink: 0;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.type-badge,
.score-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
}

.type-badge.choice { background: rgba(79,140,255,0.14); color: #9ec0ff; }
.type-badge.fill_blank { background: rgba(34,195,166,0.14); color: #8ef0da; }
.type-badge.coding { background: rgba(240,180,41,0.14); color: #ffd56a; }
.type-badge.case_study { background: rgba(255,165,2,0.14); color: #ffc56d; }
.type-badge.essay { background: rgba(255,93,108,0.14); color: #ff9aa5; }
.score-tag { color: var(--text-muted); background: rgba(255,255,255,0.04); }

.choice-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.choice-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
}

.choice-label:hover {
  border-color: rgba(79,140,255,0.3);
  background: rgba(79,140,255,0.06);
}

.choice-label input {
  accent-color: #4f8cff;
  margin-top: 2px;
}

.field-input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border-strong);
  background: rgba(255,255,255,0.03);
  color: var(--text);
  padding: 12px 14px;
  outline: none;
  resize: vertical;
  font-size: 13px;
  line-height: 1.6;
}

.field-input:focus {
  border-color: rgba(79,140,255,0.45);
  box-shadow: 0 0 0 3px rgba(79,140,255,0.12);
}

.code-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.note-area {
  min-height: 280px;
}

.result-box {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
}

.result-box.correct {
  border-color: rgba(34,195,166,0.28);
  background: rgba(34,195,166,0.08);
}

.result-score {
  font-size: 13px;
  font-weight: 650;
  color: #8ef0da;
  margin-bottom: 6px;
}

.result-box p,
.correct-answer,
.good-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.good-text {
  color: #8ef0da;
}

.summary-card {
  text-align: center;
}

.score-big {
  font-size: 36px;
  font-weight: 750;
  margin-bottom: 6px;
}

.bar-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.bar-row {
  display: grid;
  grid-template-columns: 36px 1fr 24px;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.bar-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
}

.bar-fill.good { background: #22c3a6; }
.bar-fill.bad { background: #ff5d6c; }

.content-card ul {
  margin: 0;
  padding-left: 1.1em;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.mermaid-container {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  margin-top: 8px;
}

.kp-details {
  border-top: 1px solid var(--border);
  padding: 16px 20px 22px;
  background: rgba(7, 11, 20, 0.35);
}

.detail-block {
  margin-bottom: 14px;
}

.detail-block:last-child {
  margin-bottom: 0;
}

.detail-block ul {
  margin: 0;
  padding-left: 1.1em;
}

.detail-block li,
.detail-block p {
  margin: 0 0 4px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .detail-panel {
    width: 100vw;
  }
  .panel-header,
  .progress-control,
  .tab-content,
  .kp-details {
    padding-left: 14px;
    padding-right: 14px;
  }
  .panel-header h2 {
    font-size: 17px;
  }
  .tab-btn span:last-child {
    display: none;
  }
  .chat-container {
    min-height: 260px;
  }
}
</style>
