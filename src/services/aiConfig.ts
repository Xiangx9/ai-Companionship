/** Runtime AI connection config: local settings override env defaults. */

import { aiFetch } from '@/services/aiFetch'

export const AI_SETTINGS_STORAGE_KEY = 'aios_ai_settings'
export const DEFAULT_AI_BASE_URL = 'https://apihub.agnes-ai.com/v1'
/** Gateway currently exposes agnes-2.0-flash as the text chat model (1.5 retired). */
export const DEFAULT_AI_MODEL = 'agnes-2.0-flash'

/** Retired / renamed model ids → current default. Applied on resolve so old localStorage still works. */
export const DEPRECATED_AI_MODELS: Record<string, string> = {
  'agnes-1.5-flash': DEFAULT_AI_MODEL,
  'agnes-1.5': DEFAULT_AI_MODEL,
}

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
  /** Base URL that availableModels was fetched from */
  modelsBaseUrl?: string
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

/** Protocol+host for comparing gateways (path ignored). */
export function originOfBaseUrl(url: string): string {
  const base = normalizeBaseUrl(url || '')
  if (!base) return ''
  try {
    return new URL(base).origin
  } catch {
    return base
  }
}

/** Map retired model ids to a working default. */
export function normalizeModelId(model: string): string {
  const m = (model || '').trim()
  if (!m) return DEFAULT_AI_MODEL
  return DEPRECATED_AI_MODELS[m] || m
}

/**
 * Prefer a text chat model from a gateway model list.
 * Skips obvious image/video/audio-only ids when better options exist.
 */
export function pickPreferredChatModel(models: string[], preferred = DEFAULT_AI_MODEL): string {
  const list = (models || []).map((m) => m.trim()).filter(Boolean)
  if (!list.length) return preferred
  if (list.includes(preferred)) return preferred
  const nonMedia = list.filter(
    (id) => !/(image|video|audio|tts|whisper|embedding|embed)/i.test(id),
  )
  return (nonMedia[0] || list[0] || preferred)
}

export function getEnvDefaults(): AiSettingsSnapshot {
  return {
    baseUrl: normalizeBaseUrl(envBaseUrl() || DEFAULT_AI_BASE_URL),
    apiKey: envApiKey(),
    model: DEFAULT_AI_MODEL,
  }
}

/** Merge stored overrides over env defaults. Empty stored fields fall back to env. */
/** True when form base is empty or equals env base (safe to inherit env API key). */
export function inheritsEnvBase(storedBaseUrl: string | undefined | null, envBaseUrl: string): boolean {
  const storedBase = normalizeBaseUrl(storedBaseUrl || '')
  if (!storedBase) return true
  return storedBase === normalizeBaseUrl(envBaseUrl || '')
}

export function resolveAiConfig(
  stored?: AiSettingsStored | null,
  envDefaults?: AiSettingsSnapshot,
): AiRuntimeConfig {
  const env = envDefaults ?? getEnvDefaults()
  const storedBase = normalizeBaseUrl(stored?.baseUrl || '')
  const baseUrl = storedBase || env.baseUrl
  const storedKey = (stored?.apiKey || '').trim()
  // Never silently reuse env key against a different gateway (e.g. Agnes key on 河涛素).
  const inheritBase = inheritsEnvBase(storedBase, env.baseUrl)
  const apiKey = storedKey || (inheritBase ? env.apiKey : '')
  const rawModel = (stored?.model || '').trim()
  // Only fall back to env/default model when still on the env gateway.
  const model = rawModel
    ? normalizeModelId(rawModel)
    : inheritBase
      ? normalizeModelId(env.model || DEFAULT_AI_MODEL)
      : ''
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

function collectModelIds(input: unknown, into: string[], depth = 0): void {
  if (depth > 4 || input == null) return
  if (typeof input === 'string') {
    const id = input.trim()
    if (id) into.push(id)
    return
  }
  if (Array.isArray(input)) {
    for (const item of input) collectModelIds(item, into, depth + 1)
    return
  }
  if (typeof input !== 'object') return
  const rec = input as Record<string, unknown>
  const direct = rec.id ?? rec.name ?? rec.model
  if (typeof direct === 'string' && direct.trim()) {
    into.push(direct.trim())
  }
  // Common OpenAI / NewAPI / nested gateway shapes
  for (const key of ['data', 'models', 'list', 'items', 'result', 'rows']) {
    if (key in rec) collectModelIds(rec[key], into, depth + 1)
  }
}

function parseModelIds(data: unknown): string[] {
  const ids: string[] = []
  collectModelIds(data, ids)
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
    let detail = text.slice(0, 220)
    try {
      const j = JSON.parse(text) as { message?: string; error?: { message?: string } | string; code?: string }
      const msg =
        (typeof j.message === 'string' && j.message) ||
        (typeof j.error === 'string' && j.error) ||
        (j.error && typeof j.error === 'object' && typeof j.error.message === 'string' ? j.error.message : '') ||
        (typeof j.code === 'string' ? j.code : '')
      if (msg) detail = msg
    } catch { /* keep raw */ }
    const host = originOfBaseUrl(baseUrl) || baseUrl
    throw new Error('获取模型列表失败 [' + host + '] (' + response.status + ')' + (detail ? ': ' + detail : ''))
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('模型列表响应不是 JSON，请检查地址是否为 OpenAI 兼容接口（需 /v1）')
  }
  const models = parseModelIds(data)
  if (!models.length) {
    throw new Error('接口未返回可用模型，请手动填写模型名称（当前地址：' + (originOfBaseUrl(baseUrl) || baseUrl) + '）')
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
  const model = (opts?.model || cfg.model || '').trim()
  if (!baseUrl) throw new Error('请填写 API Base URL')
  if (!apiKey) throw new Error('请填写 API Key')
  if (!model) throw new Error('请先选择或填写模型名称')
  const modelId = normalizeModelId(model)

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
        model: modelId,
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

