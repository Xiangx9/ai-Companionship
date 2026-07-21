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

  if (code === 'timeout' || /超时|timeout/i.test(raw)) {
    return {
      code: 'timeout',
      title: '请求超时',
      message: 'AI 响应较慢或已超时，请点击重试',
      retryable: true,
    }
  }

  if (code === 'config' || /VITE_API_KEY|API Key|未配置|设置/.test(raw)) {
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
