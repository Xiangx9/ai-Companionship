<!-- AI Learning OS - 首页 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '@/store/learning'
import { toastError, toastWarning } from '@/utils/toast'
import { describeAiError } from '@/utils/aiError'
import type { LearningProject } from '@/types/learning'
import TodayLearningCard from '@/components/TodayLearningCard.vue'

const router = useRouter()
const store = useLearningStore()

const input = ref('')
const level = ref<'beginner' | 'intermediate' | 'advanced'>('beginner')
const loading = ref(false)
const error = ref('')
const errorTitle = ref('')
const errorRetryable = ref(true)

const levelOptions = [
  { value: 'beginner' as const, label: '零基础', icon: '🌱', hint: '从基础概念开始' },
  { value: 'intermediate' as const, label: '有经验', icon: '🌿', hint: '跳过入门铺垫' },
  { value: 'advanced' as const, label: '进阶', icon: '🌳', hint: '偏深度与体系' },
]

const fields = ['编程', 'AI', '数学', '英语', '摄影', '投资', '心理学', '历史', '法律', '考研']

const features = [
  { icon: '🗺️', title: '知识图谱', desc: '结构化路径，一眼看清学什么' },
  { icon: '🤖', title: 'AI 老师', desc: '讲解、提问、评分一体' },
  { icon: '📈', title: '学习报告', desc: '进度、薄弱点自动整理' },
  { icon: '🌙', title: '情感陪伴', desc: '学累了也能先缓一缓' },
]

async function startLearning() {
  if (!input.value.trim()) {
    error.value = '请输入你想学习的内容'
    errorTitle.value = '提示'
    errorRetryable.value = false
    return
  }
  loading.value = true
  error.value = ''
  errorTitle.value = ''
  errorRetryable.value = true
  store.clearGenerateError()
  try {
    const project = await store.createProject(input.value.trim(), level.value)
    if (project) router.push('/learn/' + project.id)
  } catch (err) {
    if (store.isGenerationAborted(err)) {
      error.value = ''
      errorTitle.value = ''
      toastWarning('已取消生成')
      return
    }
    const info = describeAiError(err)
    error.value = info.message
    errorTitle.value = info.title
    errorRetryable.value = info.retryable
    toastError(info.message)
  } finally {
    loading.value = false
  }
}

function selectLevel(l: string) {
  level.value = l as 'beginner' | 'intermediate' | 'advanced'
}

function useField(field: string) {
  input.value = '我想学习' + field
}

const recentProjects = computed(() => {
  return [...store.projects]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 3)
})

const continueEntry = computed(() => store.getLatestContinueProject())

const todayCard = computed(() => {
  const entry = continueEntry.value
  if (!entry) return null
  return store.getTodayLearningCard(entry.project.id)
})

function openTodayReview() {
  const entry = continueEntry.value
  const review = todayCard.value?.reviewItem
  if (!entry || !review) return
  store.setActiveProject(entry.project.id)
  router.push({
    path: '/learn/' + entry.project.id,
    query: { kp: review.kpId, resume: '1' },
  })
}

function continueLearning() {
  const entry = continueEntry.value
  if (!entry) return
  const kpId = todayCard.value?.kpId || entry.target.kpId
  store.setActiveProject(entry.project.id)
  router.push({
    path: '/learn/' + entry.project.id,
    query: { kp: kpId, resume: '1' },
  })
}

function cancelCreate() {
  store.cancelGeneration()
  loading.value = false
  error.value = ''
  errorTitle.value = ''
  errorRetryable.value = true
}

function dismissError() {
  error.value = ''
  errorTitle.value = ''
  errorRetryable.value = true
  store.clearGenerateError()
}

function formatDate(value?: string) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('zh-CN')
  } catch {
    return value
  }
}

function progressPercent(proj: LearningProject) {
  const total = (proj.path?.modules ?? []).reduce((sum, mod) => sum + (mod.knowledgePoints?.length ?? 0), 0)
  if (!total) return 0
  const done = (proj.progress ?? []).filter((p) => p.status === 'completed' || p.status === 'mastered').length
  return Math.round((done / total) * 100)
}
</script>

