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
} from '@/services/aiConfig'

export const useSettingsStore = defineStore('settings', () => {
  const baseUrl = ref('')
  const apiKey = ref('')
  const model = ref(DEFAULT_AI_MODEL)
  const availableModels = ref<string[]>([])
  const hydrated = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const listing = ref(false)
  const lastMessage = ref('')
  const lastError = ref('')

  const envDefaults = computed(() => getEnvDefaults())
  const effective = computed<AiRuntimeConfig>(() =>
    resolveAiConfig({
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      model: model.value,
    }),
  )
  const hasKey = computed(() => Boolean(effective.value.apiKey))
  const usingEnvKey = computed(() => !apiKey.value.trim() && Boolean(envDefaults.value.apiKey))
  const usingEnvBase = computed(() => !baseUrl.value.trim())

  function applyStored(stored: AiSettingsStored | null) {
    const env = getEnvDefaults()
    // Form shows user overrides; empty means inherit env
    baseUrl.value = (stored?.baseUrl || '').trim()
    apiKey.value = (stored?.apiKey || '').trim()
    model.value = (stored?.model || '').trim() || env.model || DEFAULT_AI_MODEL
    availableModels.value = Array.isArray(stored?.availableModels) ? [...stored!.availableModels!] : []
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
      model: model.value.trim() || DEFAULT_AI_MODEL,
      availableModels: availableModels.value,
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
    clearStoredSettings()
    applyStored(null)
    lastMessage.value = '已恢复为环境变量默认值'
    lastError.value = ''
  }

  async function fetchModels() {
    listing.value = true
    lastError.value = ''
    lastMessage.value = ''
    try {
      const models = await listAiModels({
        baseUrl: effective.value.baseUrl,
        apiKey: effective.value.apiKey,
      })
      availableModels.value = models
      if (!model.value || !models.includes(model.value)) {
        // Prefer current default if present, else first model
        if (models.includes(DEFAULT_AI_MODEL)) model.value = DEFAULT_AI_MODEL
        else if (models.length) model.value = models[0]
      }
      lastMessage.value = '已获取 ' + models.length + ' 个模型'
      return models
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : '获取模型失败'
      throw err
    } finally {
      listing.value = false
    }
  }

  async function testConnection() {
    testing.value = true
    lastError.value = ''
    lastMessage.value = ''
    try {
      const result = await testAiConnection({
        baseUrl: effective.value.baseUrl,
        apiKey: effective.value.apiKey,
        model: effective.value.model,
      })
      if (result.models?.length) {
        availableModels.value = result.models
        if (!model.value || !result.models.includes(model.value)) {
          if (result.models.includes(DEFAULT_AI_MODEL)) model.value = DEFAULT_AI_MODEL
          else model.value = result.models[0]
        }
      }
      lastMessage.value = result.message
      return result
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : '连接测试失败'
      throw err
    } finally {
      testing.value = false
    }
  }

  return {
    baseUrl,
    apiKey,
    model,
    availableModels,
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
  }
})