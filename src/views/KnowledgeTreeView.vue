<!-- AI Learning OS - 学习主视图 -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLearningStore } from '@/store/learning'
import RingProgress from '@/components/RingProgress.vue'
import KnowledgeCard from '@/components/KnowledgeCard.vue'
import KnowledgeDetailView from '@/components/KnowledgeDetailView.vue'
import type { KnowledgePoint, LearningModule } from '@/types/learning'
import { toastError, toastSuccess, toastWarning } from '@/utils/toast'
import { downloadTextFile } from '@/utils/storage'

const showExportMenu = ref(false)

const router = useRouter()
const route = useRoute()
const store = useLearningStore()

function syncProjectFromRoute() {
  const id = String(route.params.id ?? '')
  if (!id) return
  if (store.activeProjectId !== id) {
    const ok = store.setActiveProject(id)
    if (!ok) router.replace({ name: 'projects' })
  }
}

function resumeFromRoute(autoOpen = false) {
  if (!project.value) return
  const kpFromQuery = typeof route.query.kp === 'string' ? route.query.kp : ''
  const shouldOpen = autoOpen || route.query.resume === '1' || !!kpFromQuery
  const targetId = kpFromQuery || store.getContinueTarget(project.value.id)?.kpId
  if (!targetId) return
  const found = store.findModuleForKp(project.value.path, targetId)
  if (!found) return
  ensureModuleExpanded(found.module.id)
  if (shouldOpen) openKP(found.module, found.kp)
  else {
    // still expand module for orientation
    selectedModule.value = found.module
  }
}

const project = computed(() => store.activeProject)
const progress = computed(() => store.overallProgress)
const streak = computed(() => store.streakDays)
const totalHours = computed(() => store.totalLearnedHours)

const completedCount = computed(() => {
  if (!project.value?.path?.modules) return 0
  let n = 0
  for (const mod of project.value.path.modules) {
    for (const kp of mod.knowledgePoints ?? []) {
      const st = store.getKnowledgePointProgress(kp.id)?.status
      if (st === 'completed' || st === 'mastered') n++
    }
  }
  return n
})

const totalKpCount = computed(() => {
  if (!project.value?.path?.modules) return 0
  return project.value.path.modules.reduce((sum, mod) => sum + (mod.knowledgePoints?.length ?? 0), 0)
})

const expandedModules = ref<Set<string>>(new Set())
const showDetail = ref(false)
const selectedKP = ref<KnowledgePoint | null>(null)
const selectedModule = ref<LearningModule | null>(null)
const sidebarTab = ref<'tree' | 'plan' | 'report'>('tree')

onMounted(() => {
  syncProjectFromRoute()
  if (project.value?.path?.modules?.length) {
    expandedModules.value = new Set([project.value.path.modules[0].id])
  }
  resumeFromRoute(true)
})

watch(
  () => route.params.id,
  () => {
    syncProjectFromRoute()
    if (project.value?.path?.modules?.length) {
      expandedModules.value = new Set([project.value.path.modules[0].id])
    } else {
      expandedModules.value = new Set()
    }
    showDetail.value = false
    selectedKP.value = null
    selectedModule.value = null
    resumeFromRoute(true)
  },
)

watch(
  () => [route.query.kp, route.query.resume],
  () => {
    resumeFromRoute(true)
  },
)

function toggleModule(modId: string) {
  const next = new Set(expandedModules.value)
  if (next.has(modId)) next.delete(modId)
  else next.add(modId)
  expandedModules.value = next
}

function ensureModuleExpanded(modId: string) {
  if (expandedModules.value.has(modId)) return
  const next = new Set(expandedModules.value)
  next.add(modId)
  expandedModules.value = next
}

function openKP(mod: LearningModule, kp: KnowledgePoint) {
  selectedModule.value = mod
  selectedKP.value = kp
  showDetail.value = true
  ensureModuleExpanded(mod.id)
  store.setCurrentKnowledgePoint(kp.id)
}

function sortedKps(mod: LearningModule) {
  return [...(mod.knowledgePoints ?? [])].sort((a, b) => a.order - b.order)
}

