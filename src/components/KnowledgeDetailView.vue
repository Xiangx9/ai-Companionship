<!-- 知识点详情面板 -->
<script setup lang="ts">
import mermaid from "mermaid"
import { ref, watch } from "vue"
import { useLearningStore } from "@/store/learning"
import type { KnowledgePoint, LearningProgress, Exercise, ExerciseSubmission, TestResult } from "@/types/learning"
import AiChat from "@/components/AiChat.vue"
import ProgressBar from "@/components/ProgressBar.vue"

interface Props {
  kp: KnowledgePoint
  module: { title: string; icon: string }
  progress?: LearningProgress
}
const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()
const store = useLearningStore()

const activeTab = ref<"explain" | "doc" | "video" | "exercise" | "test" | "note" | "diagram">("explain")
const chatMessages = ref<any[]>([])
const docContent = ref("")
const showDocLoading = ref(false)
const localNotes = ref(props.progress?.notes ?? "")

watch(() => props.progress?.notes, (val) => {
  if (val !== undefined) localNotes.value = val
})

const tabs = [
  { key: "explain" as const, label: "AI 讲解", icon: "🤖" },
  { key: "doc" as const, label: "学习文档", icon: "📄" },
  { key: "video" as const, label: "推荐视频", icon: "🎬" },
  { key: "exercise" as const, label: "练习", icon: "💪" },
  { key: "test" as const, label: "测试", icon: "📋" },
  { key: "diagram" as const, label: "图表", icon: "📊" },
  { key: "note" as const, label: "笔记", icon: "📝" },
]

function getStatusColor(status?: string) {
  if (status === "completed" || status === "mastered") return "#00b894"
  if (status === "in_progress") return "#fdcb6e"
  return "#636e72"
}

function getStatusLabel(status?: string) {
  if (status === "completed" || status === "mastered") return "已掌握"
  if (status === "in_progress") return "学习中"
  return "未开始"
}

async function loadDoc() {
  if (docContent.value) return
  showDocLoading.value = true
  try { docContent.value = await store.generateDocForKP(props.kp.id) } catch { docContent.value = "文档生成失败" }
  finally { showDocLoading.value = false }
}

function updateProgress(status: LearningProgress["status"]) {
  store.updateKnowledgePointProgress(props.kp.id, status)
}

async function handleChatSend(answer: string) {
  // First, add student message to local chat UI
  chatMessages.value.push({ id: "s-" + Date.now(), role: "student", content: answer, type: "text", timestamp: new Date().toISOString() })
  // Then call store to submit and get AI feedback
  try {
    const session = await store.submitAnswer(props.kp.id, answer)
    if (!session) {
      chatMessages.value.push({
        id: "t-" + Date.now(),
        role: "teacher",
        content: "请先点击「开始 AI 教学」按钮创建教学会话，然后再发送答案。",
        type: "text",
        timestamp: new Date().toISOString()
      })
      return
    }
    if (session.messages.length > 0) {
      // Add teacher feedback from store to local chat
      const lastMsg = session.messages[session.messages.length - 1]
      if (lastMsg.role === 'teacher') {
        chatMessages.value.push({ ...lastMsg, id: 't-' + Date.now() })
      }
    }
  } catch (e) {
    console.error('Failed to submit answer:', e)
  }
}

async function startTeachingSession() {
  try {
    const teacherMsg = await store.startTeaching(props.kp.id)
    if (teacherMsg) {
      chatMessages.value.push({ ...teacherMsg, id: 'init', role: 'teacher' })
    }
  } catch (e) {
    console.error('Failed to start teaching session:', e)
  }
}

function saveNotes() {
  if (props.progress) {
    props.progress.notes = localNotes.value
    store.persist()
  }
}

// ==================== Diagram Tab ====================
const diagramLoading = ref(false)
const diagrams = ref<{ type: string; code: string; caption: string }[]>([])
const mermaidHtml = ref<string[]>([])

