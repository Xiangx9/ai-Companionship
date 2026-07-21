/**
 * Generation / cancel UI state for long-running AI calls.
 */
import type { Ref } from 'vue'
import { describeAiError } from '@/utils/aiError'

export type GenerationRefs = {
  generating: Ref<boolean>
  generateProgress: Ref<string>
  generateError: Ref<string>
  generationController: Ref<AbortController | null>
}

export function createGenerationApi(refs: GenerationRefs) {
  const { generating, generateProgress, generateError, generationController } = refs

  function beginGeneration(progressText: string) {
    if (generationController.value) {
      generationController.value.abort()
    }
    const controller = new AbortController()
    generationController.value = controller
    generating.value = true
    generateProgress.value = progressText
    generateError.value = ''
    return controller
  }

  function endGeneration(controller?: AbortController | null, opts?: { cancelled?: boolean }) {
    if (controller && generationController.value === controller) {
      generationController.value = null
    } else if (!controller) {
      generationController.value = null
    }
    generating.value = false
    if (opts?.cancelled) {
      generateProgress.value = '已取消'
    } else {
      generateProgress.value = ''
    }
  }

  function clearGenerateError() {
    generateError.value = ''
  }

  function mapGenerationError(err: unknown) {
    const info = describeAiError(err)
    generateError.value = info.message
    return info
  }

  function cancelGeneration() {
    const controller = generationController.value
    if (!controller) return false
    controller.abort()
    generateProgress.value = '已取消'
    generateError.value = ''
    generating.value = false
    generationController.value = null
    return true
  }

  return {
    beginGeneration,
    endGeneration,
    clearGenerateError,
    mapGenerationError,
    cancelGeneration,
  }
}
