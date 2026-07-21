/**
 * Dev/preview reverse proxy for OpenAI-compatible AI gateways.
 * Frontend calls: /__ai_proxy/models with header X-AI-Proxy-Target: https://host/v1
 */
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PREFIX = '/__ai_proxy'
const TARGET_HEADER = 'x-ai-proxy-target'

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
  res.end(JSON.stringify(obj))
}

async function handleProxy(req, res) {
  const targetBase = req.headers[TARGET_HEADER]
  if (!targetBase || typeof targetBase !== 'string') {
    return sendJson(res, 400, {
      error: 'missing_proxy_target',
      message: '缺少 X-AI-Proxy-Target（API Base URL）',
    })
  }

  let targetUrl
  try {
    const rawUrl = req.url || PREFIX
    const pathAndQuery = rawUrl.startsWith(PREFIX) ? rawUrl.slice(PREFIX.length) || '/' : rawUrl
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
      // Pass through useful headers; drop CORS/encoding that confuses browser piping
      const pass = ['content-type', 'cache-control', 'x-request-id']
      for (const key of pass) {
        const v = upRes.headers[key]
        if (v) res.setHeader(key, v)
      }
      // Avoid compressed pipe issues if node auto-handled; prefer identity
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