async function loadDiagrams() {
  if (diagrams.value.length) return
  diagramLoading.value = true
  try {
    diagrams.value = await store.generateDiagramsForKP(props.kp.id)
    // Render each diagram to SVG
    for (let idx = 0; idx < diagrams.value.length; idx++) {
      const diag = diagrams.value[idx]
      try {
        const id = 'mermaid-diagram-' + idx
        const result = await mermaid.render(id, diag.code)
        mermaidHtml.value.push(result.svg)
      } catch {
        mermaidHtml.value.push('<p class="diagram-error">图表渲染失败</p>')
      }
    }
  } catch {
    diagrams.value = []
  } finally {
    diagramLoading.value = false
  }
}

// ==================== Exercise Tab ====================
const exercises = ref<Exercise[]>([])
const exerciseLoading = ref(false)
const exerciseAnswers = ref<Record<string, string>>({})
const exerciseGrades = ref<Map<string, { isCorrect: boolean; score: number; feedback: string }>>(new Map())

async function generateExercises() {
  exerciseLoading.value = true
  exercises.value = []
  exerciseAnswers.value = {}
  exerciseGrades.value = new Map()
  try {
    exercises.value = await store.generateExercisesForKP(props.kp.id, 5)
  } catch {
    exercises.value = []
  } finally {
    exerciseLoading.value = false
  }
}

async function gradeSingleExercise(exercise: Exercise) {
  const answer = exerciseAnswers.value[exercise.id] ?? ""
  if (!answer.trim()) { alert("请先作答再提交") ; return }
  try {
    const result = await store.gradeExercise(exercise, answer)
    exerciseGrades.value.set(exercise.id, result)
  } catch {
    alert("评分失败，请重试")
  }
}

function getExerciseTypeLabel(type: string): string {
  const map: Record<string, string> = {
    choice: "单选题", fill_blank: "填空题", coding: "编程题", case_study: "案例分析", essay: "论述题"
  }
  return map[type] || type
}

// ==================== Test Tab ====================
const testExercises = ref<Exercise[]>([])
const testLoading = ref(false)
const testAnswers = ref<Record<string, string>>({})
const testResults = ref<TestResult | null>(null)
const testSubmitted = ref(false)

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
  } finally {
    testLoading.value = false
  }
}

