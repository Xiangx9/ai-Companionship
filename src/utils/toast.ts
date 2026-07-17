import { reactive } from 'vue'

export type ToastType = 'info' | 'success' | 'error' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration: number
}

const state = reactive({
  items: [] as ToastItem[],
})

let seq = 0

function remove(id: string) {
  const idx = state.items.findIndex((t) => t.id === id)
  if (idx >= 0) state.items.splice(idx, 1)
}

export function useToastState() {
  return state
}

export function toast(message: string, type: ToastType = 'info', duration = 3200) {
  const id = 'toast-' + Date.now() + '-' + (++seq)
  state.items.push({ id, type, message, duration })
  if (duration > 0) {
    window.setTimeout(() => remove(id), duration)
  }
  return id
}

export function toastSuccess(message: string, duration?: number) {
  return toast(message, 'success', duration)
}

export function toastError(message: string, duration = 4200) {
  return toast(message, 'error', duration)
}

export function toastWarning(message: string, duration?: number) {
  return toast(message, 'warning', duration)
}

export function dismissToast(id: string) {
  remove(id)
}
