<!-- AI Learning OS - 学习主视图 -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '@/store/learning'
import RingProgress from '@/components/RingProgress.vue'
import KnowledgeCard from '@/components/KnowledgeCard.vue'
import KnowledgeDetailView from '@/components/KnowledgeDetailView.vue'
import type { KnowledgePoint, LearningModule } from '@/types/learning'

// 导出菜单
const showExportMenu = ref(false)

const router = useRouter()
const store = useLearningStore()

const project = computed(() => store.activeProject)
const progress = computed(() => store.overallProgress)
const streak = computed(() => store.streakDays)
const totalHours = computed(() => store.totalLearnedHours)

// 展开状态
const expandedModules = ref<Set<string>>(new Set())
const showDetail = ref(false)
const selectedKP = ref<KnowledgePoint | null>(null)
const selectedModule = ref<LearningModule | null>(null)

// 侧边栏 Tab
const sidebarTab = ref<'tree' | 'plan' | 'report'>('tree')

onMounted(() => {
  // 默认展开第一个模块
  if (project.value?.path?.modules?.length) {
    expandedModules.value = new Set([project.value!.path!.modules![0].id])
  }
})

function toggleModule(modId: string) {
  const next = new Set(expandedModules.value)
  if (next.has(modId)) next.delete(modId)
  else next.add(modId)
  expandedModules.value = next
}

function openKP(mod: LearningModule, kp: KnowledgePoint) {
  selectedModule.value = mod
  selectedKP.value = kp
  showDetail.value = true
  store.setCurrentKnowledgePoint(kp.id)
}

function getProgressColor(status?: string) {
  if (status === 'completed' || status === 'mastered') return '#00b894'
  if (status === 'in_progress') return '#fdcb6e'
  return '#636e72'
}

function generatePlan() {
  store.generatePlan(2)
}