async function submitTest() {
  if (!testExercises.value.length) { alert("请先生成测试题目") ; return }
  const unanswered = testExercises.value.filter(e => !testAnswers.value[e.id]?.trim())
  if (unanswered.length) {
    if (!confirm(`还有 ${unanswered.length} 题未作答，确定要提交吗？未答题将计 0 分。`)) return
  }

  testSubmitted.value = true
  const submissions: ExerciseSubmission[] = []
  let totalScore = 0
  const maxScore = testExercises.value.reduce((s, e) => s + e.score, 0)
  const weaknesses: string[] = []
  const strengths: string[] = []

  for (const ex of testExercises.value) {
    const answer = testAnswers.value[ex.id] ?? ""
    let result: { isCorrect: boolean; score: number; feedback: string }
    try {
      result = await store.gradeExercise(ex, answer)
    } catch {
      result = { isCorrect: false, score: 0, feedback: "评分失败" }
    }
    submissions.push({ exerciseId: ex.id, studentAnswer: answer, ...result })
    totalScore += result.score

    if (result.score / ex.score < 0.6) {
      weaknesses.push(ex.title)
    } else {
      strengths.push(ex.title)
    }
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
}

function getTestGradeColor(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100
  if (pct >= 80) return "#00b894"
  if (pct >= 60) return "#fdcb6e"
  return "#ff4757"
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
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="progress-control">
      <div class="progress-info">
        <span class="progress-label">掌握程度</span>
        <span class="progress-value" :style="{ color: getStatusColor(progress?.status) }">{{ getStatusLabel(progress?.status) }}</span>
      </div>
      <ProgressBar :percent="progress?.status === 'completed' || progress?.status === 'mastered' ? 100 : progress?.status === 'in_progress' ? 50 : 0" size="sm" />
      <div class="progress-buttons">
        <button class="p-btn" :class="{ active: progress?.status === 'not_started' }" @click="updateProgress('not_started')">未开始</button>
        <button class="p-btn" :class="{ active: progress?.status === 'in_progress' }" @click="updateProgress('in_progress')">学习中</button>
        <button class="p-btn completed" :class="{ active: progress?.status === 'completed' || progress?.status === 'mastered' }" @click="updateProgress('completed')">已完成 ✅</button>
      </div>
    </div>

    <div class="tab-bar">
      <button v-for="tab in tabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ tab.icon }} {{ tab.label }}
      </button>
    </div>

    <div class="tab-content">
      <!-- Explain -->
      <div v-if="activeTab === 'explain'" class="tab-pane explain-pane">
        <AiChat :messages="chatMessages" :kp-title="kp.title" class="chat-container" @send="handleChatSend" />
        <button class="start-teach-btn" @click="startTeachingSession()">
          🤖 开始 AI 教学
        </button>
      </div>

      <!-- Doc -->
      <div v-if="activeTab === 'doc'" class="tab-pane doc-pane">
        <div v-if="!docContent && !showDocLoading" class="doc-empty">
          <p>📆 AI 将根据知识点自动生成结构化文档</p>
          <button class="generate-doc-btn" @click="loadDoc">生成文档</button>
        </div>
        <div v-else-if="showDocLoading" class="doc-loading"><p>⏳ 正在生成文档...</p></div>
        <div v-else class="doc-content" v-html="docContent"></div>
      </div>

      <!-- Video -->
      <div v-if="activeTab === 'video'" class="tab-pane video-pane">
        <div class="video-list">
          <div v-for="res in kp.resources.filter(r => r.type === 'video')" :key="res.id" class="video-card">
            <span class="video-icon">🎬</span>
            <div class="video-info">
              <h4>{{ res.title }}</h4>
              <p>{{ res.description }}</p>
              <div class="video-meta">
                <span v-if="res.duration">{{ res.duration }}</span>
                <span v-if="res.source">{{ res.source }}</span>
                <span v-if="res.rating">{{ "⭐".repeat(res.rating!) }}</span>
              </div>
            </div>
            <a :href="res.url" target="_blank" class="video-link">观看 →</a>
          </div>
          <div v-if="kp.resources.filter(r => r.type === 'video').length === 0" class="empty-hint"><p>暂无视频资源</p></div>
        </div>
      </div>

      <!-- Exercise -->
      <div v-if="activeTab === 'exercise'" class="tab-pane exercise-pane">
        <div v-if="!exercises.length && !exerciseLoading" class="exercise-empty">
          <p>💪 点击下方按钮生成练习题，巩固学习效果</p>
          <button class="generate-exercise-btn" @click="generateExercises" :disabled="exerciseLoading">
            {{ exerciseLoading ? '⏳ 生成中...' : '生成练习题' }}
          </button>
        </div>
        <div v-else-if="exerciseLoading" class="exercise-loading"><p>⏳ 正在生成练习题...</p></div>
        <div v-else class="exercise-list">
          <div v-for="(ex, idx) in exercises" :key="ex.id" class="exercise-card">
            <div class="exercise-header">
              <span class="exercise-type-badge" :class="ex.type">{{ getExerciseTypeLabel(ex.type) }}</span>
              <span class="exercise-score">{{ ex.score }}分</span>
            </div>
            <h4 class="exercise-title">{{ ex.title }}</h4>
            <p class="exercise-question">{{ ex.question }}</p>

            <!-- 选择题 -->
            <template v-if="ex.type === 'choice' && ex.options">
              <div class="choice-options">
                <label v-for="(opt, oi) in ex.options" :key="oi" class="choice-label">
                  <input type="radio" :name="'ex-' + idx" :value="opt" v-model="exerciseAnswers[ex.id]" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </template>

            <!-- 填空题 -->
            <template v-if="ex.type === 'fill_blank'">
              <textarea v-model="exerciseAnswers[ex.id]" class="exercise-input" rows="2" placeholder="请输入答案..." />
            </template>

            <!-- 编程题 -->
            <template v-if="ex.type === 'coding'">
              <textarea v-model="exerciseAnswers[ex.id]" class="exercise-input code-input" rows="6" placeholder="请在此编写代码..." />
            </template>

            <!-- 案例分析 / 论述题 -->
            <template v-if="ex.type === 'case_study' || ex.type === 'essay'">
              <textarea v-model="exerciseAnswers[ex.id]" class="exercise-input" rows="4" placeholder="请输入你的分析..." />
            </template>

            <!-- 评分结果 -->
            <div v-if="exerciseGrades.has(ex.id)" class="exercise-result" :class="{ correct: exerciseGrades.get(ex.id)!.isCorrect }">
              <div class="result-score">
                得分：<strong>{{ exerciseGrades.get(ex.id)!.score }}</strong> / {{ ex.score }}
              </div>
              <p class="result-feedback">{{ exerciseGrades.get(ex.id)!.feedback }}</p>
              <div v-if="ex.type === 'choice' || ex.type === 'fill_blank'" class="correct-answer">
                正确答案：{{ ex.correctAnswer }}
              </div>
            </div>

            <button
              v-if="!exerciseGrades.has(ex.id)"
              class="submit-exercise-btn"
              @click="gradeSingleExercise(ex)"
            >
              提交答案
            </button>
          </div>
        </div>
      </div>

      <!-- Test -->
      <div v-if="activeTab === 'test'" class="tab-pane test-pane">
        <div v-if="!testExercises.length && !testLoading && !testSubmitted" class="test-empty">
          <p>📋 生成一组练习题进行自测，检验学习成果</p>
          <button class="generate-test-btn" @click="generateTest" :disabled="testLoading">
            {{ testLoading ? '⏳ 生成中...' : '生成测试题' }}
          </button>
        </div>

        <div v-else-if="testLoading" class="test-loading"><p>⏳ 正在生成测试题目...</p></div>

        <div v-else-if="testResults" class="test-results">
          <div class="result-summary-card">
            <div class="result-score-big" :style="{ color: getTestGradeColor(testResults.totalScore, testResults.maxScore) }">
              {{ testResults.percentage }}分
            </div>
            <div class="result-detail">
              <span>总分 {{ testResults.totalScore }} / {{ testResults.maxScore }}</span>
            </div>
            <div class="result-bars">
              <div class="bar-row">
                <span>正确</span>
                <div class="bar-track"><div class="bar-fill bar-good" :style="{ width: (testResults.strengths.length / testExercises.length * 100) + '%' }"></div></div>
                <span>{{ testResults.strengths.length }}</span>
              </div>
              <div class="bar-row">
                <span>薄弱</span>
                <div class="bar-track"><div class="bar-fill bar-bad" :style="{ width: (testResults.weaknesses.length / testExercises.length * 100) + '%' }"></div></div>
                <span>{{ testResults.weaknesses.length }}</span>
              </div>
            </div>
          </div>

          <div v-if="testResults.weaknesses.length" class="weakness-section">
            <h4>⚠️ 薄弱点</h4>
            <ul><li v-for="w in testResults.weaknesses" :key="w">{{ w }}</li></ul>
          </div>

          <div class="strength-section">
            <h4>✅ 掌握良好</h4>
            <ul><li v-for="s in testResults.strengths" :key="s">{{ s }}</li></ul>
          </div>

          <div class="test-submissions">
            <h4>逐题回顾</h4>
            <div v-for="(sub, si) in testResults.exercises" :key="si" class="submission-card" :class="{ correct: sub.isCorrect }">
              <div class="submission-header">
                <span>第 {{ si + 1 }} 题</span>
                <span class="submission-score" :style="{ color: getTestGradeColor(sub.score, testExercises[si]?.score || 1) }">
                  {{ sub.score }} / {{ testExercises[si]?.score || '?' }}
                </span>
              </div>
              <p class="submission-question">{{ testExercises[si]?.question }}</p>
              <div class="submission-answer">
                <span>你的答案：</span>
                <span>{{ sub.studentAnswer || '(未作答)' }}</span>
              </div>
              <div v-if="testExercises[si]?.type === 'choice'" class="submission-correct">
                正确答案：{{ testExercises[si]?.correctAnswer }}
              </div>
              <p class="submission-feedback">{{ sub.feedback }}</p>
            </div>
          </div>

          <button class="retry-test-btn" @click="generateTest">重新测试</button>
        </div>

        <div v-else class="test-answer-area">
          <div class="test-intro">
            <p>共 {{ testExercises.length }} 题，请连续作答后提交</p>
          </div>
          <div v-for="(ex, idx) in testExercises" :key="ex.id" class="test-question-card">
            <div class="exercise-header">
              <span class="exercise-type-badge" :class="ex.type">{{ getExerciseTypeLabel(ex.type) }}</span>
              <span class="exercise-score">{{ ex.score }}分</span>
            </div>
            <h4 class="exercise-title">第 {{ idx + 1 }} 题：{{ ex.title }}</h4>
            <p class="exercise-question">{{ ex.question }}</p>

            <template v-if="ex.type === 'choice' && ex.options">
              <div class="choice-options">
                <label v-for="(opt, oi) in ex.options" :key="oi" class="choice-label">
                  <input type="radio" :name="'test-' + idx" :value="opt" v-model="testAnswers[ex.id]" />
                  <span>{{ opt }}</span>
                </label>
              </div>
            </template>

            <template v-if="ex.type === 'fill_blank'">
              <textarea v-model="testAnswers[ex.id]" class="exercise-input" rows="2" placeholder="请输入答案..." />
            </template>

            <template v-if="ex.type === 'coding'">
              <textarea v-model="testAnswers[ex.id]" class="exercise-input code-input" rows="6" placeholder="请在此编写代码..." />
            </template>

            <template v-if="ex.type === 'case_study' || ex.type === 'essay'">
              <textarea v-model="testAnswers[ex.id]" class="exercise-input" rows="4" placeholder="请输入你的分析..." />
            </template>
          </div>

          <button class="submit-test-btn" @click="submitTest">提交全部</button>
        </div>
      </div>

      <!-- Diagram -->
      <div v-if="activeTab === 'diagram'" class="tab-pane diagram-pane">
        <div v-if="!diagrams.length && !diagramLoading" class="diagram-empty">
          <p>📊 AI 将根据知识点生成思维导图和流程图</p>
          <button class="generate-diagram-btn" @click="loadDiagrams" :disabled="diagramLoading">
            {{ diagramLoading ? '⏳ 生成中...' : '生成图表' }}
          </button>
        </div>
        <div v-else-if="diagramLoading" class="diagram-loading"><p>⏳ 正在生成图表...</p></div>
        <div v-else-if="diagrams.length" class="diagram-list">
          <div v-for="(diag, idx) in diagrams" :key="idx" class="diagram-card">
            <h4 class="diagram-caption">{{ diag.caption }}</h4>
            <div class="mermaid-container" v-html="mermaidHtml[idx]"></div>
          </div>
        </div>
      </div>

      <!-- Note -->
      <div v-if="activeTab === 'note'" class="tab-pane note-pane">
        <textarea v-model="localNotes" class="note-area" placeholder="记录你的学习笔记..." rows="8" @blur="saveNotes"></textarea>
      </div>
    </div>

    <div class="kp-details">
      <div v-if="kp.keyPoints?.length" class="detail-block">
        <h3>💯 核心要点</h3>
        <ul><li v-for="(p, i) in kp.keyPoints" :key="i">{{ p }}</li></ul>
      </div>
      <div v-if="kp.commonMistakes?.length" class="detail-block">
        <h3>🚨 常见误区</h3>
        <ul><li v-for="(m, i) in kp.commonMistakes" :key="i">{{ m }}</li></ul>
      </div>
      <div v-if="kp.estimatedHours" class="detail-block">
        <h3>🕛 预计学习时长</h3>
        <p>{{ kp.estimatedHours }} 小时</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  @apply flex flex-col h-screen bg-[#0f0f2a] overflow-y-auto overscroll-contain;
}
.panel-header {
  @apply flex justify-between items-start p-5 sm:p-6 border-b border-white/[0.06];
}
.header-info {
  @apply flex-1;
}
.module-tag {
  @apply inline-block px-2.5 py-1 bg-[rgba(108,99,255,0.15)] rounded-[12px] text-xs text-[#8b8bff] mb-2;
}
.panel-header h2 {
  @apply text-lg sm:text-xl lg:text-[22px] font-bold text-white m-0 mb-1;
}
.kp-desc {
  @apply text-sm text-[#888] m-0;
}
.close-btn {
  @apply p-2 sm:p-2.5 border-0 rounded-lg bg-white/[0.05] text-[#888] text-lg sm:text-xl cursor-pointer hover:bg-white/[0.1];
}
.progress-control {
  @apply p-4 sm:p-5 border-b border-white/[0.06];
}
.progress-info {
  @apply flex justify-between items-center mb-2;
}
.progress-label {
  @apply text-xs text-[#888];
}
.progress-value {
  @apply text-sm font-semibold;
}
.progress-buttons {
  @apply flex gap-2 mt-2 flex-wrap;
}
.p-btn {
  @apply px-4 py-1.5 sm:px-5 sm:py-2 border border-white/[0.1] rounded-lg bg-transparent text-[#aaa] text-xs sm:text-sm cursor-pointer transition-all duration-200 hover:border-[rgba(108,99,255,0.3)];
}
.p-btn.active {
  @apply bg-[rgba(108,99,255,0.15)] border-[#6c63ff] text-white;
}
.p-btn.completed.active {
  @apply bg-[rgba(0,184,148,0.15)] border-[#00b894];
}
.tab-bar {
  @apply flex p-0 sm:p-1 md:p-0 border-b border-white/[0.06] overflow-x-auto;
}
.tab-btn {
  @apply px-3 sm:px-4 py-3 sm:py-2.5 md:py-3 border-b-2 border-transparent bg-transparent text-[#888] text-xs sm:text-sm cursor-pointer transition-all duration-200 hover:text-[#ccc] whitespace-nowrap;
}
.tab-btn.active {
  @apply text-[#6c63ff] border-[#6c63ff];
}
.tab-content {
  @apply flex-1 p-4 sm:p-5 overflow-y-auto;
}
.tab-pane {
  @apply min-h-[300px];
}
.explain-pane {
  @apply flex flex-col gap-3;
}
.chat-container {
  @apply flex-1 min-h-[250px] sm:min-h-[300px];
}
.start-teach-btn {
  @apply px-6 py-3 border-0 rounded-xl bg-gradient-to-br from-[#6c63ff] to-[#4834d4] text-white text-sm cursor-pointer self-center w-full sm:w-auto;
}
.doc-empty, .doc-loading {
  @apply text-center py-12 sm:py-16 px-5 text-[#888];
}
.generate-doc-btn {
  @apply mt-4 px-6 py-2.5 border border-[#6c63ff] rounded-xl bg-[rgba(108,99,255,0.1)] text-[#6c63ff] text-sm cursor-pointer;
}
.doc-content {
  @apply whitespace-pre-wrap leading-[1.8] text-[#ccc];
}
.video-list {
  @apply flex flex-col gap-3;
}
.video-card {
  @apply flex items-center gap-3 p-3.5 border border-white/[0.06] rounded-xl bg-white/[0.02];
}
.video-icon {
  @apply text-2xl flex-shrink-0;
}
.video-info {
  @apply flex-1 min-w-0;
}
.video-info h4 {
  @apply text-sm text-white m-0 mb-0.5;
}
.video-info p {
  @apply text-xs text-[#888] m-0;
}
.video-meta {
  @apply flex gap-2 mt-1 text-[11px] text-[#666];
}
.video-link {
  @apply text-sm text-[#00b894] whitespace-nowrap;
}
.note-area {
  @apply w-full p-3.5 border border-white/[0.06] rounded-xl bg-white/[0.02] text-[#e0e0e0] text-sm font-medium outline-none resize-none;
}
.note-area:focus {
  @apply border-[#6c63ff];
}
.kp-details {
  @apply p-4 sm:p-5 md:p-6 border-t border-white/[0.06];
}
.detail-block {
  @apply mb-4;
}
.detail-block h3 {
  @apply text-base font-semibold text-white m-0 mb-2;
}
.detail-block ul {
  @apply pl-5 m-0;
}
.detail-block li {
  @apply text-xs sm:text-sm text-[#bbb] mb-1 leading-relaxed;
}
.empty-hint {
  @apply text-center py-10 text-[#666];
}

/* Exercise styles */
.exercise-empty, .test-empty {
  @apply text-center py-16 px-5 text-[#888];
}
.exercise-loading, .test-loading, .diagram-loading {
  @apply text-center py-16 px-5 text-[#888];
}
.generate-exercise-btn, .generate-test-btn, .generate-diagram-btn {
  @apply mt-4 px-6 py-2.5 border border-[#6c63ff] rounded-xl bg-[rgba(108,99,255,0.1)] text-[#6c63ff] text-sm cursor-pointer;
}
.generate-exercise-btn:disabled, .generate-test-btn:disabled, .generate-diagram-btn:disabled {
  @apply opacity-60 cursor-not-allowed;
}
.exercise-list {
  @apply flex flex-col gap-4;
}
.exercise-card {
  @apply p-4 border border-white/[0.06] rounded-xl bg-white/[0.02];
}
.exercise-header {
  @apply flex justify-between items-center mb-2;
}
.exercise-type-badge {
  @apply text-[11px] px-2 py-0.5 rounded font-semibold;
}
.exercise-type-badge.choice { @apply bg-[rgba(108,99,255,0.15)] text-[#8b8bff]; }
.exercise-type-badge.fill_blank { @apply bg-[rgba(0,184,148,0.15)] text-[#00b894]; }
.exercise-type-badge.coding { @apply bg-[rgba(253,203,110,0.15)] text-[#fdcb6e]; }
.exercise-type-badge.case_study { @apply bg-[rgba(255,165,2,0.15)] text-[#ffa502]; }
.exercise-type-badge.essay { @apply bg-[rgba(255,71,87,0.15)] text-[#ff4757]; }
.exercise-score {
  @apply text-xs text-[#888];
}
.exercise-title {
  @apply text-sm font-semibold text-white m-0 mb-1;
}
.exercise-question {
  @apply text-sm text-[#ccc] m-0 mb-3 leading-relaxed;
}
.choice-options {
  @apply flex flex-col gap-2 mb-3;
}
.choice-label {
  @apply flex items-center gap-2 p-2.5 border border-white/[0.08] rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/[0.03];
}
.choice-label input[type="radio"] {
  @apply accent-[#6c63ff];
}
.exercise-input {
  @apply w-full p-3 border border-white/[0.08] rounded-lg bg-white/[0.02] text-[#e0e0e0] text-sm outline-none resize-y;
}
.exercise-input:focus {
  @apply border-[#6c63ff];
}
.code-input {
  @apply font-mono text-xs;
}
.submit-exercise-btn {
  @apply mt-3 px-5 py-2 border-0 rounded-lg bg-[#6c63ff] text-white text-sm cursor-pointer;
}
.submit-exercise-btn:hover {
  @apply bg-[#5a52d5];
}
.exercise-result {
  @apply mt-3 p-3 rounded-lg border;
}
.exercise-result.correct {
  @apply bg-[rgba(0,184,148,0.08)] border-[rgba(0,184,148,0.2)];
}
.result-score {
  @apply text-sm font-semibold text-[#00b894] mb-1;
}
.result-feedback {
  @apply text-xs text-[#bbb] m-0 mb-1;
}
.correct-answer {
  @apply text-xs text-[#888] mt-1;
}

/* Test styles */
.test-answer-area {
  @apply flex flex-col gap-4;
}
.test-intro {
  @apply text-center text-[#888] text-sm py-2;
}
.test-question-card {
  @apply p-4 border border-white/[0.06] rounded-xl bg-white/[0.02];
}
.submit-test-btn {
  @apply w-full px-6 py-3 border-0 rounded-xl bg-gradient-to-br from-[#00b894] to-[#00a381] text-white text-sm font-semibold cursor-pointer;
}
.submit-test-btn:hover {
  @apply from-[#00a381] to-[#008f6f];
}
.test-results {
  @apply flex flex-col gap-5;
}
.result-summary-card {
  @apply p-6 border border-white/[0.06] rounded-xl bg-white/[0.02] text-center;
}
.result-score-big {
  @apply text-4xl font-bold mb-2;
}
.result-detail {
  @apply text-sm text-[#888] mb-4;
}
.result-bars {
  @apply flex flex-col gap-2;
}
.bar-row {
  @apply flex items-center gap-3 text-xs;
}
.bar-track {
  @apply flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden;
}
.bar-fill {
  @apply h-full rounded-full transition-all duration-500;
}
.bar-good { @apply bg-[#00b894]; }
.bar-bad { @apply bg-[#ff4757]; }
.weakness-section, .strength-section {
  @apply p-4 border border-white/[0.06] rounded-xl bg-white/[0.02];
}
.weakness-section h4 {
  @apply text-sm text-[#ff4757] m-0 mb-2;
}
.strength-section h4 {
  @apply text-sm text-[#00b894] m-0 mb-2;
}
.weakness-section ul, .strength-section ul {
  @apply pl-5 m-0;
}
.weakness-section li, .strength-section li {
  @apply text-xs text-[#bbb] mb-0.5;
}
.test-submissions {
  @apply flex flex-col gap-3;
}
.test-submissions h4 {
  @apply text-sm text-white m-0 mb-1;
}
.submission-card {
  @apply p-3 border border-white/[0.06] rounded-lg bg-white/[0.02];
}
.submission-card.correct {
  @apply border-l-[3px] border-l-[#00b894];
}
.submission-header {
  @apply flex justify-between text-xs mb-1;
}
.submission-score {
  @apply font-semibold;
}
.submission-question {
  @apply text-sm text-[#ccc] m-0 mb-2;
}
.submission-answer {
  @apply text-xs text-[#aaa] mb-1;
}
.submission-correct {
  @apply text-xs text-[#00b894] mb-1;
}
.submission-feedback {
  @apply text-xs text-[#999] m-0;
}
.retry-test-btn {
  @apply px-6 py-2.5 border border-[#6c63ff] rounded-xl bg-[rgba(108,99,255,0.1)] text-[#6c63ff] text-sm cursor-pointer;
}

/* Diagram styles */
.diagram-empty {
  @apply text-center py-16 px-5 text-[#888];
}
.diagram-list {
  @apply flex flex-col gap-4;
}
.diagram-card {
  @apply p-4 border border-white/[0.06] rounded-xl bg-white/[0.02];
}
.diagram-caption {
  @apply text-sm font-semibold text-white m-0 mb-3;
}
.mermaid-container {
  @apply flex justify-center overflow-x-auto;
}

/* Responsive */
@media (max-width: 1024px) {
  .panel-header { @apply p-4 sm:p-5; }
  .panel-header h2 { @apply text-base sm:text-lg; }
  .progress-control { @apply p-3 sm:p-4; }
  .tab-bar { @apply px-2 sm:px-3; }
  .tab-btn { @apply px-2.5 py-2 text-xs; }
  .tab-content { @apply p-3 sm:p-4; }
  .kp-details { @apply p-3 sm:p-4; }
  .start-teach-btn { @apply p-3.5 text-sm; }
  .p-btn { @apply px-4 py-2 text-xs min-w-[80px]; }
}
@media (max-width: 768px) {
  .panel-header { @apply p-3.5 sm:p-4; }
  .panel-header h2 { @apply text-base; }
  .kp-desc { @apply text-xs; }
  .module-tag { @apply text-[11px] px-2 py-0.5; }
  .progress-control { @apply p-3; }
  .progress-buttons { @apply flex-wrap gap-1.5; }
  .p-btn { @apply flex-1 min-w-[70px] px-3 py-2 text-xs; }
  .tab-bar { @apply px-1 sm:px-2; }
  .tab-btn { @apply px-2.5 py-2 text-xs; }
  .tab-content { @apply p-2 sm:p-3; }
  .kp-details { @apply p-2 sm:p-3; }
  .start-teach-btn { @apply w-full p-3.5; }
  .close-btn { @apply p-2.5 sm:p-3.5 text-lg; }
}
@media (max-width: 480px) {
  .panel-header h2 { @apply text-sm; }
  .tab-btn { @apply px-2 py-1.5 text-[11px]; }
}
</style>
