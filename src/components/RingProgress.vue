<!-- 环形进度组件 -->
<script setup lang="ts">
interface Props {
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  bgColor?: string
  showLabel?: boolean
}
withDefaults(defineProps<Props>(), {
  size: 80,
  strokeWidth: 6,
  color: '#6c63ff',
  bgColor: 'rgba(255,255,255,0.06)',
  showLabel: true,
})

const circumference = 2 * Math.PI * 40
</script>

<template>
  <div class="ring-progress" :style="{ width: size + 'px', height: size + 'px' }">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" :fill="bgColor" :stroke="bgColor" :stroke-width="strokeWidth * 1.2" />
      <circle cx="50" cy="50" r="40" fill="none" :stroke="color" :stroke-width="strokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="circumference - circumference * (percent / 100)"
        transform="rotate(-90 50 50)" stroke-linecap="round" />
      <text v-if="showLabel" x="50" y="54" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">{{ percent }}%</text>
    </svg>
  </div>
</template>