function getKpStatus(kpId: string) {
  return store.getKnowledgePointProgress(kpId)?.status
}

function getProgressColor(status?: string) {
  if (status === 'completed' || status === 'mastered') return '#22c3a6'
  if (status === 'in_progress') return '#f0b429'
  return '#7b8aa3'
}

function moduleProgress(mod: LearningModule) {
  const kps = mod.knowledgePoints ?? []
  if (!kps.length) return 0
  let done = 0
  for (const kp of kps) {
    const st = getKpStatus(kp.id)
    if (st === 'completed' || st === 'mastered') done++
    else if (st === 'in_progress') done += 0.5
  }
  return Math.round((done / kps.length) * 100)
}

function moduleDoneCount(mod: LearningModule) {
  return (mod.knowledgePoints ?? []).filter((kp) => {
    const st = getKpStatus(kp.id)
    return st === 'completed' || st === 'mastered'
  }).length
}

const planLoading = ref(false)
const reportLoading = ref(false)
const dailyHours = ref(2)
const planHoursOptions = [1, 1.5, 2, 3, 4]

const continueTarget = computed(() => store.getContinueTarget(project.value?.id))
const learningStats = computed(() => store.getProjectLearningStats(project.value?.id))
const weakQueue = computed(() => store.getWeakPointQueue(project.value?.id))
const todayPlan = computed(() => learningStats.value?.planDay ?? null)
const sortedSummaries = computed(() => {
  const list = project.value?.dailySummaries ?? []
  return [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)))
})

async function generatePlan() {
  planLoading.value = true
  try {
    await store.generatePlan(Number(dailyHours.value) || 2)
    toastSuccess('学习计划已生成')
  } catch (e) {
    if (store.isGenerationAborted(e)) {
      toastWarning('已取消生成学习计划')
      return
    }
    toastError(e instanceof Error ? e.message : '生成学习计划失败')
  } finally {
    planLoading.value = false
  }
}

function cancelPlanGeneration() {
  store.cancelGeneration()
  planLoading.value = false
}

function continueLearningNow() {
  const target = continueTarget.value
  if (!target || !project.value) return
  const found = store.findModuleForKp(project.value.path, target.kpId)
  if (!found) return
  openKP(found.module, found.kp)
}

function openPlanTask(task: { kpId: string }) {
  if (!project.value || !task?.kpId) return
  const found = store.findModuleForKp(project.value.path, task.kpId)
  if (!found) {
    toastWarning('未找到对应知识点')
    return
  }
  openKP(found.module, found.kp)
}

function toggleTaskComplete(dayNumber: number, taskId: string) {
  store.togglePlanTask(dayNumber, taskId)
}

function isTaskCompleted(day: { completedTasks?: string[] }, taskId: string) {
  return (day.completedTasks ?? []).includes(taskId)
}

function dayProgress(day: { tasks?: any[]; completedTasks?: string[] }) {
  const total = day.tasks?.length ?? 0
  if (!total) return 0
  return Math.round(((day.completedTasks?.length ?? 0) / total) * 100)
}

async function generateDailyReport() {
  reportLoading.value = true
  try {
    const summary = await store.generateDailyReport()
    if (summary) toastSuccess('今日学习报告已更新')
  } catch (e) {
    if (store.isGenerationAborted(e)) {
      toastWarning('已取消生成学习报告')
      return
    }
    toastError(e instanceof Error ? e.message : '生成学习报告失败')
  } finally {
    reportLoading.value = false
  }
}

function cancelReportGeneration() {
  store.cancelGeneration()
  reportLoading.value = false
}

function openTodayPlanTask(task: { kpId: string }) {
  openPlanTask(task)
  sidebarTab.value = 'tree'
}