function handleExport(format: "markdown" | "word" | "pdf" | "excel") {
  const data = store.exportProject(format)
  if (!data.content) return
  showExportMenu.value = false

  // PDF: use window.print() with a print-friendly popup
  if (format === 'pdf') {
    const printWin = window.open('', '_blank')
    if (!printWin) return
    printWin.document.write(data.content)
    printWin.document.close()
    printWin.onload = () => {
      printWin.print()
    }
    return
  }

  const extMap: Record<string, string> = { markdown: 'md', word: 'doc', excel: 'csv' }
  const mimeMap: Record<string, string> = { markdown: 'text/markdown', word: 'application/msword', excel: 'text/csv; charset=utf-8' }
  const ext = extMap[format] || 'txt'
  const mime = mimeMap[format] || 'text/plain;charset=utf-8'
  const blob = new Blob([data.content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.fileName || ('export.' + ext)
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="main-view">
    <!-- 顶部栏 -->
    <header class="top-bar">
      <button class="back-btn" @click="router.push('/')">
        <span>←</span> 新建学习
      </button>
      <div class="path-title">
        <h1>{{ project?.path.title || '加载中...' }}</h1>
        <p class="path-desc">{{ project?.path.description }}</p>
      </div>
      <div class="header-stats">
        <!-- Export dropdown -->
        <div class="export-dropdown">
          <button class="export-btn" @click="showExportMenu = !showExportMenu" :disabled="!project">
            📥 导出
          </button>
          <div v-if="showExportMenu" class="export-menu">
            <button class="export-menu-item" @click="handleExport('markdown')">导出 Markdown</button>
            <button class="export-menu-item" @click="handleExport('word')">导出 Word</button>
            <button class="export-menu-item" @click="handleExport('excel')">导出 Excel</button>
            <button class="export-menu-item" @click="handleExport('pdf')">导出 PDF</button>
          </div>
        </div>
        <div class="stat-item">
          <RingProgress :percent="progress" :size="44" :color="'#6c63ff'" :show-label="false" />
          <span class="stat-label">总进度</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ streak }}</span>
          <span class="stat-label">连续学习</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ totalHours.toFixed(1) }}</span>
          <span class="stat-label">累计学时(h)</span>
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <div class="main-body">
      <!-- 左侧：知识树/计划/报告 -->
      <aside class="sidebar">
        <div class="sidebar-tabs">
          <button class="sidebar-tab" :class="{ active: sidebarTab === 'tree' }" @click="sidebarTab = 'tree'">
            🗺️ 知识树
          </button>
          <button class="sidebar-tab" :class="{ active: sidebarTab === 'plan' }" @click="sidebarTab = 'plan'">
            📅 计划
          </button>
          <button class="sidebar-tab" :class="{ active: sidebarTab === 'report' }" @click="sidebarTab = 'report'">
            📊 报告
          </button>
        </div>

        <div class="sidebar-content">
          <!-- 知识树 -->
          <div v-if="sidebarTab === 'tree'" class="tree-panel">
            <div v-if="!project" class="empty-hint">
              <p>没有学习项目</p>
              <button class="create-btn" @click="router.push('/')">创建项目</button>
            </div>
            <div v-else>
              <div v-for="mod in project.path.modules" :key="mod.id" class="tree-module">
                <div class="module-header" @click="toggleModule(mod.id)">
                  <span class="mod-icon">{{ mod.icon }}</span>
                  <span class="mod-title">{{ mod.title }}</span>
                  <span class="mod-count">{{ mod.knowledgePoints?.length ?? 0 }}个知识点</span>
                  <span class="mod-arrow">{{ expandedModules.has(mod.id) ? '▲' : '▼' }}</span>
                </div>
                <div v-if="expandedModules.has(mod.id)" class="module-kps">
                  <KnowledgeCard
                    v-for="kp in (mod.knowledgePoints ?? []).sort((a,b) => a.order - b.order)"
                    :key="kp.id"
                    :title="kp.title"
                    :description="kp.description"
                    :hours="kp.estimatedHours"
                    :progress="store.getKnowledgePointProgress(kp.id)"
                    @click="openKP(mod, kp)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 学习计划 -->
          <div v-if="sidebarTab === 'plan'" class="plan-panel">
            <div v-if="!project" class="empty-hint">
              <p>没有学习项目</p>
              <button class="create-btn" @click="router.push('/')">创建项目</button>
            </div>
            <div v-else>
              <div v-if="!project.studyPlan" class="plan-empty">
                <p>📅 尚未生成学习计划</p>
                <button class="generate-plan-btn" @click="generatePlan()">AI 生成每日计划</button>
              </div>
              <div v-else class="plan-list">
                <div v-for="day in project.studyPlan.days.slice(0, 14)" :key="day.dayNumber" class="plan-day">
                  <div class="day-header">
                    <span class="day-number">Day {{ day.dayNumber }}</span>
                    <span class="day-date">{{ day.date }}</span>
                  </div>
                  <div class="day-tasks">
                    <div v-for="task in day.tasks" :key="task.id" class="day-task">
                      <span class="task-type" :class="task.type">{{ task.type }}</span>
                      <span class="task-title">{{ task.title }}</span>
                      <span class="task-time">{{ task.estimatedMinutes }}min</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 学习报告 -->
          <div v-if="sidebarTab === 'report'" class="report-panel">
            <div v-if="!project" class="empty-hint">
              <p>没有学习项目</p>
              <button class="create-btn" @click="router.push('/')">创建项目</button>
            </div>
            <div v-else>
              <div v-if="project.dailySummaries.length === 0" class="report-empty">
                <p>📊 暂无学习报告</p>
                <p class="report-hint">完成学习后自动生成每日总结</p>
              </div>
              <div v-else class="report-list">
                <div v-for="summary in project.dailySummaries" :key="summary.id" class="report-card">
                  <h4>{{ summary.date }} 学习总结</h4>
                  <p>学习内容：{{ summary.learnedPoints.join('、') }}</p>
                  <p>学习时长：{{ summary.completedHours }}h</p>
                  <p v-if="summary.weakPoints?.length">薄弱点：{{ summary.weakPoints.join('、') }}</p>
                  <p v-if="summary.suggestions?.length">建议：{{ summary.suggestions.join('；') }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧：知识图谱可视化 -->
      <main class="graph-main">
        <div class="graph-header">
          <h2>🗺️ 知识图谱</h2>
          <p class="graph-hint">点击左侧知识点查看详情</p>
        </div>
        <div class="graph-canvas">
          <div v-if="!project" class="graph-empty">
            <p>🌐 创建学习项目后将在此处展示知识图谱</p>
          </div>
          <div v-else class="graph-modules">
            <div v-for="mod in project.path.modules" :key="mod.id" class="graph-mod-group">
              <div class="graph-mod-title">{{ mod.icon }} {{ mod.title }}</div>
              <div class="graph-mod-kps">
                <div
                  v-for="kp in (mod.knowledgePoints ?? [])"
                  :key="kp.id"
                  class="graph-kp"
                  :class="{
                    'completed': store.getKnowledgePointProgress(kp.id)?.status === 'completed' || store.getKnowledgePointProgress(kp.id)?.status === 'mastered',
                    'in-progress': store.getKnowledgePointProgress(kp.id)?.status === 'in_progress',
                  }"
                  @click="openKP(mod, kp)"
                >
                  <span class="graph-kp-dot" :style="{ background: getProgressColor(store.getKnowledgePointProgress(kp.id)?.status) }"></span>
                  <span class="graph-kp-label">{{ kp.title }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 知识点详情弹窗 -->
    <Teleport to="body">
      <div v-if="showDetail && selectedKP" class="detail-overlay" @click.self="showDetail = false">
        <KnowledgeDetailView
          :kp="selectedKP"
          :module="selectedModule!"
          :progress="store.getKnowledgePointProgress(selectedKP.id)"
          @close="showDetail = false"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.main-view {
  @apply min-h-screen bg-[#0a0a1a] flex flex-col;
}
.top-bar {
  @apply flex items-center gap-4 px-6 py-4 border-b border-white/[0.06];
}
.back-btn {
  @apply px-3 py-2 border-0 rounded-lg bg-transparent text-[#888] text-sm cursor-pointer transition-all duration-200 hover:text-white whitespace-nowrap flex items-center gap-1.5;
}
.path-title h1 {
  @apply text-base font-semibold text-white m-0;
}
.path-desc {
  @apply text-xs text-[#888] m-0;
}
.export-dropdown {
  position: relative;
}
.export-btn {
  @apply px-3 py-2 border-0 rounded-lg bg-[rgba(108,99,255,0.15)] text-[#8b8bff] text-sm cursor-pointer transition-all duration-200 hover:bg-[rgba(108,99,255,0.25)] disabled:opacity-40 disabled:cursor-not-allowed;
}
.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 140px;
  background: #1a1a3e;
  border: 1px solid rgba(108,99,255,0.3);
  border-radius: 8px;
  overflow: hidden;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.export-menu-item {
  @apply w-full px-4 py-2.5 text-left text-sm text-[#ccc] bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:bg-[rgba(108,99,255,0.15)] hover:text-white;
}
.header-stats {
  @apply flex items-center gap-4 ml-auto;
}
.stat-item {
  @apply flex flex-col items-center gap-1 px-3 py-2;
}
.stat-label {
  @apply text-[11px] text-[#888];
}
.main-body {
  @apply flex flex-1 overflow-hidden;
}
.sidebar {
  @apply w-[320px] flex-shrink-0 bg-[#0f0f2a] border-r border-white/[0.06] flex flex-col;
}
.sidebar-tabs {
  @apply flex border-b border-white/[0.06];
}
.sidebar-tab {
  @apply flex-1 py-3 px-2 border-b-2 border-transparent bg-transparent text-[#888] text-sm cursor-pointer transition-all duration-200 hover:text-[#ccc];
}
.sidebar-tab.active {
  @apply text-[#6c63ff] border-[#6c63ff];
}
.sidebar-content {
  @apply flex-1 overflow-y-auto p-3;
}
.tree-module {
  @apply mb-2 border border-white/[0.06] rounded-lg overflow-hidden;
}
.module-header {
  @apply flex items-center gap-2 p-3 cursor-pointer transition-colors duration-200 hover:bg-[rgba(108,99,255,0.05)];
}
.mod-icon {
  @apply text-xl;
}
.mod-title {
  @apply flex-1 text-sm font-semibold text-white;
}
.mod-count {
  @apply text-[11px] text-[#666];
}
.mod-arrow {
  @apply text-[10px] text-[#555];
}
.module-kps {
  @apply p-1 pt-0 pb-2 flex flex-col gap-1;
}
.kp-card-wrapper {
  @apply p-1;
}
.plan-empty, .report-empty {
  @apply text-center py-10 px-5 text-[#888];
}
.generate-plan-btn {
  @apply mt-3 px-5 py-2.5 border border-[#00b894] rounded-lg bg-[rgba(0,184,148,0.1)] text-[#00b894] text-sm cursor-pointer;
}
.plan-list {
  @apply flex flex-col gap-3;
}
.plan-day {
  @apply border border-white/[0.06] rounded-lg overflow-hidden;
}
.day-header {
  @apply flex justify-between p-2.5 bg-white/[0.02];
}
.day-number {
  @apply text-sm font-semibold text-white;
}
.day-date {
  @apply text-xs text-[#888];
}
.day-tasks {
  @apply p-2;
}
.day-task {
  @apply flex items-center gap-2 py-1.5 text-sm;
}
.task-type {
  @apply text-[11px] px-1.5 py-0.5 rounded font-semibold;
}
.task-type.learn { @apply bg-[rgba(108,99,255,0.15)] text-[#8b8bff]; }
.task-type.practice { @apply bg-[rgba(0,184,148,0.15)] text-[#00b894]; }
.task-type.review { @apply bg-[rgba(253,203,110,0.15)] text-[#fdcb6e]; }
.task-type.test { @apply bg-[rgba(255,71,87,0.15)] text-[#ff4757]; }
.task-title {
  @apply flex-1 text-[#ccc];
}
.task-time {
  @apply text-[11px] text-[#666];
}
.report-list {
  @apply flex flex-col gap-3;
}
.report-card {
  @apply p-3.5 border border-white/[0.06] rounded-lg bg-white/[0.02];
}
.report-card h4 {
  @apply text-sm text-white m-0 mb-2;
}
.report-card p {
  @apply text-xs text-[#aaa] my-1;
}
.report-hint {
  @apply text-xs text-[#666];
}
.empty-hint {
  @apply text-center py-10 text-[#888];
}
.create-btn {
  @apply mt-3 px-5 py-2.5 border-0 rounded-lg bg-[#6c63ff] text-white text-sm cursor-pointer;
}
.graph-main {
  @apply flex-1 flex flex-col overflow-hidden;
}
.graph-header {
  @apply p-4 sm:p-6 border-b border-white/[0.06];
}
.graph-header h2 {
  @apply text-sm font-semibold text-white m-0;
}
.graph-hint {
  @apply text-xs text-[#666] my-1;
}
.graph-canvas {
  @apply flex-1 overflow-auto p-4 sm:p-6;
}
.graph-empty {
  @apply text-center py-20 text-[#666];
}
.graph-modules {
  @apply flex flex-col gap-5;
}
.graph-mod-group {
  @apply border border-white/[0.06] rounded-xl p-4 bg-white/[0.02];
}
.graph-mod-title {
  @apply text-sm font-semibold text-white mb-3;
}
.graph-mod-kps {
  @apply flex flex-wrap gap-2;
}
.graph-kp {
  @apply flex items-center gap-1.5 px-3.5 py-2 border border-white/[0.08] rounded-md cursor-pointer transition-all duration-200 bg-white/[0.02] hover:border-[rgba(108,99,255,0.3)] hover:bg-[rgba(108,99,255,0.05)];
}
.graph-kp.completed { @apply border-l-[3px] border-l-[#00b894]; }
.graph-kp.in-progress { @apply border-l-[3px] border-l-[#fdcb6e]; }
.graph-kp-dot {
  @apply w-2 h-2 rounded-full flex-shrink-0;
}
.graph-kp-label {
  @apply text-sm text-[#ccc];
}
.detail-overlay {
  @apply fixed inset-0 bg-black/60 z-[1000] animate-[fadeIn_0.2s];
}
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

/* Responsive */
@media (max-width: 1024px) {
  .sidebar { @apply w-[280px]; }
  .header-stats { @apply gap-3; }
  .stat-item { @apply px-2 py-1.5; }
  .stat-label { @apply text-xs; }
}
@media (max-width: 768px) {
  .main-body { @apply flex-col; }
  .sidebar { @apply w-full h-[50vh] border-r-0 border-b border-white/[0.06]; }
  .top-bar { @apply flex-wrap gap-3 px-3 sm:px-4; }
  .header-stats { @apply hidden; }
  .path-title h1 { @apply text-sm; }
  .path-desc { @apply text-xs; }
  .back-btn { @apply text-xs; }
}
@media (max-width: 640px) {
  .sidebar-tabs { @apply gap-0; }
  .sidebar-tab { @apply text-xs py-2.5 px-1; }
  .sidebar-content { @apply p-2; }
  .module-header { @apply p-2.5 gap-1.5; }
  .mod-title { @apply text-xs; }
  .mod-count { @apply text-[10px]; }
  .graph-header { @apply p-3 sm:p-4; }
  .graph-canvas { @apply p-3 sm:p-4; }
  .graph-mod-group { @apply p-3; }
  .graph-mod-kps { @apply gap-1.5; }
  .graph-kp { @apply px-2.5 py-1.5 text-xs; }
}
</style>











