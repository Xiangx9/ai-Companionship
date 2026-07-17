<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '@/store/learning'
import { downloadTextFile, readTextFile } from '@/utils/storage'
import { toastError, toastSuccess, toastWarning } from '@/utils/toast'
import type { LearningProject } from '@/types/learning'

const router = useRouter()
const store = useLearningStore()
const projects = computed(() => store.projects)
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

function goToProject(id: string) {
  store.setActiveProject(id)
  const target = store.getContinueTarget(id)
  router.push({
    path: '/learn/' + id,
    query: target ? { kp: target.kpId, resume: '1' } : {},
  })
}

function deleteProject(id: string) {
  if (confirm('确定要删除这个项目吗？')) {
    store.deleteProject(id)
    toastSuccess('项目已删除')
  }
}

function exportAll() {
  const data = store.exportBackup()
  if (!data?.content) {
    toastWarning('暂无数据可导出')
    return
  }
  downloadTextFile(data.fileName, data.content)
  toastSuccess('备份已导出')
}

function triggerImport() {
  fileInput.value?.click()
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  importing.value = true
  try {
    const text = await readTextFile(file)
    const result = store.importBackup(text)
    toastSuccess(`成功导入 ${result.imported} 个项目`)
  } catch (err) {
    toastError(err instanceof Error ? err.message : '导入失败')
  } finally {
    importing.value = false
  }
}

function formatDate(value?: string) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleDateString('zh-CN')
  } catch {
    return value
  }
}

function moduleCount(proj: LearningProject) {
  return proj.path?.modules?.length ?? 0
}

function totalKpCount(proj: LearningProject) {
  return (proj.path?.modules ?? []).reduce((sum, mod) => sum + (mod.knowledgePoints?.length ?? 0), 0)
}

function completedCount(proj: LearningProject) {
  return (proj.progress ?? []).filter((p) => p.status === 'completed' || p.status === 'mastered').length
}

function progressPercent(proj: LearningProject) {
  const total = totalKpCount(proj)
  if (!total) return 0
  return Math.round((completedCount(proj) / total) * 100)
}

function levelLabel(level?: string) {
  if (level === 'advanced') return '进阶'
  if (level === 'intermediate') return '有经验'
  return '零基础'
}

function nextKpTitle(proj: LearningProject) {
  return store.getContinueTarget(proj.id)?.kpTitle || ''
}

function cardStats(proj: LearningProject) {
  return store.getProjectCardStats(proj.id)
}

function levelTone(level?: string) {
  if (level === 'advanced') return 'tone-adv'
  if (level === 'intermediate') return 'tone-mid'
  return 'tone-begin'
}
</script>

<template>
  <div class="projects-page">
    <header class="page-header">
      <div class="header-copy">
        <div class="eyebrow">本地工作台</div>
        <h1>我的学习项目</h1>
        <p class="page-sub">本地保存 · 可导入导出 · 随时继续推进</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" type="button" :disabled="projects.length === 0" @click="exportAll">导出备份</button>
        <button class="btn btn-secondary" type="button" :disabled="importing" @click="triggerImport">
          {{ importing ? '导入中...' : '导入备份' }}
        </button>
        <button class="btn btn-primary" type="button" @click="router.push('/')">新建项目</button>
        <input
          ref="fileInput"
          class="hidden-file"
          type="file"
          accept="application/json,.json"
          @change="onImportFile"
        />
      </div>
    </header>

    <div v-if="projects.length === 0" class="empty-box surface">
      <div class="empty-visual">
        <div class="empty-orb"></div>
        <div class="empty-icon">📚</div>
      </div>
      <h2>还没有学习项目</h2>
      <p>从首页输入一个目标，AI 会帮你生成完整学习路径。</p>
      <button class="btn btn-primary" type="button" @click="router.push('/')">开始第一个项目</button>
    </div>

    <div v-else class="projects-grid">
      <article
        v-for="proj in projects"
        :key="proj.id"
        class="project-card surface"
        @click="goToProject(proj.id)"
      >
        <div class="card-top">
          <div class="project-icon">📖</div>
          <div class="top-right">
            <span class="level-pill" :class="levelTone(proj.path?.level)">{{ levelLabel(proj.path?.level) }}</span>
            <button class="delete-btn" type="button" title="删除项目" @click.stop="deleteProject(proj.id)">删除</button>
          </div>
        </div>

        <h3>{{ proj.name }}</h3>
        <p class="project-path">{{ proj.path?.title || '未命名路径' }}</p>
        <p v-if="nextKpTitle(proj)" class="next-kp">下一步：{{ nextKpTitle(proj) }}</p>

        <div class="progress-block">
          <div class="progress-meta">
            <span>完成进度</span>
            <strong>{{ progressPercent(proj) }}%</strong>
          </div>
          <div class="progress-mini" aria-hidden="true">
            <span :style="{ width: progressPercent(proj) + '%' }"></span>
          </div>
          <div class="progress-sub">
            {{ completedCount(proj) }}/{{ totalKpCount(proj) }} 知识点 · {{ moduleCount(proj) }} 模块
          </div>
        </div>

        <div class="project-stats dense">
          <span class="chip">{{ proj.path?.totalEstimatedHours || 0 }}h 预估</span>
          <span class="chip">今日计划 {{ cardStats(proj)?.planDone || 0 }}/{{ cardStats(proj)?.planTotal || 0 }}</span>
          <span class="chip" :class="{ warn: (cardStats(proj)?.weakCount || 0) > 0 }">
            薄弱 {{ cardStats(proj)?.weakCount || 0 }}
          </span>
          <span class="chip">连续 {{ cardStats(proj)?.streakDays || 0 }} 天</span>
          <span class="chip">{{ formatDate(proj.updatedAt || proj.createdAt) }}</span>
        </div>

        <div class="card-footer">
          <span class="continue">继续学习</span>
          <span class="arrow">→</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.projects-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 20px 40px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 22px;
}

