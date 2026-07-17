/** Lightweight helpers for robust AI JSON parsing (no backend required). */

export class AiJsonError extends Error {
  raw: string
  cause?: unknown

  constructor(message: string, raw: string, cause?: unknown) {
    super(message)
    this.name = 'AiJsonError'
    this.raw = raw
    this.cause = cause
  }
}

/** Strip markdown fences and common wrappers from model output. */
export function stripCodeFences(text: string): string {
  let result = text.trim()
  const fenced = result.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) result = fenced[1].trim()
  return result
}

/**
 * Best-effort repair of near-JSON model output.
 * Intentionally conservative — never invents structure.
 */
export function repairJsonText(text: string): string {
  let result = stripCodeFences(text)

  const firstObj = result.indexOf('{')
  const firstArr = result.indexOf('[')
  let start = -1
  if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) start = firstObj
  else if (firstArr >= 0) start = firstArr

  if (start > 0) result = result.slice(start)

  result = trimToBalancedJson(result)
  result = result.replace(/([{\[,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
  result = result.replace(/,\s*([}\]])/g, '$1')

  return result.trim()
}

function trimToBalancedJson(text: string): string {
  if (!text) return text
  const open = text[0]
  const close = open === '{' ? '}' : open === '[' ? ']' : ''
  if (!close) return text

  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(0, i + 1)
    }
  }
  return text
}

export function parseAiJson<T = unknown>(text: string): T {
  const attempts = [stripCodeFences(text), repairJsonText(text)]
  let lastError: unknown

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T
    } catch (err) {
      lastError = err
    }
  }

  try {
    const loose = repairJsonText(text)
      .replace(/'/g, '"')
      .replace(/""/g, '"')
    return JSON.parse(loose) as T
  } catch (err) {
    throw new AiJsonError('AI 返回的 JSON 无法解析', text, err ?? lastError)
  }
}

export type JsonValidator<T> = (value: unknown) => value is T

export function parseAndValidateAiJson<T>(
  text: string,
  validate: JsonValidator<T>,
  label = 'AI 结果',
): T {
  const parsed = parseAiJson<unknown>(text)
  const candidates: unknown[] = [parsed]
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    for (const key of ['data', 'result', 'payload', 'learningPath', 'exercises', 'diagrams', 'summary']) {
      if (key in obj) candidates.push(obj[key])
    }
  }

  for (const candidate of candidates) {
    if (validate(candidate)) return candidate
    if (
      candidate &&
      typeof candidate === 'object' &&
      Array.isArray((candidate as { exercises?: unknown }).exercises) &&
      validate((candidate as { exercises: unknown }).exercises)
    ) {
      return (candidate as { exercises: T }).exercises
    }
    if (
      candidate &&
      typeof candidate === 'object' &&
      Array.isArray((candidate as { diagrams?: unknown }).diagrams) &&
      validate((candidate as { diagrams: unknown }).diagrams)
    ) {
      return (candidate as { diagrams: T }).diagrams
    }
  }

  throw new AiJsonError(`${label} 结构不符合预期`, text)
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: { retries?: number; label?: string },
): Promise<T> {
  const retries = opts?.retries ?? 2
  const label = opts?.label ?? 'AI 请求'
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      // Never retry user-cancelled requests.
      if (/aborted|AbortError/i.test(msg) || (err as { code?: string })?.code === 'aborted') {
        break
      }
      const retryable =
        err instanceof AiJsonError ||
        /JSON|结构|解析|空内容|empty|timeout|超时/i.test(msg)
      if (!retryable || attempt === retries) break
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`${label}失败`)
}
