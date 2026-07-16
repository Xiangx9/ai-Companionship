<!-- AI Learning OS - 首页 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '@/store/learning'

const router = useRouter()
const store = useLearningStore()

const input = ref('')
const level = ref<'beginner' | 'intermediate' | 'advanced'>('beginner')
const loading = ref(false)
const error = ref('')

const levelOptions = [
  { value: 'beginner' as const, label: '零基础', icon: '🌱' },
  { value: 'intermediate' as const, label: '有经验', icon: '🌿' },
  { value: 'advanced' as const, label: '进阶', icon: '🌳' },
]

async function startLearning() {
  if (!input.value.trim()) { error.value = '请输入你想学习的内容'; return }
  loading.value = true
  error.value = ''
  try {
    const project = await store.createProject(input.value.trim(), level.value)
    if (project) router.push('/learn/' + project.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '生成失败，请重试'
  } finally {
    loading.value = false
  }
}

function selectLevel(l: string) {
  level.value = l as 'beginner' | 'intermediate' | 'advanced'
}


// 最近项目
const recentProjects = computed(() => {
  return [...store.projects]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)
})
</script>

<template>
  <div class="home">
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <div class="container">
      <!-- Logo -->
      <div class="logo-section">
        <span class="logo-icon">🎓</span>
        <h1 class="logo-text">AI Learning OS</h1>
      </div>

      <!-- 一句话介绍 -->
      <p class="tagline">输入任何想学的内容，AI 自动成为你的私人老师</p>

      <!-- 输入框 -->
      <div class="input-section">
        <div class="input-wrapper">
          <span class="input-icon">💬</span>
          <input
            v-model="input"
            class="main-input"
            type="text"
            placeholder="我想学习前端开发..."
            @keydown.enter="startLearning"
          />
          <button class="submit-btn" @click="startLearning" :disabled="loading || !input.trim()">
            <span v-if="loading" class="spinner"></span>
            {{ loading ? 'AI 分析中...' : '开始学习' }}
          </button>
        </div>

        <!-- 水平选择 -->
        <div class="level-selector">
          <span class="level-label">当前水平：</span>
          <button
            v-for="opt in levelOptions"
            :key="opt.value"
            class="level-btn"
            :class="{ active: level === opt.value }"
            @click="selectLevel(opt.value)"
          >
            {{ opt.icon }} {{ opt.label }}
          </button>
        </div>

        <!-- 错误提示 -->
        <p v-if="error" class="error-text">{{ error }}</p>
      </div>

      <!-- 支持领域 -->
      <div class="supported-fields">
        <span class="fields-label">支持领域：</span>
        <span class="field-tag">编程</span>
        <span class="field-tag">AI</span>
        <span class="field-tag">数学</span>
        <span class="field-tag">英语</span>
        <span class="field-tag">摄影</span>
        <span class="field-tag">投资</span>
        <span class="field-tag">心理学</span>
        <span class="field-tag">历史</span>
        <span class="field-tag">法律</span>
        <span class="field-tag">考研</span>
      </div>

      <!-- 功能亮点 -->
      <div class="features">
        <div class="feature">
          <span class="feature-icon">🗺️</span>
          <span>智能知识图谱</span>
        </div>
        <div class="feature">
          <span class="feature-icon">🤖</span>
          <span>AI 私人老师</span>
        </div>
        <div class="feature">
          <span class="feature-icon">📈</span>
          <span>自动学习报告</span>
        </div>
        <div class="feature">
          <span class="feature-icon">📚</span>
          <span>多维学习资源</span>
        </div>
      </div>

      <!-- 最近项目 -->
      <div v-if="recentProjects.length > 0" class="recent-projects">
        <div class="rp-header">
          <span class="rp-title">最近项目</span>
          <span class="rp-more" @click="router.push(`/learn/${recentProjects[0].id}`)">继续学习 →</span>
        </div>
        <div class="rp-list">
          <div v-for="proj in recentProjects" :key="proj.id" class="rp-card" @click="router.push(`/learn/${proj.id}`)">
            <div class="rp-info">
              <span class="rp-name">{{ proj.name }}</span>
              <span class="rp-date">{{ proj.updatedAt }}</span>
            </div>
            <div class="rp-action">继续 →</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  @apply min-h-screen flex items-center justify-center bg-[#0a0a1a] relative overflow-hidden px-5 sm:px-8 md:px-20;
}
.bg-decoration {
  @apply absolute inset-0 pointer-events-none;
}
.orb {
  @apply absolute rounded-full;
  filter: blur(80px);
  opacity: 0.15;
}
.orb-1 {
  @apply w-[400px] h-[400px] bg-[#6c63ff] -top-[100px] -left-[100px];
  animation: float 8s ease-in-out infinite;
}
.orb-2 {
  @apply w-[300px] h-[300px] bg-[#00b894] -bottom-[50px] -right-[50px];
  animation: float 10s ease-in-out infinite reverse;
}
.orb-3 {
  @apply w-[200px] h-[200px] bg-[#fd79a8] top-1/2 left-[60%];
  animation: float 12s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(30px, -30px); }
}
.container {
  @apply relative z-10 max-w-[640px] text-center;
}
.logo-section {
  @apply mb-6;
}
.logo-icon {
  @apply text-[48px] block mb-2;
}
.logo-text {
  @apply text-[36px] font-extrabold leading-tight m-0;
  background: linear-gradient(135deg, #6c63ff, #00b894);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.tagline {
  @apply text-base sm:text-lg text-[#888] mb-12 leading-relaxed;
}
.input-section {
  @apply mb-10;
}
.input-wrapper {
  @apply flex items-center gap-3 p-2 bg-white/[0.03] border border-white/[0.08] rounded-xl transition-all duration-300 focus-within:border-[#6c63ff] focus-within:shadow-[0_0_0_3px_rgba(108,99,255,0.15)];
}
.input-icon {
  @apply text-xl px-2;
}
.main-input {
  @apply flex-1 py-3 border-0 bg-transparent text-[#e0e0e0] text-base outline-none;
}
.main-input::placeholder { @apply text-[#555]; }
.submit-btn {
  @apply px-7 py-3 border-0 rounded-xl bg-gradient-to-br from-[#6c63ff] to-[#4834d4] text-white text-sm font-semibold cursor-pointer transition-all duration-200 whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:translate-y-[-1px] hover:shadow-[0_4px_20px_rgba(108,99,255,0.4)];
}
.spinner {
  @apply w-4 h-4 border-2 border-white/[0.3] border-t-white rounded-full;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.level-selector {
  @apply flex items-center justify-center gap-2 mt-4;
}
.level-label {
  @apply text-xs text-[#666];
}
.level-btn {
  @apply px-3.5 py-1.5 border border-white/[0.1] rounded-[20px] bg-transparent text-[#aaa] text-xs cursor-pointer transition-all duration-200 hover:border-[rgba(108,99,255,0.3)] hover:text-white;
}
.level-btn.active {
  @apply bg-[rgba(108,99,255,0.15)] border-[#6c63ff] text-white;
}
.error-text {
  @apply mt-3 text-xs text-[#ff4757];
}
.supported-fields {
  @apply mb-8;
}
.fields-label {
  @apply text-xs text-[#555];
}
.field-tag {
  @apply inline-block px-3 py-1 mx-1 my-1 border border-white/[0.06] rounded-[16px] text-xs text-[#888] bg-white/[0.02];
}
.features {
  @apply grid grid-cols-4 gap-3;
}
.feature {
  @apply flex items-center gap-2 p-3 bg-[rgba(108,99,255,0.05)] border border-[rgba(108,99,255,0.1)] rounded-lg text-xs text-[#bbb];
}
.feature-icon {
  @apply text-lg;
}

.recent-projects {
  @apply mt-8;
}
.rp-header {
  @apply flex justify-between items-center mb-3;
}
.rp-title {
  @apply text-sm font-semibold text-[#aaa];
}
.rp-more {
  @apply text-xs text-[#6c63ff] cursor-pointer hover:text-[#8b8bff];
}
.rp-list {
  @apply flex flex-col gap-2;
}
.rp-card {
  @apply flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/[0.06] rounded-lg cursor-pointer transition-all duration-200 hover:border-[rgba(108,99,255,0.2)] hover:bg-[rgba(108,99,255,0.03)];
}
.rp-info {
  @apply flex flex-col gap-1;
}
.rp-name {
  @apply text-sm text-white font-medium truncate max-w-[200px];
}
.rp-date {
  @apply text-xs text-[#666];
}
.rp-action {
  @apply text-xs text-[#6c63ff] flex-shrink-0;
}

/* Responsive: tablet */
@media (max-width: 1024px) {
  .container { @apply max-w-[560px]; }
  .features { @apply grid-cols-2; }
}

/* Responsive: mobile */
@media (max-width: 640px) {
  .home { @apply px-4; }
  .logo-icon { @apply text-[40px]; }
  .logo-text { @apply text-[26px]; }
  .tagline { @apply text-sm mb-8; }
  .input-wrapper { @apply flex-col rounded-lg p-3; }
  .main-input { @apply w-full text-center; }
  .submit-btn { @apply w-full justify-center py-3.5; }
  .level-selector { @apply flex-wrap gap-1.5; }
  .supported-fields { @apply pl-4 pr-0 -mx-4 overflow-x-auto whitespace-nowrap; }
  .features { @apply grid-cols-1 px-4; }
  .feature { @apply p-2.5; }
}
</style>








