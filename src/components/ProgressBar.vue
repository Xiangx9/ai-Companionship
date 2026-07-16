<!-- 进度条组件 -->
<script setup lang="ts">
interface Props {
  percent: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  color?: string
}
const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showLabel: true,
  color: '#6c63ff',
})
</script>

<template>
  <div class="progress-bar" :class="props.size">
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: percent + '%', background: props.color }"></div>
    </div>
    <span v-if="showLabel" class="progress-label">{{ percent }}%</span>
  </div>
</template>

<style scoped>
.progress-bar {
  @apply flex items-center gap-2.5 w-full;
}
.progress-track {
  @apply flex-1 h-1.5 sm:h-[6px] bg-white/[0.06] rounded-md overflow-hidden;
}
.progress-fill {
  @apply h-full rounded-md transition-all duration-500;
}
.progress-label {
  @apply text-xs sm:text-sm text-[#888] min-w-[36px] text-right;
}
.progress-bar.sm .progress-track { @apply h-1; }
.progress-bar.md .progress-track { @apply h-1.5; }
.progress-bar.lg .progress-track { @apply h-2.5; }
.progress-bar.lg .progress-label { @apply text-sm text-[#aaa]; }
</style>
