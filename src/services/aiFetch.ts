/**
 * Browser-safe AI HTTP helper.
 * In Vite dev/preview, external OpenAI-compatible hosts are proxied via /__ai_proxy
 * to avoid CORS blocks (many gateways omit Access-Control-Allow-Origin).
 */

export const AI_PROXY_PREFIX = '/__ai_proxy'
export const AI_PROXY_TARGET_HEADER = 'X-AI-Proxy-Target'

function normalizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '')
}

function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Whether this runtime should tunnel AI calls through the local Vite proxy. */
export function shouldUseAiProxy(baseUrl: string): boolean {
  try {
    // Enable in Vite dev, or when explicitly opted-in for preview builds.
    if (!import.meta.env.DEV && import.meta.env.VITE_AI_PROXY !== '1') return false
  } catch {
    return false
  }
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return false
  // Same-origin / relative base does not need proxy
  if (!isAbsoluteHttpUrl(base)) return false
  return true
}

/**
 * Build a request URL (+ optional proxy header) for an AI API path like `/models`
 * or `/chat/completions`.
 */
export function buildAiRequest(
  apiPath: string,
  opts: { baseUrl: string },
): { url: string; proxyTarget?: string } {
  const base = normalizeBaseUrl(opts.baseUrl)
  const path = apiPath.startsWith('/') ? apiPath : '/' + apiPath

  if (shouldUseAiProxy(base)) {
    return {
      url: AI_PROXY_PREFIX + path,
      proxyTarget: base,
    }
  }

  return { url: base + path }
}

export async function aiFetch(
  apiPath: string,
  init: RequestInit & { baseUrl: string },
): Promise<Response> {
  const { baseUrl, ...rest } = init
  const { url, proxyTarget } = buildAiRequest(apiPath, { baseUrl })
  const headers = new Headers(rest.headers || {})
  if (proxyTarget) {
    headers.set(AI_PROXY_TARGET_HEADER, proxyTarget)
  }
  return fetch(url, { ...rest, headers })
}