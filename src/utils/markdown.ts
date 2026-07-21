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

/**
 * Normalize common LLM formatting mistakes so chat/docs render cleanly.
 */
export function normalizeMarkdown(source: string): string {
  if (!source) return ''
  let text = source.replace(/\r\n/g, '\n').trim()

  // Convert mistaken \python / \js style fences into real code fences
  text = text.replace(/(^|\n)\\([a-zA-Z][\w+-]*)\s*\n/g, '$1```$2\n')

  // Close an unclosed code fence at EOF if we opened one
  const fenceCount = (text.match(/^```/gm) || []).length
  if (fenceCount % 2 === 1) text += '\n```'

  // Ensure blank line before/after fenced code blocks
  text = text.replace(/([^\n])\n```/g, '$1\n\n```')
  text = text.replace(/```\n(?!\n)/g, '```\n\n')

  // Turn "Step 1: xxx" plain lines into headings when not already markdown headings
  text = text.replace(/(^|\n)(?!#)((?:Step|步骤)\s*\d+\s*[:：·\-]\s*[^\n]+)/gi, '$1### $2')

  // Collapse 3+ blank lines
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/** Convert Markdown (or plain text) into sanitized HTML safe for v-html. */
export function renderMarkdown(source: string): string {
  if (!source) return ''
  const html = marked.parse(normalizeMarkdown(source), { async: false }) as string
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