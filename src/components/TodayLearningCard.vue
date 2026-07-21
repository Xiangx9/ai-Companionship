<script setup lang="ts">
export type TodayLearningCardModel = {
  projectId: string
  projectName: string
  kpId: string
  kpTitle: string
  kpDescription?: string
  moduleId: string
  moduleTitle: string
  moduleIcon?: string
  status: string
  statusLabel: string
  reason: string
  reasonLabel: string
  estimatedMinutes: number
  estimatedHours: number
  planTaskTitle?: string
  planDone: number
  planTotal: number
  planPercent: number
  completedTodayCount: number
  isAllDone?: boolean
  wrongCount?: number
  reviewItem?: {
    kpId: string
    kpTitle: string
    moduleId: string
    moduleTitle: string
    moduleIcon?: string
    reasonLabel: string
    score: number | null
  } | null
}

const props = withDefaults(
  defineProps<{
    card: TodayLearningCardModel
    /** show project name (Home) */
    showProject?: boolean
    /** compact layout for tree header */
    compact?: boolean
    ctaLabel?: string
  }>(),
  {
    showProject: false,
    compact: false,
    ctaLabel: '开始学习',
  },
)

const emit = defineEmits<{
  continue: []
  review: []
}>()

function formatDuration(mins: number) {
  if (!mins || mins <= 0) return '约 30 分钟'
  if (mins < 60) return `约 ${mins} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `约 ${h} 小时 ${m} 分` : `约 ${h} 小时`
}

const tone = () => {
  if (props.card.isAllDone) return 'done'
  if (props.card.reason === 'in_progress') return 'active'
  if (props.card.reason === 'today_plan') return 'plan'
  if (props.card.reason === 'review') return 'review'
  return 'next'
}
</script>

<template>
  <section class="today-card" :class="[tone(), { compact }]">
    <div class="today-main">
      <div class="today-kicker-row">
        <span class="today-kicker">今日学习</span>
        <span class="today-reason">{{ card.reasonLabel }}</span>
      </div>

      <div v-if="showProject" class="today-project">{{ card.projectName }}</div>

      <h3 class="today-title">
        <span v-if="card.moduleIcon" class="today-icon" aria-hidden="true">{{ card.moduleIcon }}</span>
        {{ card.kpTitle }}
      </h3>

      <p v-if="!compact && card.planTaskTitle" class="today-task">
        计划任务：{{ card.planTaskTitle }}
      </p>
      <p v-else-if="!compact && card.kpDescription" class="today-desc">
        {{ card.kpDescription }}
      </p>

      <div class="today-meta">
        <span class="chip">{{ card.statusLabel }}</span>
        <span class="chip">{{ formatDuration(card.estimatedMinutes) }}</span>
        <span v-if="card.moduleTitle" class="chip muted">{{ card.moduleTitle }}</span>
        <span v-if="card.planTotal > 0" class="chip muted">
          今日计划 {{ card.planDone }}/{{ card.planTotal }}
        </span>
        <span v-if="card.completedTodayCount > 0" class="chip muted">
          今日完成 {{ card.completedTodayCount }}
        </span>
        <span v-if="(card.wrongCount || 0) > 0" class="chip warn">
          错题 {{ card.wrongCount }}
        </span>
      </div>

      <button
        v-if="card.reviewItem"
        class="review-strip"
        type="button"
        @click.stop="emit('review')"
      >
        <span class="review-kicker">{{ card.reviewItem.reasonLabel }}</span>
        <span class="review-title">{{ card.reviewItem.moduleIcon }} {{ card.reviewItem.kpTitle }}</span>
        <span v-if="card.reviewItem.score != null" class="review-score">{{ card.reviewItem.score }}分</span>
      </button>
    </div>

    <div class="today-actions">
      <button
        class="btn btn-primary today-cta"
        type="button"
        @click="emit('continue')"
      >
        {{ card.isAllDone ? '复习巩固' : ctaLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.today-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(79, 140, 255, 0.28);
  background:
    linear-gradient(135deg, rgba(79, 140, 255, 0.14), transparent 55%),
    rgba(10, 18, 28, 0.72);
}

.today-card.active {
  border-color: rgba(34, 195, 166, 0.35);
  background:
    linear-gradient(135deg, rgba(34, 195, 166, 0.16), transparent 55%),
    rgba(10, 18, 28, 0.72);
}

.today-card.plan {
  border-color: rgba(255, 184, 77, 0.32);
  background:
    linear-gradient(135deg, rgba(255, 184, 77, 0.12), transparent 55%),
    rgba(10, 18, 28, 0.72);
}

.today-card.review,
.today-card.done {
  border-color: rgba(167, 139, 250, 0.3);
  background:
    linear-gradient(135deg, rgba(167, 139, 250, 0.12), transparent 55%),
    rgba(10, 18, 28, 0.72);
}

.today-card.compact {
  padding: 10px 12px;
  border-radius: 12px;
}

.today-main {
  min-width: 0;
  flex: 1;
}

.today-kicker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.today-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #cfe0ff;
}

.today-card.active .today-kicker {
  color: #8ef0da;
}

.today-card.plan .today-kicker {
  color: #ffd59a;
}

.today-reason {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #b7c7e0;
}

.today-project {
  font-size: 12px;
  color: var(--text-muted, #9eb5d8);
  margin-bottom: 2px;
}

.today-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #f2f8ff;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.today-card.compact .today-title {
  font-size: 13px;
}

.today-icon {
  flex-shrink: 0;
}

.today-task,
.today-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted, #9eb5d8);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.today-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(142, 180, 255, 0.22);
  background: rgba(79, 140, 255, 0.1);
  color: #d7e6ff;
}

.chip.warn {
  border-color: rgba(255, 93, 108, 0.35);
  background: rgba(255, 93, 108, 0.12);
  color: #ffc2c9;
}

.review-strip {
  margin-top: 10px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px dashed rgba(255, 184, 77, 0.35);
  background: rgba(255, 184, 77, 0.08);
  color: #ffe3b0;
  cursor: pointer;
  text-align: left;
}

.review-strip:hover {
  background: rgba(255, 184, 77, 0.14);
}

.review-kicker {
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.review-title {
  font-size: 12px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-score {
  font-size: 11px;
  color: #ffc2c9;
  flex-shrink: 0;
}

.chip.muted {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #9eb5d8;
}

.today-actions {
  flex-shrink: 0;
}

.today-cta {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .today-card {
    flex-direction: column;
    align-items: stretch;
  }

  .today-actions {
    width: 100%;
  }

  .today-cta {
    width: 100%;
  }
}
</style>