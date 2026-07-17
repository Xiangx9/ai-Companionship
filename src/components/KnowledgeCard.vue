<!-- 知识点卡片 -->
<script setup lang="ts">
import type { LearningProgress } from '@/types/learning'

interface Props {
  title: string
  description: string
  hours: number
  progress?: LearningProgress
  clickable?: boolean
  selected?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  clickable: true,
  selected: false,
})

const emit = defineEmits<{ click: [] }>()

function getStatusColor(status?: string) {
  if (status === 'completed' || status === 'mastered') return '#22c3a6'
  if (status === 'in_progress') return '#f0b429'
  return '#6b7a92'
}

function getStatusLabel(status?: string) {
  if (status === 'completed' || status === 'mastered') return '已完成'
  if (status === 'in_progress') return '学习中'
  return '未开始'
}
</script>

<template>
  <div
    class="kp-card"
    :class="{ clickable: props.clickable, selected: props.selected }"
    @click="emit('click')"
  >
    <div class="status-dot" :style="{ background: getStatusColor(props?.progress?.status) }"></div>
    <div class="kp-info">
      <div class="kp-top">
        <h3 class="kp-title">{{ title }}</h3>
        <span class="kp-status" :class="props?.progress?.status || 'not_started'">
          {{ getStatusLabel(props?.progress?.status) }}
        </span>
      </div>
      <p class="kp-desc">{{ description }}</p>
      <div class="kp-meta">
        <span>{{ hours }}h</span>
        <span v-if="props?.progress?.quizScore != null">测验 {{ props.progress.quizScore }} 分</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kp-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255,255,255,0.025);
  transition: 0.18s ease;
}

.kp-card.clickable {
  cursor: pointer;
}

.kp-card.clickable:hover {
  border-color: rgba(79,140,255,0.35);
  background: rgba(79,140,255,0.08);
  transform: translateX(2px);
}

.kp-card.selected {
  border-color: rgba(79,140,255,0.5);
  background: rgba(79,140,255,0.12);
  box-shadow: inset 3px 0 0 #4f8cff, 0 0 0 1px rgba(79,140,255,0.12);
}

.kp-card.selected .kp-title {
  color: #eaf2ff;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.kp-info {
  min-width: 0;
  flex: 1;
}

.kp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kp-title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: #f2f6ff;
}

.kp-status {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.04);
}

.kp-status.completed,
.kp-status.mastered {
  color: #8ef0da;
  background: rgba(34,195,166,0.12);
}

.kp-status.in_progress {
  color: #ffd56a;
  background: rgba(240,180,41,0.12);
}

.kp-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kp-meta {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  font-size: 11px;
  color: #7f90ab;
}
</style>
