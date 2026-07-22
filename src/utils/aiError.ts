/**
 * Unified AI request error copy + retry hints for generation UX.
 */

export type AiErrorCode =
  | 'timeout'
  | 'aborted'
  | 'http'
  | 'config'
  | 'empty'
  | 'network'
  | 'unknown'

export interface AiErrorInfo {
  code: AiErrorCode
  title: string
  message: string
  retryable: boolean
}

function readCode(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

function readMessage(err: unknown): string {
  if (err instanceof Error) return err.message || ''
  if (typeof err === 'string') return err
  return ''
}

function isModelUnavailableMessage(raw: string): boolean {
  return /model_not_found|No available channel for model|model is not available|unknown model|invalid model|模型不存在|模型不可用|无可用通道/i.test(
    raw,
  )
}

/**
 * Map raw AI / network errors into stable Chinese UI copy.
 */
export function describeAiError(err: unknown): AiErrorInfo {
  const code = readCode(err)
  const raw = readMessage(err).trim()

  if (code === 'aborted' || /aborted|AbortError|已取消|取消/.test(raw)) {
    return {
      code: 'aborted',
      title: '已取消',
      message: '请求已取消',
      retryable: false,
    }
  }

  // Model retired / no channel — check before generic 503/timeout copy
  if (isModelUnavailableMessage(raw) || (code === 'config' && /model/i.test(raw))) {
    const m = raw.match(/No available channel for model\s+([^\s]+)(?:\s+under)?/i)
    const modelName = m?.[1] ? m[1].replace(/["',]/g, '') : ''
    return {
      code: 'config',
      title: '模型不可用',
      message: modelName
        ? `当前模型「${modelName}」在网关没有可用通道。请打开「设置」刷新模型列表，选择可用文本模型（如 agnes-2.0-flash）后重试。`
        : '当前模型在网关没有可用通道。请打开「设置」刷新模型列表并切换可用文本模型后重试。',
      retryable: true,
    }
  }

  // Prefer explicit timeout codes; avoid swallowing gateway errors that merely mention "timeout"
  if (code === 'timeout' || /请求超时|AI 请求超时|AI 响应较慢|upstream_timeout|A Timeout Occurred/i.test(raw)) {
    return {
      code: 'timeout',
      title: '请求超时',
      message: 'AI 响应较慢或已超时，请点击重试',
      retryable: true,
    }
  }

  if (code === 'config' || /VITE_API_KEY|API Key|未配置 API|请填写 API/i.test(raw)) {
    return {
      code: 'config',
      title: '配置缺失',
      message: raw || '请先在「设置」中配置 API Key，或在 .env.local 中配置 VITE_API_KEY',
      retryable: false,
    }
  }

  if (code === 'empty' || /空内容|empty/i.test(raw)) {
    return {
      code: 'empty',
      title: '返回为空',
      message: 'AI 返回了空内容，请稍后重试',
      retryable: true,
    }
  }

  if (
    code === 'network' ||
    /Failed to fetch|NetworkError|network|ERR_NETWORK|断网|ECONN|ENOTFOUND|fetch failed/i.test(raw)
  ) {
    return {
      code: 'network',
      title: '网络异常',
      message: '网络连接失败。若使用第三方 API，可能是跨域(CORS)被拦截；开发环境请用 npm run dev（已内置代理），并确认 Base URL 含 /v1',
      retryable: true,
    }
  }

  // Cloudflare / reverse-proxy timeouts & gateway errors
  if (
    /\b524\b|\b504\b|\b502\b|\b503\b|error code:\s*524|upstream_timeout|网关超时|Gateway Time-out|A Timeout Occurred/i.test(
      raw,
    )
  ) {
    const is524 = /\b524\b|error code:\s*524|A Timeout Occurred/i.test(raw)
    return {
      code: 'timeout',
      title: is524 ? '上游超时 (524)' : '网关超时',
      message: is524
        ? 'AI 网关在 Cloudflare 侧超时（524）：上游模型响应过慢或卡住。请稍后重试；生成路径可改用更快模型，或在设置里换更稳定的 Base URL。'
        : 'AI 网关超时或暂时不可用，请稍后重试；若频繁出现，请检查网络或更换模型/接口。',
      retryable: true,
    }
  }

  if (code === 'http' || /AI 请求失败|HTTP|status\s*\d+/i.test(raw)) {
    return {
      code: 'http',
      title: '服务异常',
      message: raw || 'AI 服务暂时不可用，请稍后重试',
      retryable: true,
    }
  }

  return {
    code: 'unknown',
    title: '生成失败',
    message: raw || '生成失败，请重试',
    retryable: true,
  }
}

export function isAbortLikeError(err: unknown): boolean {
  return describeAiError(err).code === 'aborted'
}