.eyebrow {
  display: inline-flex;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(79,140,255,0.22);
  background: rgba(79,140,255,0.1);
  color: #c7dbff;
  font-size: 11px;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 28px;
  color: #f4f7ff;
  letter-spacing: -0.02em;
}

.page-sub {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hidden-file {
  display: none;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.project-card {
  padding: 18px;
  cursor: pointer;
  transition: 0.18s ease;
  overflow: hidden;
}

.project-card:hover {
  transform: translateY(-3px);
  border-color: rgba(79,140,255,0.32);
  box-shadow: 0 20px 40px rgba(0,0,0,0.28);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  gap: 10px;
}

.project-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background:
    linear-gradient(145deg, rgba(79,140,255,0.18), rgba(34,195,166,0.08));
  border: 1px solid rgba(79,140,255,0.2);
  font-size: 20px;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-pill {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  border: 1px solid transparent;
}

.tone-begin {
  color: #b8fff0;
  background: rgba(34,195,166,0.1);
  border-color: rgba(34,195,166,0.22);
}

.tone-mid {
  color: #dce9ff;
  background: rgba(79,140,255,0.12);
  border-color: rgba(79,140,255,0.24);
}

.tone-adv {
  color: #ffe6a8;
  background: rgba(240,180,41,0.12);
  border-color: rgba(240,180,41,0.24);
}

.delete-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: 0.18s ease;
}

.project-card:hover .delete-btn,
.delete-btn:focus-visible {
  opacity: 1;
}

.delete-btn:hover {
  color: #ff8b97;
  border-color: rgba(255,93,108,0.3);
  background: rgba(255,93,108,0.08);
}

.project-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: #f3f7ff;
}

.next-kp {
  margin: 6px 0 0;
  font-size: 12px;
  color: #8eb4ff;
}

.project-path {
  margin: 0 0 16px;
  color: #9ec0ff;
  font-size: 13px;
  line-height: 1.5;
  min-height: 2.8em;
}

.progress-block {
  margin-bottom: 14px;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.progress-meta strong {
  color: #dce9ff;
  font-size: 13px;
}

.progress-sub {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.project-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.project-stats.dense {
  gap: 6px;
}

.project-stats .chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  font-size: 11px;
}

.project-stats .chip.warn {
  color: #ffb0b8;
  border-color: rgba(255, 93, 108, 0.28);
  background: rgba(255, 93, 108, 0.08);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
}

.continue {
  font-weight: 600;
  color: #c9dbff;
}

.arrow {
  color: #8eb4ff;
  transition: transform 0.18s ease;
}

.project-card:hover .arrow {
  transform: translateX(3px);
}

.empty-box {
  padding: 64px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-visual {
  position: relative;
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  margin-bottom: 6px;
}

.empty-orb {
  position: absolute;
  inset: 0;
  border-radius: 24px;
  background: radial-gradient(circle at 30% 30%, rgba(79,140,255,0.28), rgba(34,195,166,0.08) 60%, transparent 70%);
  border: 1px solid rgba(79,140,255,0.18);
}

.empty-icon {
  position: relative;
  font-size: 28px;
}

.empty-box h2 {
  margin: 4px 0 0;
  font-size: 18px;
  color: #f3f7ff;
}

.empty-box p {
  margin: 0 0 10px;
  max-width: 34ch;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }
  .projects-page {
    padding: 18px 12px 28px;
  }
  .delete-btn {
    opacity: 1;
  }
}
</style>
