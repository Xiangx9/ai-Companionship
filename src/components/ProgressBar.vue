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
  color: '#4f8cff',
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
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.progress-track {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
  box-shadow: 0 0 12px rgba(79,140,255,0.25);
}
.progress-label {
  min-width: 36px;
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
}
.progress-bar.sm .progress-track { height: 4px; }
.progress-bar.md .progress-track { height: 6px; }
.progress-bar.lg .progress-track { height: 10px; }
.progress-bar.lg .progress-label { font-size: 13px; color: var(--text-secondary); }
</style>
