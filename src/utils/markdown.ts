import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

const HTML_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
}

const SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['foreignObject'],
}

function asHtmlString(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

/** Convert Markdown (or plain text) into sanitized HTML safe for v-html. */
export function renderMarkdown(source: string): string {
  if (!source) return ''
  const html = marked.parse(source, { async: false }) as string
  return asHtmlString(DOMPurify.sanitize(html, HTML_CONFIG))
}

/** Escape plain text then preserve line breaks without executing HTML. */
export function renderPlainText(source: string): string {
  if (!source) return ''
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped.replace(/\n/g, '<br/>')
}

/** Prefer Markdown rendering; fall back to plain escaped text on failure. */
export function renderMessageContent(source: string): string {
  try {
    return renderMarkdown(source)
  } catch {
    return renderPlainText(source)
  }
}

/** Sanitize Mermaid/SVG markup before injecting into the DOM. */
export function sanitizeSvg(svg: string): string {
  if (!svg) return ''
  return asHtmlString(DOMPurify.sanitize(svg, SVG_CONFIG))
}