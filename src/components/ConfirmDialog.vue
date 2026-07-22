<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    /** Short bullet facts under the description */
    details?: string[]
    /** Emphasized name / subject of the action */
    subject?: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
    busy?: boolean
  }>(),
  {
    description: '',
    details: () => [],
    subject: '',
    confirmLabel: '确定',
    cancelLabel: '取消',
    tone: 'default',
    busy: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const cancelBtnRef = ref<HTMLButtonElement | null>(null)

const toneClass = computed(() => (props.tone === 'danger' ? 'tone-danger' : 'tone-default'))
const descId = computed(() => (props.description ? 'confirm-desc' : undefined))

function onCancel() {
  if (props.busy) return
  emit('cancel')
}

function onConfirm() {
  if (props.busy) return
  emit('confirm')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    onCancel()
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    onConfirm()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
      await nextTick()
      cancelBtnRef.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="confirm-root"
        role="presentation"
        @mousedown.self="onCancel"
      >
        <div
          ref="panelRef"
          class="confirm-panel"
          :class="toneClass"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          :aria-describedby="descId"
          @mousedown.stop
        >
          <div class="confirm-icon" aria-hidden="true">
            <svg v-if="tone === 'danger'" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <circle cx="12" cy="16.5" r="1" fill="currentColor" />
            </svg>
          </div>

          <div class="confirm-copy">
            <h2 id="confirm-title" class="confirm-title">{{ title }}</h2>
            <p v-if="subject" class="confirm-subject">「{{ subject }}」</p>
            <p v-if="description" id="confirm-desc" class="confirm-desc">{{ description }}</p>
            <ul v-if="details.length" class="confirm-details">
              <li v-for="(item, i) in details" :key="i">{{ item }}</li>
            </ul>
          </div>

          <div class="confirm-actions">
            <button
              ref="cancelBtnRef"
              class="btn btn-secondary"
              type="button"
              :disabled="busy"
              @click="onCancel"
            >
              {{ cancelLabel }}
            </button>
            <button
              class="btn"
              :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'"
              type="button"
              :disabled="busy"
              @click="onConfirm"
            >
              {{ busy ? '处理中…' : confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-root {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 8, 16, 0.62);
  backdrop-filter: blur(10px) saturate(1.1);
}

.confirm-panel {
  width: min(420px, 100%);
  border-radius: 16px;
  border: 1px solid var(--border-strong);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 36%),
    var(--panel-solid);
  box-shadow: 0 28px 64px rgba(0, 0, 0, 0.48);
  padding: 22px 22px 18px;
  display: grid;
  gap: 16px;
}

.confirm-panel.tone-danger {
  border-color: rgba(255, 93, 108, 0.28);
  box-shadow:
    0 28px 64px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(255, 93, 108, 0.06);
}

.confirm-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}

.tone-danger .confirm-icon {
  color: #ff8b97;
  background: rgba(255, 93, 108, 0.12);
  border: 1px solid rgba(255, 93, 108, 0.28);
}

.tone-default .confirm-icon {
  color: #9ec0ff;
  background: rgba(79, 140, 255, 0.12);
  border: 1px solid rgba(79, 140, 255, 0.28);
}

.confirm-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.confirm-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #f4f7ff;
}

.confirm-subject {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #dce9ff;
  word-break: break-word;
}

.confirm-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.confirm-details {
  margin: 2px 0 0;
  padding: 10px 12px;
  list-style: none;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 6px;
}

.confirm-details li {
  position: relative;
  padding-left: 14px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.confirm-details li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 93, 108, 0.75);
}

.tone-default .confirm-details li::before {
  background: rgba(79, 140, 255, 0.75);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.btn-danger {
  color: #fff;
  background: linear-gradient(135deg, #ff6b7a, #e23d50);
  border-color: transparent;
  box-shadow: 0 10px 24px rgba(255, 93, 108, 0.24);
}

.btn-danger:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(255, 93, 108, 0.32);
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.16s ease;
}

.confirm-fade-enter-active .confirm-panel,
.confirm-fade-leave-active .confirm-panel {
  transition: transform 0.18s ease, opacity 0.16s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-fade-enter-from .confirm-panel,
.confirm-fade-leave-to .confirm-panel {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 480px) {
  .confirm-actions {
    flex-direction: column-reverse;
  }

  .confirm-actions .btn {
    width: 100%;
  }
}
</style>