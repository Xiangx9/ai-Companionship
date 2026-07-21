/** Runtime AI connection config: local settings override env defaults. */

import { aiFetch } from '@/services/aiFetch'

export const AI_SETTINGS_STORAGE_KEY = 'aios_ai_settings'
export const DEFAULT_AI_BASE_URL = 'https://apihub.agnes-ai.com/v1'
export const DEFAULT_AI_MODEL = 'agnes-1.5-flash'

export interface AiSettingsSnapshot {
  /** OpenAI-compatible base URL, e.g. https://api.example.com/v1 */
  baseUrl: string
  /** Bearer API key */
  apiKey: string
  /** Default chat model id */
  model: string
}

export interface AiSettingsStored {
  baseUrl?: string
  apiKey?: string
  model?: string
  /** Cached model ids from last successful list call */
  availableModels?: string[]
  updatedAt?: string
}

export type AiRuntimeConfig = AiSettingsSnapshot

function envBaseUrl(): string {
  try {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL
    return typeof v === 'string' ? v.trim() : ''
  } catch {
    return ''
  }
}

function envApiKey(): string {
  try {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_KEY
    return typeof v === 'string' ? v.trim() : ''
  } catch {
    return ''
  }
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function getEnvDefaults(): AiSettingsSnapshot {
  return {
    baseUrl: normalizeBaseUrl(envBaseUrl() || DEFAULT_AI_BASE_URL),
    apiKey: envApiKey(),
    model: DEFAULT_AI_MODEL,
  }
}

/** Merge stored overrides over env defaults. Empty stored fields fall back to env. */
export function resolveAiConfig(
  stored?: AiSettingsStored | null,
  envDefaults?: AiSettingsSnapshot,
): AiRuntimeConfig {
  const env = envDefaults ?? getEnvDefaults()
  const baseUrl = normalizeBaseUrl(stored?.baseUrl || '') || env.baseUrl
  const apiKey = (stored?.apiKey || '').trim() || env.apiKey
  const model = (stored?.model || '').trim() || env.model
  return { baseUrl, apiKey, model }
}

let runtimeStored: AiSettingsStored | null = null

export function loadStoredSettings(): AiSettingsStored | null {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AiSettingsStored
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function saveStoredSettings(stored: AiSettingsStored): void {
  localStorage.setItem(
    AI_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...stored,
      updatedAt: new Date().toISOString(),
    }),
  )
}

export function clearStoredSettings(): void {
  localStorage.removeItem(AI_SETTINGS_STORAGE_KEY)
}

/** Sync module-level runtime from localStorage (call on app boot / after save). */
export function hydrateAiConfigFromStorage(): AiRuntimeConfig {
  runtimeStored = loadStoredSettings()
  return resolveAiConfig(runtimeStored)
}

export function setRuntimeStored(stored: AiSettingsStored | null): AiRuntimeConfig {
  runtimeStored = stored
  return resolveAiConfig(runtimeStored)
}

export function getAiConfig(): AiRuntimeConfig {
  if (runtimeStored === null) {
    runtimeStored = loadStoredSettings()
  }
  return resolveAiConfig(runtimeStored)
}

export function hasApiKeyConfigured(): boolean {
  return Boolean(getAiConfig().apiKey)
}

export function maskApiKey(key: string): string {
  const k = key.trim()
  if (!k) return ''
  if (k.length <= 8) return '********'
  return k.slice(0, 4) + '****' + k.slice(-4)
}

function parseModelIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const root = data as Record<string, unknown>
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : Array.isArray(root)
        ? (root as unknown[])
        : []

  const ids: string[] = []
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      ids.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>
      const id = rec.id ?? rec.name ?? rec.model
      if (typeof id === 'string' && id.trim()) ids.push(id.trim())
    }
  }
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b))
}

export async function listAiModels(opts?: {
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
}): Promise<string[]> {
  const cfg = getAiConfig()
  const baseUrl = normalizeBaseUrl(opts?.baseUrl || cfg.baseUrl)
  const apiKey = (opts?.apiKey ?? cfg.apiKey).trim()
  if (!baseUrl) throw new Error('请填写 API Base URL')
  if (!apiKey) throw new Error('请填写 API Key')

  const response = await aiFetch('/models', {
    baseUrl,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    signal: opts?.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error('获取模型列表失败 (' + response.status + ')' + (text ? ': ' + text.slice(0, 200) : ''))
  }

  const data = await response.json()
  const models = parseModelIds(data)
  if (!models.length) {
    throw new Error('接口未返回可用模型，请手动填写模型名称')
  }
  return models
}

/** Lightweight connectivity check: prefer /models, fallback to a tiny chat completion. */
export async function testAiConnection(opts?: {
  baseUrl?: string
  apiKey?: string
  model?: string
  signal?: AbortSignal
}): Promise<{ ok: true; models?: string[]; message: string }> {
  const cfg = getAiConfig()
  const baseUrl = normalizeBaseUrl(opts?.baseUrl || cfg.baseUrl)
  const apiKey = (opts?.apiKey ?? cfg.apiKey).trim()
  const model = (opts?.model || cfg.model || DEFAULT_AI_MODEL).trim()
  if (!baseUrl) throw new Error('请填写 API Base URL')
  if (!apiKey) throw new Error('请填写 API Key')

  try {
    const models = await listAiModels({ baseUrl, apiKey, signal: opts?.signal })
    return {
      ok: true,
      models,
      message: '连接成功，已获取 ' + models.length + ' 个模型',
    }
  } catch (listErr) {
    // Fallback: many gateways omit /models
    const response = await aiFetch('/chat/completions', {
      baseUrl,
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
        temperature: 0,
      }),
      signal: opts?.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const listMsg = listErr instanceof Error ? listErr.message : String(listErr)
      throw new Error(
        '连接失败。模型列表：' + listMsg + '；对话探测 (' + response.status + ')' +
          (text ? ': ' + text.slice(0, 160) : ''),
      )
    }
    return {
      ok: true,
      message: '连接成功（网关未提供模型列表，已用对话接口验证）',
    }
  }
}