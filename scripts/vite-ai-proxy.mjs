/**
 * Dev/preview reverse proxy for OpenAI-compatible AI gateways.
 * Frontend calls: /__ai_proxy/models?__ai_target=https%3A%2F%2Fhost%2Fv1
 * with header X-AI-Proxy-Target: https://host/v1
 *
 * __ai_target is stripped before upstream so it only serves as a browser cache key.
 */
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PREFIX = '/__ai_proxy'
const TARGET_HEADER = 'x-ai-proxy-target'
const TARGET_QUERY = '__ai_target'

function joinUrl(base, pathAndQuery) {
  const b = String(base || '').replace(/\/+$/, '')
  const p = pathAndQuery.startsWith('/') ? pathAndQuery : '/' + pathAndQuery
  return b + p
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.end(JSON.stringify(obj))
}

function resolveTargetBase(req) {
  const header = req.headers[TARGET_HEADER]
  if (typeof header === 'string' && header.trim()) return header.trim()

  try {
    const rawUrl = req.url || PREFIX
    const u = new URL(rawUrl, 'http://localhost')
    const q = u.searchParams.get(TARGET_QUERY)
    if (q && q.trim()) return q.trim()
  } catch {
    /* ignore */
  }
  return ''
}

/** Path+query for upstream, without our cache-key query param. */
function upstreamPathAndQuery(rawUrl) {
  const pathAndQuery = rawUrl.startsWith(PREFIX) ? rawUrl.slice(PREFIX.length) || '/' : rawUrl
  try {
    const u = new URL(pathAndQuery, 'http://local.invalid')
    u.searchParams.delete(TARGET_QUERY)
    const q = u.searchParams.toString()
    return u.pathname + (q ? '?' + q : '')
  } catch {
    return pathAndQuery
  }
}

async function handleProxy(req, res) {
  // Never let the browser cache proxy responses across different upstream hosts.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  const targetBase = resolveTargetBase(req)
  if (!targetBase) {
    return sendJson(res, 400, {
      error: 'missing_proxy_target',
      message: '缺少 X-AI-Proxy-Target（API Base URL）',
    })
  }

  let targetUrl
  try {
    const rawUrl = req.url || PREFIX
    const pathAndQuery = upstreamPathAndQuery(rawUrl)
    targetUrl = new URL(joinUrl(targetBase, pathAndQuery || '/'))
  } catch {
    return sendJson(res, 400, {
      error: 'invalid_proxy_target',
      message: '无效的 API Base URL：' + targetBase,
    })
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return sendJson(res, 400, {
      error: 'invalid_protocol',
      message: '仅支持 http/https 代理',
    })
  }

  const lib = targetUrl.protocol === 'https:' ? https : http
  const method = req.method || 'GET'
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)

  const headers = {}
  // Forward auth + content headers only (avoid hop-by-hop)
  const allow = [
    'authorization',
    'content-type',
    'accept',
    'x-api-key',
    'x-goog-api-key',
  ]
  for (const key of allow) {
    const v = req.headers[key]
    if (typeof v === 'string') headers[key] = v
  }
  headers.host = targetUrl.host
  // Avoid gzip/br bodies without Content-Encoding (breaks JSON.parse in browser)
  headers['accept-encoding'] = 'identity'
  headers['cache-control'] = 'no-cache'
  if (body && body.length) headers['content-length'] = String(body.length)

  const upstream = lib.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method,
      headers,
      timeout: 300000,
    },
    (upRes) => {
      res.statusCode = upRes.statusCode || 502
      // Pass through useful headers; always force no-store on the client side.
      const pass = ['content-type', 'x-request-id']
      for (const key of pass) {
        const v = upRes.headers[key]
        if (v) res.setHeader(key, v)
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      // Echo which upstream we hit (debug / UI verification)
      try {
        res.setHeader('X-AI-Proxy-Upstream', targetUrl.origin)
      } catch {
        /* ignore invalid header values */
      }
      upRes.pipe(res)
    },
  )

  upstream.on('timeout', () => {
    upstream.destroy()
    if (!res.headersSent) sendJson(res, 504, { error: 'upstream_timeout', message: '上游 AI 网关超时' })
  })
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: 'upstream_error',
        message: '代理上游失败：' + (err && err.message ? err.message : String(err)),
      })
    } else {
      res.end()
    }
  })

  if (body && body.length) upstream.write(body)
  upstream.end()
}

export function aiProxyPlugin() {
  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url || !req.url.startsWith(PREFIX)) return next()
      handleProxy(req, res).catch((err) => {
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: 'proxy_internal',
            message: err && err.message ? err.message : String(err),
          })
        }
      })
    })
  }

  return {
    name: 'ai-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