<template>
  <div class="home">
    <div class="home-grid">
      <section class="hero surface">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-kicker">纯前端 · 本地持久化 · 可导入导出</div>
        <h1 class="hero-title">AI Learning OS</h1>
        <p class="hero-desc">输入任何想学的内容，AI 自动规划路径、讲解知识点，并帮你持续推进。</p>

        <TodayLearningCard
          v-if="todayCard"
          class="home-today-card"
          :card="todayCard"
          show-project
          cta-label="继续学习"
          @continue="continueLearning"
          @review="openTodayReview"
        />

        <div class="composer">
          <div class="composer-row">
            <span class="composer-icon">✦</span>
            <input
              v-model="input"
              class="composer-input"
              type="text"
              placeholder="例如：系统学习前端开发 / 考研数学 / 摄影构图"
              @keydown.enter="startLearning"
            />
            <div class="composer-actions">
              <button class="btn btn-primary" type="button" :disabled="loading || !input.trim()" @click="startLearning">
                <span v-if="loading" class="spinner"></span>
                {{ loading ? (store.generateProgress || '生成中...') : '开始学习' }}
              </button>
              <button
                v-if="loading"
                class="btn btn-ghost cancel-btn"
                type="button"
                @click="cancelCreate"
              >
                取消
              </button>
            </div>
          </div>

          <div class="level-row">
            <span class="level-label">当前水平</span>
            <div class="level-options">
              <button
                v-for="opt in levelOptions"
                :key="opt.value"
                type="button"
                class="level-card"
                :class="{ active: level === opt.value }"
                @click="selectLevel(opt.value)"
              >
                <span class="level-icon">{{ opt.icon }}</span>
                <span class="level-text">
                  <strong>{{ opt.label }}</strong>
                  <small>{{ opt.hint }}</small>
                </span>
              </button>
            </div>
          </div>

          <div v-if="loading" class="gen-panel" aria-live="polite">
            <div class="gen-status">
              <span class="spinner"></span>
              <div>
                <strong>{{ store.generateProgress || '正在生成学习路径...' }}</strong>
                <p>通常需要 10–40 秒，可随时取消；生成中会预览路径骨架。</p>
              </div>
            </div>
            <div class="path-skeleton" aria-hidden="true">
              <div v-for="i in 3" :key="i" class="skeleton-mod">
                <div class="sk-line sk-title"></div>
                <div class="sk-line"></div>
                <div class="sk-line sk-short"></div>
                <div class="sk-chips">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="error" class="error-panel" role="alert">
            <div class="error-panel-title">{{ errorTitle || '生成失败' }}</div>
            <p class="error-panel-msg">{{ error }}</p>
            <div class="error-panel-actions">
              <button
                v-if="errorRetryable"
                class="btn btn-primary"
                type="button"
                @click="startLearning"
              >重试</button>
              <button class="btn btn-ghost" type="button" @click="dismissError">关闭</button>
            </div>
          </div>
        </div>

        <div class="field-row">
          <span class="section-title">快速选择</span>
          <div class="field-list">
            <button v-for="field in fields" :key="field" type="button" class="field-tag" @click="useField(field)">
              {{ field }}
            </button>
          </div>
        </div>
      </section>

      <aside class="side-stack">
        <button class="companion-card surface" type="button" @click="router.push('/companion')">
          <div class="companion-top">
            <span class="companion-badge">🌙 星语</span>
            <span class="companion-go">去聊聊 →</span>
          </div>
          <h2>学累了，先休息一下</h2>
          <p>不赶进度，不说教。适合焦虑、疲惫或只想找人聊聊的时候。</p>
          <div class="companion-pills">
            <span>温柔倾听</span>
            <span>本地会话</span>
            <span>随时退出</span>
          </div>
        </button>

        <section class="feature-panel surface">
          <div class="section-title">能力概览</div>
          <div class="feature-list">
            <div v-for="item in features" :key="item.title" class="feature-item">
              <div class="feature-icon">{{ item.icon }}</div>
              <div>
                <div class="feature-title">{{ item.title }}</div>
                <div class="feature-desc">{{ item.desc }}</div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="recentProjects.length" class="recent-panel surface">
          <div class="recent-head">
            <div class="section-title">最近项目</div>
            <button class="btn btn-ghost" type="button" @click="router.push('/projects')">全部</button>
          </div>
          <div class="recent-list">
            <button
              v-for="proj in recentProjects"
              :key="proj.id"
              type="button"
              class="recent-item"
              @click="router.push('/learn/' + proj.id)"
            >
              <div class="recent-main">
                <div class="recent-name">{{ proj.name }}</div>
                <div class="recent-meta">{{ formatDate(proj.updatedAt || proj.createdAt) }} · {{ proj.path?.modules?.length || 0 }} 模块</div>
                <div class="progress-mini recent-progress" aria-hidden="true">
                  <span :style="{ width: progressPercent(proj) + '%' }"></span>
                </div>
              </div>
              <div class="recent-right">
                <strong>{{ progressPercent(proj) }}%</strong>
                <span class="recent-arrow">→</span>
              </div>
            </button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.home {
  padding: 28px 20px 40px;
}

.home-grid {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.85fr);
  gap: 18px;
  align-items: start;
}

.hero,
.companion-card,
.feature-panel,
.recent-panel {
  padding: 22px;
}

.hero {
  overflow: hidden;
}

.hero-glow {
  position: absolute;
  inset: auto auto -40px -40px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(79,140,255,0.16), transparent 70%);
  pointer-events: none;
}

.hero-kicker {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(79,140,255,0.25);
  background: rgba(79,140,255,0.1);
  color: #c7dbff;
  font-size: 12px;
  margin-bottom: 14px;
}

.hero-title {
  margin: 0 0 10px;
  font-size: 36px;
  line-height: 1.12;
  letter-spacing: -0.03em;
  color: #f4f7ff;
}

.hero-desc {
  margin: 0 0 22px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
  max-width: 52ch;
}

.home-today-card {
  margin-bottom: 16px;
}

