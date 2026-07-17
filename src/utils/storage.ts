/** Safe localStorage helpers for pure-frontend persistence. */

export class StorageQuotaError extends Error {
  constructor(message = '本地存储空间不足') {
    super(message)
    this.name = 'StorageQuotaError'
  }
}

export function safeGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function safeSetJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    const name = err instanceof DOMException ? err.name : (err as Error)?.name
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new StorageQuotaError('本地存储已满，请导出备份后删除旧项目或清理会话')
    }
    throw err
  }
}

export function estimateJsonBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size
  } catch {
    return JSON.stringify(value).length
  }
}

export function downloadTextFile(fileName: string, content: string, mime = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsText(file, 'utf-8')
  })
}