function handleExport(format: 'markdown' | 'word' | 'pdf' | 'excel') {
  const data = store.exportProject(format)
  if (!data.content) {
    toastWarning('没有可导出的内容')
    return
  }
  showExportMenu.value = false

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
  const mimeMap: Record<string, string> = {
    markdown: 'text/markdown',
    word: 'application/msword',
    excel: 'text/csv; charset=utf-8',
  }
  const ext = extMap[format] || 'txt'
  const mime = mimeMap[format] || 'text/plain;charset=utf-8'
  const blob = new Blob([data.content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.fileName || ('export.' + ext)
  a.click()
  URL.revokeObjectURL(url)
  toastSuccess('导出成功')
}

function exportBackup() {
  const data = store.exportBackup()
  if (!data) {
    toastWarning('没有可备份的数据')
    return
  }
  downloadTextFile(data.fileName, data.content)
  showExportMenu.value = false
  toastSuccess('已导出完整备份')
}

function closeDetail() {
  showDetail.value = false
}

function openWeakPoint(item: { kpId: string }) {
  if (!project.value || !item?.kpId) return
  const found = store.findModuleForKp(project.value.path, item.kpId)
  if (!found) {
    toastWarning('未找到对应知识点')
    return
  }
  sidebarTab.value = 'tree'
  openKP(found.module, found.kp)
}

function handleDetailNext(kpId: string) {
  if (!project.value) return
  const found = store.findModuleForKp(project.value.path, kpId)
  if (!found) return
  openKP(found.module, found.kp)
}
</script>

<template>
  <div class="main-view">
    <header class="top-bar">
      <div class="nav-cluster">
        <button class="btn btn-ghost nav-btn" type="button" @click="router.push('/')">← 首页</button>
        <span class="nav-sep">/</span>
        <button class="btn btn-ghost nav-btn" type="button" @click="router.push('/projects')">项目</button>
      </div>

      <div class="path-title">
        <h1>{{ project?.path.title || '加载中...' }}</h1>
        <p class="path-desc">{{ project?.path.description || '选择知识点开始学习' }}</p>
      </div>

      <div class="header-stats">
        <div class="export-dropdown">
          <button
            class="btn btn-secondary export-btn"
            type="button"
            :disabled="!project"
            @click="showExportMenu = !showExportMenu"
          >
            导出
          </button>
          <div v-if="showExportMenu" class="export-menu">
            <button class="export-menu-item" type="button" @click="handleExport('markdown')">导出 Markdown</button>
            <button class="export-menu-item" type="button" @click="handleExport('word')">导出 Word</button>
            <button class="export-menu-item" type="button" @click="handleExport('excel')">导出 Excel</button>
            <button class="export-menu-item" type="button" @click="handleExport('pdf')">导出 PDF</button>
            <button class="export-menu-item" type="button" @click="exportBackup()">完整备份 JSON</button>
          </div>
        </div>

        <div class="stat-pill ring-pill">
          <RingProgress :percent="progress" :size="36" color="#4f8cff" :show-label="false" />
          <div class="stat-text">
            <strong>{{ progress }}%</strong>
            <span>总进度</span>
          </div>
        </div>
        <div class="stat-pill">
          <strong>{{ streak }} 天</strong>
          <span>连续学习</span>
        </div>
        <div class="stat-pill">
          <strong>{{ totalHours.toFixed(1) }} h</strong>
          <span>累计学时</span>
        </div>
        <div class="stat-pill accent">
          <strong>{{ completedCount }}/{{ totalKpCount }}</strong>
          <span>知识点</span>
        </div>
      </div>
    </header>

    <div class="main-body">
      <aside class="sidebar">
        <div class="sidebar-tabs">
          <button class="sidebar-tab" type="button" :class="{ active: sidebarTab === 'tree' }" @click="sidebarTab = 'tree'">
            知识树
          </button>
          <button class="sidebar-tab" type="button" :class="{ active: sidebarTab === 'plan' }" @click="sidebarTab = 'plan'">
            计划
          </button>
          <button class="sidebar-tab" type="button" :class="{ active: sidebarTab === 'report' }" @click="sidebarTab = 'report'">
            报告
          </button>
        </div>

        <div class="sidebar-content">
          <div v-if="sidebarTab === 'tree'" class="tree-panel">
            <div v-if="!project" class="empty-hint">
              <p>没有学习项目</p>
              <button class="create-btn" type="button" @click="router.push('/')">创建项目</button>
            </div>
            <div v-else>
              <div v-if="weakQueue.length" class="weak-queue">
                <div class="weak-queue-head">
                  <strong>薄弱复习</strong>
                  <span>{{ weakQueue.length }} 项</span>
                </div>
                <button
                  v-for="item in weakQueue.slice(0, 5)"
                  :key="item.kpId"
                  class="weak-item"
                  type="button"
                  @click="openWeakPoint(item)"
                >
                  <div class="weak-item-main">
                    <span class="weak-title">{{ item.moduleIcon }} {{ item.kpTitle }}</span>
                    <span class="weak-reason">{{ item.reason }}</span>
                  </div>
                  <span class="weak-score">{{ item.quizScore == null ? '—' : item.quizScore + '分' }}</span>
                </button>
              </div>
              <div v-for="mod in project.path.modules" :key="mod.id" class="tree-module">
                <div class="module-header" @click="toggleModule(mod.id)">
                  <span class="mod-icon">{{ mod.icon }}</span>
                  <div class="mod-main">
                    <span class="mod-title">{{ mod.title }}</span>
                    <span class="mod-count">{{ moduleDoneCount(mod) }}/{{ mod.knowledgePoints?.length ?? 0 }} · {{ moduleProgress(mod) }}%</span>
                  </div>
                  <span class="mod-arrow">{{ expandedModules.has(mod.id) ? '▲' : '▼' }}</span>
                </div>
                <div v-if="expandedModules.has(mod.id)" class="module-kps">
                  <KnowledgeCard
                    v-for="kp in sortedKps(mod)"
                    :key="kp.id"
                    :title="kp.title"
                    :description="kp.description"
                    :hours="kp.estimatedHours"
                    :progress="store.getKnowledgePointProgress(kp.id)"
                    :selected="selectedKP?.id === kp.id"
                    @click="openKP(mod, kp)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-if="sidebarTab === 'plan'" class="plan-panel">
            <div v-if="!project" class="empty-hint">
              <p>没有学习项目</p>
              <button class="create-btn" type="button" @click="router.push('/')">创建项目</button>
            </div>
            <div v-else>
              <div class="plan-toolbar">
                <label class="plan-hours">
                  <span>每日学时</span>
                  <select v-model.number="dailyHours" :disabled="planLoading">
                    <option v-for="h in planHoursOptions" :key="h" :value="h">{{ h }} 小时</option>
                  </select>
                </label>
                <div class="plan-actions">
                  <button class="generate-plan-btn" type="button" :disabled="planLoading" @click="generatePlan()">
                    {{ planLoading ? (store.generateProgress || '生成中...') : (project.studyPlan ? '重新生成计划' : 'AI 生成每日计划') }}
                  </button>
                  <button
                    v-if="planLoading"
                    class="btn btn-ghost"
                    type="button"
                    @click="cancelPlanGeneration"
                  >取消</button>
                </div>
              </div>

              <div v-if="!project.studyPlan" class="plan-empty">
                <p>选择每日学时后生成可执行学习计划</p>
              </div>
              <div v-else class="plan-list">
                <div v-for="day in project.studyPlan.days" :key="day.dayNumber" class="plan-day">
                  <div class="day-header">
                    <span class="day-number">Day {{ day.dayNumber }}</span>
                    <span class="day-date">{{ day.date }} · {{ dayProgress(day) }}%</span>
                  </div>
                  <div class="day-tasks">
                    <div
                      v-for="task in day.tasks"
                      :key="task.id"
                      class="day-task"
                      :class="{ done: isTaskCompleted(day, task.id) }"
                    >
                      <button
                        class="task-check"
                        type="button"
                        :title="isTaskCompleted(day, task.id) ? '标记未完成' : '标记完成'"
                        @click.stop="toggleTaskComplete(day.dayNumber, task.id)"
                      >{{ isTaskCompleted(day, task.id) ? '✓' : '' }}</button>
                      <button class="task-main" type="button" @click="openPlanTask(task)">
                        <span class="task-type" :class="task.type">{{ task.type }}</span>
                        <span class="task-title">{{ task.title }}</span>
                        <span class="task-time">{{ task.estimatedMinutes }}min</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="sidebarTab === 'report'" class="report-panel">
            <div v-if="!project" class="empty-hint">
              <p>没有学习项目</p>
              <button class="create-btn" type="button" @click="router.push('/')">创建项目</button>
            </div>
            <div v-else>
              <div class="report-stats" v-if="learningStats">
                <div class="stat-card">
                  <strong>{{ learningStats.overallPercent }}%</strong>
                  <span>总进度</span>
                </div>
                <div class="stat-card">
                  <strong>{{ learningStats.completedTodayCount }}</strong>
                  <span>今日完成</span>
                </div>
                <div class="stat-card">
                  <strong>{{ learningStats.planDone }}/{{ learningStats.planTotal || 0 }}</strong>
                  <span>今日计划</span>
                </div>
              </div>

              <div v-if="todayPlan" class="today-plan-card">
                <div class="today-plan-head">
                  <strong>今日计划</strong>
                  <span>{{ todayPlan.date }} · {{ learningStats?.planPercent || 0 }}%</span>
                </div>
                <div class="today-plan-tasks">
                  <button
                    v-for="task in todayPlan.tasks"
                    :key="task.id"
                    type="button"
                    class="today-task"
                    :class="{ done: isTaskCompleted(todayPlan, task.id) }"
                    @click="openTodayPlanTask(task)"
                  >
                    <span class="task-type" :class="task.type">{{ task.type }}</span>
                    <span class="task-title">{{ task.title }}</span>
                  </button>
                </div>
              </div>
              <div v-else class="today-plan-card empty">
                <p>还没有今日计划</p>
                <button class="generate-plan-btn" type="button" @click="sidebarTab = 'plan'">去生成计划</button>
              </div>

              <div class="report-actions">
                <button class="generate-plan-btn" type="button" :disabled="reportLoading" @click="generateDailyReport()">
                  {{ reportLoading ? (store.generateProgress || '生成中...') : '生成今日学习报告' }}
                </button>
                <button
                  v-if="reportLoading"
                  class="btn btn-ghost"
                  type="button"
                  @click="cancelReportGeneration"
                >取消</button>
              </div>

              <div v-if="sortedSummaries.length === 0" class="report-empty">
                <p>暂无学习报告</p>
                <p class="report-hint">完成学习或计划任务后，可一键生成今日总结</p>
              </div>
              <div v-else class="report-list">
                <div v-for="summary in sortedSummaries" :key="summary.id" class="report-card">
                  <h4>{{ summary.date }} 学习总结</h4>
                  <p>学习内容：{{ summary.learnedPoints.join('、') || '暂无' }}</p>
                  <p>学习时长：{{ summary.completedHours }}h</p>
                  <p v-if="summary.weakPoints?.length">薄弱点：{{ summary.weakPoints.join('、') }}</p>
                  <p v-if="summary.suggestions?.length">建议：{{ summary.suggestions.join('；') }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main class="graph-main">
        <div class="graph-header">
          <div>
            <h2>知识图谱</h2>
            <p class="graph-hint">按模块查看学习路径，点击节点进入详情</p>
            <div v-if="continueTarget" class="continue-strip">
              <div class="continue-strip-text">
                <strong>继续学习</strong>
                <span>{{ continueTarget.kpTitle }}</span>
                <em v-if="weakQueue.length">薄弱点 {{ weakQueue.length }} · 今日计划 {{ learningStats?.planDone || 0 }}/{{ learningStats?.planTotal || 0 }}</em>
              </div>
              <div class="continue-actions">
                <button
                  v-if="weakQueue.length"
                  class="btn btn-secondary continue-btn"
                  type="button"
                  @click="openWeakPoint(weakQueue[0])"
                >
                  先复习
                </button>
                <button class="btn btn-primary continue-btn" type="button" @click="continueLearningNow">立即学习</button>
              </div>
            </div>
          </div>
          <div class="legend">
            <span class="legend-item"><i class="dot done"></i>已完成</span>
            <span class="legend-item"><i class="dot progress"></i>学习中</span>
            <span class="legend-item"><i class="dot todo"></i>未开始</span>
          </div>
        </div>

        <div class="graph-canvas">
          <div v-if="!project" class="graph-empty">
            <p>创建学习项目后将在此处展示知识图谱</p>
          </div>
          <div v-else class="graph-lanes">
            <section v-for="mod in project.path.modules" :key="mod.id" class="lane">
              <div class="lane-head">
                <div class="lane-title">
                  <span class="lane-icon">{{ mod.icon }}</span>
                  <div>
                    <h3>{{ mod.title }}</h3>
                    <p>{{ moduleDoneCount(mod) }}/{{ mod.knowledgePoints?.length ?? 0 }} 知识点 · 预计 {{ mod.estimatedHours || 0 }}h</p>
                  </div>
                </div>
                <div class="lane-progress">
                  <div class="lane-bar">
                    <div class="lane-bar-fill" :style="{ width: moduleProgress(mod) + '%' }"></div>
                  </div>
                  <span>{{ moduleProgress(mod) }}%</span>
                </div>
              </div>

              <div class="lane-track">
                <template v-for="(kp, idx) in sortedKps(mod)" :key="kp.id">
                  <button
                    type="button"
                    class="graph-node"
                    :class="{
                      completed: getKpStatus(kp.id) === 'completed' || getKpStatus(kp.id) === 'mastered',
                      'in-progress': getKpStatus(kp.id) === 'in_progress',
                      selected: selectedKP?.id === kp.id,
                    }"
                    @click="openKP(mod, kp)"
                  >
                    <span class="node-index">{{ idx + 1 }}</span>
                    <span class="node-dot" :style="{ background: getProgressColor(getKpStatus(kp.id)) }"></span>
                    <span class="node-label">{{ kp.title }}</span>
                    <span class="node-hours">{{ kp.estimatedHours }}h</span>
                  </button>
                  <div v-if="idx < sortedKps(mod).length - 1" class="node-connector" aria-hidden="true"></div>
                </template>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>

    <Teleport to="body">
      <div v-if="showDetail && selectedKP" class="detail-overlay" @click.self="closeDetail">
        <KnowledgeDetailView
          :kp="selectedKP"
          :module="selectedModule!"
          :progress="store.getKnowledgePointProgress(selectedKP.id)"
          @close="closeDetail"
          @next="handleDetailNext"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.main-view {
  min-height: calc(100vh - var(--nav-h));
  display: flex;
  flex-direction: column;
  background: transparent;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(8, 12, 22, 0.62);
  backdrop-filter: blur(12px);
}

.nav-cluster {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.nav-btn {
  padding: 6px 8px !important;
  min-height: 0;
  font-size: 12px;
}

.nav-sep {
  color: var(--text-muted);
  font-size: 12px;
  opacity: 0.7;
}

.path-title {
  min-width: 0;
  flex: 1;
  padding-left: 12px;
  border-left: 3px solid rgba(79, 140, 255, 0.55);
}

.path-title h1 {
  margin: 0;
  font-size: 15px;
  color: #f3f7ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.path-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 168px;
  background: rgba(12, 18, 32, 0.98);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  overflow: hidden;
  z-index: 100;
  box-shadow: var(--shadow);
}

.export-menu-item {
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.export-menu-item:hover {
  background: rgba(79, 140, 255, 0.12);
  color: #fff;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1px;
  min-width: 72px;
  padding: 7px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

.stat-pill.ring-pill {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 5px 10px 5px 6px;
}

.stat-pill strong {
  font-size: 13px;
  font-weight: 700;
  color: #eef4ff;
  line-height: 1.2;
}

.stat-pill span,
.stat-text span {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.2;
}

.stat-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-pill.accent {
  border-color: rgba(34, 195, 166, 0.22);
  background: rgba(34, 195, 166, 0.08);
}

.stat-pill.accent strong {
  color: #b8fff0;
}

.main-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 352px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: rgba(12, 18, 32, 0.78);
}

.sidebar-tabs {
  display: flex;
  gap: 4px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}

.sidebar-tab {
  flex: 1;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: 10px;
  padding: 9px 8px;
  font-size: 13px;
  cursor: pointer;
}

.sidebar-tab.active {
  color: #dce9ff;
  background: rgba(79, 140, 255, 0.14);
  border-color: rgba(79, 140, 255, 0.28);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.tree-module {
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
}

.module-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  cursor: pointer;
}

.module-header:hover {
  background: rgba(79, 140, 255, 0.06);
}

.mod-icon {
  font-size: 16px;
}

.mod-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mod-title {
  font-size: 13px;
  font-weight: 650;
  color: #f2f6ff;
}

.mod-count,
.mod-arrow {
  font-size: 11px;
  color: var(--text-muted);
}

.module-kps {
  padding: 0 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-empty,
.report-empty,
.empty-hint,
.graph-empty {
  text-align: center;
  padding: 36px 16px;
  color: var(--text-muted);
}

.report-actions {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.stat-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  padding: 10px 8px;
  text-align: center;
}

.stat-card strong {
  display: block;
  font-size: 14px;
  color: #eaf2ff;
}

.stat-card span {
  font-size: 11px;
  color: var(--text-muted);
}

.today-plan-card {
  border: 1px solid rgba(79,140,255,0.22);
  border-radius: 12px;
  background: rgba(79,140,255,0.08);
  padding: 10px;
  margin-bottom: 12px;
}

.today-plan-card.empty {
  text-align: center;
  color: var(--text-muted);
}

.today-plan-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #cfe0ff;
}

.today-plan-tasks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.today-task {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: rgba(7,11,20,0.35);
  color: inherit;
  text-align: left;
  padding: 8px;
  cursor: pointer;
}

.today-task.done .task-title {
  text-decoration: line-through;
  opacity: 0.7;
}

.generate-plan-btn,
.create-btn {
  border-radius: 10px;
  border: 1px solid rgba(34, 195, 166, 0.35);
  background: rgba(34, 195, 166, 0.12);
  color: #b8fff0;
  padding: 10px 14px;
  font-size: 13px;
  cursor: pointer;
}

.create-btn {
  border-color: rgba(79, 140, 255, 0.35);
  background: rgba(79, 140, 255, 0.14);
  color: #dce9ff;
}

.generate-plan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plan-list,
.report-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plan-day,
.report-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
  overflow: hidden;
}

.day-header {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
}

.day-number {
  font-size: 13px;
  font-weight: 650;
  color: #f2f6ff;
}

.day-date,
.task-time,
.report-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.day-tasks {
  padding: 8px 10px 10px;
}

.continue-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(79, 140, 255, 0.28);
  background: rgba(79, 140, 255, 0.1);
}

.continue-strip-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.continue-strip-text strong {
  font-size: 12px;
  color: #cfe0ff;
}

.continue-strip-text span {
  font-size: 13px;
  color: #f2f6ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.continue-strip-text em {
  font-style: normal;
  font-size: 11px;
  color: #9eb5d8;
}

.continue-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.continue-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.weak-queue {
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 93, 108, 0.22);
  background: rgba(255, 93, 108, 0.06);
}

.weak-queue-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: #ffb4bc;
}