.continue-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(34, 195, 166, 0.28);
  background:
    linear-gradient(135deg, rgba(34, 195, 166, 0.14), transparent 55%),
    rgba(10, 18, 28, 0.7);
}

.continue-kicker {
  font-size: 11px;
  color: #8ef0da;
  margin-bottom: 4px;
}

.continue-title {
  font-size: 15px;
  font-weight: 700;
  color: #f2f8ff;
}

.continue-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 22px;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.cancel-btn {
  white-space: nowrap;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--border-strong);
  background: rgba(7, 11, 20, 0.55);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}

.composer-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #9ec0ff;
  background: rgba(79,140,255,0.12);
  flex-shrink: 0;
}

.composer-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  padding: 8px 0;
}

.composer-input::placeholder {
  color: #66758f;
}

.level-row,
.field-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.level-label {
  font-size: 12px;
  color: var(--text-muted);
}

.level-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.level-card {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.025);
  color: var(--text-secondary);
  padding: 10px 12px;
  cursor: pointer;
  transition: 0.18s ease;
}

.level-card:hover {
  border-color: rgba(79,140,255,0.28);
  background: rgba(79,140,255,0.06);
}

.level-card.active {
  color: #e8f1ff;
  border-color: rgba(79,140,255,0.42);
  background: rgba(79,140,255,0.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}

.level-icon {
  font-size: 16px;
}

.level-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.level-text strong {
  font-size: 13px;
  font-weight: 700;
}

.level-text small {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-tag {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: 0.18s ease;
}

.field-tag:hover {
  color: var(--text);
  border-color: rgba(79,140,255,0.35);
  background: rgba(79,140,255,0.08);
}

.error-text {
  margin: 0;
  color: #ff8b97;
  font-size: 12px;
}

.gen-panel,
.error-panel {
  margin-top: 4px;
  padding: 14px 14px 12px;
  border-radius: 14px;
  border: 1px solid rgba(79, 140, 255, 0.22);
  background: rgba(10, 16, 28, 0.72);
}

.error-panel {
  border-color: rgba(255, 120, 140, 0.35);
  background: rgba(42, 16, 24, 0.55);
}

.gen-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.gen-status strong {
  display: block;
  color: #e8f0ff;
  font-size: 13px;
  margin-bottom: 4px;
}

.gen-status p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.path-skeleton {
  display: grid;
  gap: 10px;
}

.skeleton-mod {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.sk-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.14), rgba(255,255,255,0.06));
  background-size: 200% 100%;
  animation: sk-shimmer 1.2s ease-in-out infinite;
  margin-bottom: 8px;
}

.sk-title {
  width: 42%;
  height: 12px;
}

.sk-short {
  width: 58%;
}

.sk-chips {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.sk-chips span {
  width: 52px;
  height: 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

@keyframes sk-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.error-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #ffb4be;
  margin-bottom: 6px;
}

.error-panel-msg {
  margin: 0 0 12px;
  color: #ffd0d6;
  font-size: 12px;
  line-height: 1.55;
}

.error-panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.companion-card {
  text-align: left;
  cursor: pointer;
  transition: 0.18s ease;
  background:
    linear-gradient(160deg, rgba(79,140,255,0.14), transparent 42%),
    linear-gradient(180deg, rgba(17,26,44,0.96), rgba(12,18,32,0.96));
  overflow: hidden;
}

.companion-card:hover {
  transform: translateY(-2px);
  border-color: rgba(79,140,255,0.35);
}

.companion-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.companion-badge,
.companion-go {
  font-size: 12px;
  color: #c9d8f5;
}

.companion-card h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: #f3f7ff;
}

.companion-card p {
  margin: 0 0 14px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.companion-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.companion-pills span {
  border-radius: 999px;
  border: 1px solid rgba(79,140,255,0.18);
  background: rgba(79,140,255,0.08);
  color: #cfe0ff;
  font-size: 11px;
  padding: 4px 8px;
}

.feature-list,
.recent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.feature-item,
.recent-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.025);
}

.feature-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(79,140,255,0.1);
  flex-shrink: 0;
}

.feature-title,
.recent-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.feature-desc,
.recent-meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.recent-item {
  width: 100%;
  text-align: left;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  transition: 0.18s ease;
  color: inherit;
}

.recent-item:hover {
  border-color: rgba(79,140,255,0.3);
  background: rgba(79,140,255,0.08);
}

.recent-main {
  min-width: 0;
  flex: 1;
}

.recent-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-progress {
  margin-top: 8px;
  max-width: 180px;
}

.recent-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 10px;
}

.recent-right strong {
  font-size: 12px;
  color: #cfe0ff;
}

.recent-arrow {
  color: #8eb4ff;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 960px) {
  .home-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .level-options {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .home {
    padding: 16px 12px 28px;
  }
  .hero,
  .companion-card,
  .feature-panel,
  .recent-panel {
    padding: 16px;
  }
  .hero-title {
    font-size: 28px;
  }
  .composer-row {
    flex-direction: column;
    align-items: stretch;
  }
  .composer-input {
    width: 100%;
  }
  .btn-primary {
    width: 100%;
  }
}
</style>
