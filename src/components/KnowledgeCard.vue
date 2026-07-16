<!-- 知识节点卡片组件 -->
<script setup lang="ts">
import type { LearningProgress } from '@/types/learning'

interface Props {
  title: string
  description: string
  hours: number
  progress?: LearningProgress
  clickable?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  clickable: true,
})

const emit = defineEmits<{ click: [] }>()

function getStatusColor(status?: string) {
  if (status === 'completed' || status === 'mastered') return '#00b894'
  if (status === 'in_progress') return '#fdcb6e'
  return '#636e72'
}

function getStatusIcon(status?: string) {
  if (status === 'completed' || status === 'mastered') return '✅'
  if (status === 'in_progress') return '🔄'
  return '⬜'
}
</script>

<template>
  <div class="kp-card" :class="{ clickable: props.clickable }" @click="emit('click')">
    <div class="kp-status">
      <span class="status-dot" :style="{ background: getStatusColor(props?.progress?.status) }"></span>
      <span class="status-icon">{{ getStatusIcon(props?.progress?.status) }}</span>
    </div>
    <div class="kp-info">
      <h3 class="kp-title">{{ title }}</h3>
      <p class="kp-desc">{{ description }}</p>
      <div class="kp-meta">
        <span class="kp-hours">{{ hours }}h</span>
        <span v-if="props?.progress?.quizScore != null" class="kp-score">
          测验: {{ props.progress.quizScore }}分
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kp-card {
  @apply flex items-center gap-3 p-3.5 sm:p-4 border border-white/[0.06] rounded-lg bg-white/[0.02] transition-all duration-200;
}
.kp-card.clickable { @apply cursor-pointer hover:border-[rgba(108,99,255,0.3)] hover:bg-[rgba(108,99,255,0.05)] hover:translate-x-0.5; }
.kp-status {
  @apply flex flex-col items-center gap-1 flex-shrink-0;
}
.status-dot {
  @apply w-2.5 h-2.5 rounded-full;
}
.status-icon {
  @apply text-sm;
}
.kp-info {
  @apply flex-1 min-w-0;
}
.kp-title {
  @apply text-xs sm:text-sm font-semibold text-white m-0 mb-0.5;
}
.kp-desc {
  @apply text-[11px] sm:text-xs text-[#888] m-0 whitespace-nowrap overflow-hidden text-ellipsis;
}
.kp-meta {
  @apply flex gap-2.5 mt-1;
}
.kp-hours, .kp-score {
  @apply text-[10px] sm:text-xs text-[#666];
}
</style>