.weak-queue-head strong {
  color: #ffd0d5;
}

.weak-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.weak-item:hover {
  border-color: rgba(255, 93, 108, 0.28);
  background: rgba(255, 93, 108, 0.1);
}

.weak-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.weak-title {
  font-size: 12px;
  color: #f5f8ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.weak-reason {
  font-size: 11px;
  color: #b7c4da;
}

.weak-score {
  flex-shrink: 0;
  font-size: 11px;
  color: #ff9aa5;
}

.plan-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.plan-hours {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
}

.plan-hours select {
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(7, 11, 20, 0.7);
  color: var(--text);
  padding: 6px 8px;
}

.plan-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.day-task.done .task-title {
  text-decoration: line-through;
  opacity: 0.7;
}

.task-check {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(34, 195, 166, 0.45);
  background: rgba(34, 195, 166, 0.08);
  color: #8ef0da;
  display: grid;
  place-items: center;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.day-task.done .task-check {
  background: rgba(34, 195, 166, 0.25);
}

.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.task-main:hover .task-title {
  color: #dce9ff;
}

.task-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 650;
}

.task-type.learn { background: rgba(79, 140, 255, 0.15); color: #9ec0ff; }
.task-type.practice { background: rgba(34, 195, 166, 0.15); color: #8ef0da; }
.task-type.review { background: rgba(240, 180, 41, 0.15); color: #ffd56a; }
.task-type.test { background: rgba(255, 93, 108, 0.15); color: #ff9aa5; }

.task-title {
  flex: 1;
  color: var(--text-secondary);
}

.report-card {
  padding: 12px;
}

.report-card h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #f2f6ff;
}

.report-card p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.graph-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.graph-header h2 {
  margin: 0;
  font-size: 14px;
  color: #f2f6ff;
}

.graph-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.legend-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.legend-item .dot.done { background: #22c3a6; }
.legend-item .dot.progress { background: #f0b429; }
.legend-item .dot.todo { background: #7b8aa3; }

.graph-canvas {
  flex: 1;
  overflow: auto;
  padding: 16px 18px 24px;
}

.graph-lanes {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lane {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 14px 12px;
  background:
    linear-gradient(180deg, rgba(79, 140, 255, 0.04), transparent 40%),
    rgba(12, 18, 32, 0.58);
}

.lane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.lane-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.lane-icon {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: rgba(79, 140, 255, 0.12);
  border: 1px solid rgba(79, 140, 255, 0.18);
  flex-shrink: 0;
}

.lane-title h3 {
  margin: 0;
  font-size: 13px;
  color: #f2f6ff;
}

.lane-title p {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.lane-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 140px;
  color: var(--text-muted);
  font-size: 11px;
}

.lane-bar {
  width: 96px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.lane-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4f8cff, #22c3a6);
}

.lane-track {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}

.graph-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 148px;
  max-width: 180px;
  padding: 12px 12px 11px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: 0.18s ease;
  flex-shrink: 0;
}

.graph-node:hover {
  border-color: rgba(79, 140, 255, 0.38);
  background: rgba(79, 140, 255, 0.08);
  transform: translateY(-1px);
}

.graph-node.completed {
  border-color: rgba(34, 195, 166, 0.28);
  box-shadow: inset 0 0 0 1px rgba(34, 195, 166, 0.08);
}

.graph-node.in-progress {
  border-color: rgba(240, 180, 41, 0.28);
}

.graph-node.selected {
  border-color: rgba(79, 140, 255, 0.55);
  background: rgba(79, 140, 255, 0.14);
  box-shadow: 0 0 0 1px rgba(79, 140, 255, 0.18), 0 10px 24px rgba(0, 0, 0, 0.18);
}

.node-index {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 10px;
  color: #7f90ab;
}

.node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.node-label {
  font-size: 13px;
  font-weight: 650;
  color: #eef4ff;
  line-height: 1.35;
  padding-right: 14px;
}

.node-hours {
  font-size: 11px;
  color: var(--text-muted);
}

.node-connector {
  width: 28px;
  flex-shrink: 0;
  align-self: center;
  height: 2px;
  background: linear-gradient(90deg, rgba(79, 140, 255, 0.18), rgba(34, 195, 166, 0.28));
  position: relative;
}

.node-connector::after {
  content: '';
  position: absolute;
  right: -1px;
  top: 50%;
  width: 5px;
  height: 5px;
  border-top: 1.5px solid rgba(34, 195, 166, 0.45);
  border-right: 1.5px solid rgba(34, 195, 166, 0.45);
  transform: translateY(-50%) rotate(45deg);
}

.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 6, 12, 0.66);
  z-index: 1000;
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1180px) {
  .stat-pill:not(.ring-pill):not(.accent) {
    display: none;
  }
}

@media (max-width: 1024px) {
  .sidebar {
    width: 300px;
  }
  .lane-progress {
    min-width: 0;
  }
}

@media (max-width: 768px) {
  .main-body {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    height: 46vh;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .top-bar {
    flex-wrap: wrap;
    padding: 12px;
  }
  .header-stats {
    width: 100%;
    justify-content: flex-start;
    overflow-x: auto;
  }
  .path-title {
    order: 3;
    flex-basis: 100%;
    margin-top: 2px;
  }
  .lane-head {
    flex-direction: column;
    align-items: stretch;
  }
  .graph-header {
    flex-direction: column;
  }
  .legend {
    justify-content: flex-start;
  }
}
</style>
