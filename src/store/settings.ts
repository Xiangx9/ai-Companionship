import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  type AiSettingsStored,
  type AiRuntimeConfig,
  getEnvDefaults,
  hydrateAiConfigFromStorage,
  loadStoredSettings,
  resolveAiConfig,
  saveStoredSettings,
  clearStoredSettings,
  setRuntimeStored,
  listAiModels,
  testAiConnection,
  DEFAULT_AI_MODEL,
  pickPreferredChatModel,
  normalizeModelId,
  inheritsEnvBase,
  normalizeBaseUrl,
  originOfBaseUrl,
} from '@/services/aiConfig'

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name || ''
  const msg = err instanceof Error ? err.message : String(err)
  return name === 'AbortError' || /aborted|AbortError|The user aborted/i.test(msg)
}

export const useSettingsStore = defineStore('settings', () => {
  const baseUrl = ref('')
  const apiKey = ref('')
  const model = ref(DEFAULT_AI_MODEL)
  const availableModels = ref<string[]>([])
  /** Effective base URL that availableModels was fetched from (empty if unknown/stale). */
  const modelsBaseUrl = ref('')
  const hydrated = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const listing = ref(false)
  const lastMessage = ref('')
  const lastError = ref('')

  let listSeq = 0
  let testSeq = 0
  let listAbort: AbortController | null = null
  let testAbort: AbortController | null = null

  const envDefaults = computed(() => getEnvDefaults())
  const effective = computed<AiRuntimeConfig>(() =>
    resolveAiConfig({
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      model: model.value,
    }),
  )
  const hasKey = computed(() => Boolean(effective.value.apiKey))
  const usingEnvKey = computed(() => {
    if (apiKey.value.trim()) return false
    if (!envDefaults.value.apiKey) return false
    return inheritsEnvBase(baseUrl.value, envDefaults.value.baseUrl)
  })
  const usingEnvBase = computed(() => !baseUrl.value.trim())

  function applyStored(stored: AiSettingsStored | null) {
    const env = getEnvDefaults()
    // Form shows user overrides; empty means inherit env
    baseUrl.value = (stored?.baseUrl || '').trim()
    apiKey.value = (stored?.apiKey || '').trim()
    const rawModel = (stored?.model || '').trim()
    if (rawModel) {
      model.value = normalizeModelId(rawModel)
    } else if (inheritsEnvBase(baseUrl.value, env.baseUrl)) {
      model.value = normalizeModelId(env.model || DEFAULT_AI_MODEL)
    } else {
      model.value = ''
    }
    const storedModelsBase = normalizeBaseUrl((stored as { modelsBaseUrl?: string } | null)?.modelsBaseUrl || '')
    const currentBase = normalizeBaseUrl(
      (stored?.baseUrl || '').trim() || getEnvDefaults().baseUrl,
    )
    // Only restore model chips if they were fetched for this same gateway base.
    if (
      Array.isArray(stored?.availableModels) &&
      stored!.availableModels!.length &&
      storedModelsBase &&
      storedModelsBase === currentBase
    ) {
      availableModels.value = [...stored!.availableModels!]
      modelsBaseUrl.value = storedModelsBase
    } else {
      availableModels.value = []
      modelsBaseUrl.value = ''
    }
    setRuntimeStored(stored)
  }

  function init() {
    if (hydrated.value) return
    const stored = loadStoredSettings()
    applyStored(stored)
    hydrateAiConfigFromStorage()
    hydrated.value = true
  }

  function toStored(): AiSettingsStored {
    return {
      baseUrl: baseUrl.value.trim(),
      apiKey: apiKey.value.trim(),
      model: model.value.trim() ? normalizeModelId(model.value) : '',
      availableModels: availableModels.value,
      modelsBaseUrl: modelsBaseUrl.value,
    }
  }

  function save() {
    saving.value = true
    lastError.value = ''
    try {
      const payload = toStored()
      saveStoredSettings(payload)
      setRuntimeStored(payload)
      lastMessage.value = '设置已保存'
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : '保存失败'
      return false
    } finally {
      saving.value = false
    }
  }

  function resetToEnv() {
    abortPending()
    clearStoredSettings()
    applyStored(null)
    lastMessage.value = '已恢复为环境变量默认值'
    lastError.value = ''
  }

  function abortPending() {
    listSeq += 1
    testSeq += 1
    try { listAbort?.abort() } catch { /* ignore */ }
    try { testAbort?.abort() } catch { /* ignore */ }
    listAbort = null
    testAbort = null
    listing.value = false
    testing.value = false
  }

  /** Clear stale success/error/model-list when switching gateways. */
  function clearConnectionState(opts?: { clearModels?: boolean; resetModel?: boolean }) {
    abortPending()
    lastError.value = ''
    lastMessage.value = ''
    if (opts?.clearModels !== false) {
      availableModels.value = []
      modelsBaseUrl.value = ''
    }
    if (opts?.resetModel) {
      model.value = DEFAULT_AI_MODEL
    }
  }

  /**
   * Switch service preset from the settings UI.
   * Clears stale model list / feedback so refresh always targets the new base URL.
   */
  function applyConnectionPreset(opts: {
    kind: 'env' | 'named' | 'custom'
    baseUrl?: string
    /** Preferred default model for this gateway (optional). */
    preferredModel?: string
    /** When true (default on host change), clear form API key so keys are not reused across gateways. */
    clearKeyOnHostChange?: boolean
  }) {
    const prevBase = normalizeBaseUrl(effective.value.baseUrl)
    const prevOrigin = originOfBaseUrl(prevBase)
    clearConnectionState({ clearModels: true, resetModel: false })

    if (opts.kind === 'env') {
      baseUrl.value = ''
    } else if (opts.kind === 'named' && opts.baseUrl) {
      baseUrl.value = normalizeBaseUrl(opts.baseUrl)
    }
    // custom: leave baseUrl for the user to edit; optionally seed from env if empty
    if (opts.kind === 'custom' && !baseUrl.value.trim()) {
      baseUrl.value = envDefaults.value.baseUrl
    }

    const nextBase = normalizeBaseUrl(effective.value.baseUrl)
    const nextOrigin = originOfBaseUrl(nextBase)
    const baseChanged = prevBase !== nextBase
    const hostChanged = Boolean(prevOrigin && nextOrigin && prevOrigin !== nextOrigin)

    if (hostChanged && opts.clearKeyOnHostChange !== false) {
      // Never carry Agnes key to 河涛素 / custom hosts (and vice versa).
      apiKey.value = ''
    }

    if (baseChanged || hostChanged) {
      // Drop models from previous gateway so chips never mix providers.
      availableModels.value = []
      if (opts.preferredModel) {
        model.value = normalizeModelId(opts.preferredModel)
      } else if (opts.kind === 'env') {
        model.value = DEFAULT_AI_MODEL
      } else {
        // Unknown/custom gateway: wait for refresh / manual input
        model.value = ''
      }
    }

    return {
      baseChanged,
      hostChanged,
      keyCleared: hostChanged && opts.clearKeyOnHostChange !== false,
      needsKey: !effective.value.apiKey,
      usingEnvKey: usingEnvKey.value,
      effectiveBase: effective.value.baseUrl,
    }
  }

  async function fetchModels() {
    const seq = ++listSeq
    try { listAbort?.abort() } catch { /* ignore */ }
    listAbort = new AbortController()
    const signal = listAbort.signal

    const targetBase = effective.value.baseUrl
    const targetHost = originOfBaseUrl(targetBase) || targetBase

    listing.value = true
    lastError.value = ''
    lastMessage.value = ''
    try {
      const models = await listAiModels({
        baseUrl: targetBase,
        apiKey: effective.value.apiKey,
        signal,
      })
      if (seq !== listSeq) return []
      availableModels.value = models
      modelsBaseUrl.value = normalizeBaseUrl(targetBase)
      // Prefer keeping a model that exists on this gateway; do not force DEFAULT across hosts.
      const rawCurrent = (model.value || '').trim()
      const current = rawCurrent ? normalizeModelId(rawCurrent) : ''
      if (current && models.includes(current)) {
        model.value = current
      } else {
        model.value = pickPreferredChatModel(models, current || DEFAULT_AI_MODEL)
      }
      lastMessage.value = '已从 ' + targetHost + ' 获取 ' + models.length + ' 个模型'
      return models
    } catch (err) {
      if (seq !== listSeq || isAbortError(err) || signal.aborted) {
        return []
      }
      // Failed refresh must not keep another provider's model chips.
      availableModels.value = []
      modelsBaseUrl.value = ''
      lastError.value = err instanceof Error ? err.message : '获取模型失败'
      throw err
    } finally {
      if (seq === listSeq) listing.value = false
    }
  }

  async function testConnection() {
    const seq = ++testSeq
    try { testAbort?.abort() } catch { /* ignore */ }
    testAbort = new AbortController()
    const signal = testAbort.signal

    testing.value = true
    lastError.value = ''
    lastMessage.value = ''
    try {
      const result = await testAiConnection({
        baseUrl: effective.value.baseUrl,
        apiKey: effective.value.apiKey,
        model: effective.value.model,
        signal,
      })
      if (seq !== testSeq) return result
      if (result.models?.length) {
        availableModels.value = result.models
        modelsBaseUrl.value = normalizeBaseUrl(effective.value.baseUrl)
        const current = normalizeModelId(model.value)
        if (!current || !result.models.includes(current)) {
          model.value = pickPreferredChatModel(result.models, DEFAULT_AI_MODEL)
        }
      }
      lastMessage.value = result.message
      return result
    } catch (err) {
      if (seq !== testSeq || isAbortError(err) || signal.aborted) {
        throw err
      }
      lastError.value = err instanceof Error ? err.message : '连接测试失败'
      throw err
    } finally {
      if (seq === testSeq) testing.value = false
    }
  }

  return {
    baseUrl,
    apiKey,
    model,
    availableModels,
    modelsBaseUrl,
    hydrated,
    saving,
    testing,
    listing,
    lastMessage,
    lastError,
    envDefaults,
    effective,
    hasKey,
    usingEnvKey,
    usingEnvBase,
    init,
    save,
    resetToEnv,
    fetchModels,
    testConnection,
    clearConnectionState,
    applyConnectionPreset,
    abortPending,
  }
})
