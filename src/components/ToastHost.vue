<!-- Global toast host -->
<script setup lang="ts">
import { useToastState, dismissToast } from '@/utils/toast'
const state = useToastState()
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-relevant="additions">
    <div
      v-for="item in state.items"
      :key="item.id"
      class="toast"
      :class="item.type"
      role="status"
    >
      <span class="toast-msg">{{ item.message }}</span>
      <button class="toast-close" type="button" aria-label="关闭" @click="dismissToast(item.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 76px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(420px, calc(100vw - 24px));
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(12, 18, 32, 0.96);
  color: #f2f2f7;
  box-shadow: 0 12px 30px rgba(0,0,0,0.35);
  backdrop-filter: blur(10px);
  animation: toast-in 0.2s ease;
}
.toast.info { border-color: rgba(79,140,255,0.35); }
.toast.success { border-color: rgba(34,195,166,0.4); }
.toast.warning { border-color: rgba(240,180,41,0.4); }
.toast.error { border-color: rgba(255,93,108,0.45); }
.toast-msg {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.toast-close {
  border: 0;
  background: transparent;
  color: #99a6bd;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}
.toast-close:hover { color: #fff; }
@keyframes toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 480px) {
  .toast-host { left: 12px; right: 12px; max-width: none; }
}
</style>
