/**
 * ISSUE-07 · Week1 smoke E2E (mock AI)
 *
 * Flow: seed project → open learn page → open KP → teach tab → start teaching
 *       → quick action / send reply
 *
 * Usage:
 *   npm run test:smoke
 *   node scripts/smoke-e2e.cjs
 *   BASE_URL=http://127.0.0.1:5173 node scripts/smoke-e2e.cjs
 *
 * Does NOT call real AI. Fails with readable console + JSON report.
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT_DIR = path.resolve('screenshots/smoke')
const REPORT = path.resolve('screenshots/smoke-report.json')
const HEADLESS = process.env.HEADED !== '1'

fs.mkdirSync(OUT_DIR, { recursive: true })

const now = new Date().toISOString()
const FIXTURE = {
  id: 'proj-smoke-week1',
  name: '冒烟测试·Vue 基础',
  domain: 'frontend',
  path: {
    id: 'path-smoke-1',
    title: 'Vue 基础路径',
    description: 'Week1 smoke fixture',
    level: 'beginner',
    modules: [
      {
        id: 'mod-smoke-1',
        title: '基础入门',
        description: '从响应式开始',
        icon: '📘',
        estimatedHours: 2,
        knowledgePoints: [
          {
            id: 'kp-smoke-1',
            title: '响应式基础',
            description: '理解 ref 与 reactive 的基本用法',
            prerequisites: [],
            resources: [],
            estimatedHours: 1,
            order: 1,
            keyPoints: ['ref', 'reactive', '依赖追踪'],
            commonMistakes: ['把 ref 当普通变量改'],
          },
          {
            id: 'kp-smoke-2',
            title: '模板语法',
            description: '插值与指令',
            prerequisites: ['kp-smoke-1'],
            resources: [],
            estimatedHours: 1,
            order: 2,
            keyPoints: ['插值', 'v-bind', 'v-on'],
            commonMistakes: [],
          },
        ],
      },
    ],
    totalEstimatedHours: 2,
    tags: ['vue', 'smoke'],
  },
  progress: [],
  dailySummaries: [],
  teachingSessions: [],
  currentKnowledgePointId: 'kp-smoke-1',
  createdAt: now,
  updatedAt: now,
}

const steps = []
let aiHits = 0
let serverChild = null

function log(step, ok, detail = '') {
  const item = {
    step,
    ok: !!ok,
    detail: String(detail || '').slice(0, 600),
    at: new Date().toISOString(),
  }
  steps.push(item)
  const tag = ok ? 'OK  ' : 'FAIL'
  console.log(`${tag} | ${step}${detail ? ' | ' + String(detail).slice(0, 220) : ''}`)
  writeReport()
}

function writeReport() {
  const failCount = steps.filter((s) => !s.ok).length
  const payload = {
    base: BASE,
    mode: 'mock-ai',
    okCount: steps.filter((s) => s.ok).length,
    failCount,
    aiHits,
    steps,
    finishedAt: new Date().toISOString(),
  }
  fs.writeFileSync(REPORT, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${String(steps.length).padStart(2, '0')}-${name}.png`)
  try {
    await page.screenshot({ path: file, fullPage: true })
  } catch (err) {
    console.log('screenshot skip', err instanceof Error ? err.message : err)
  }
  return file
}

function waitHttpOk(url, timeoutMs = 60000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const req = http.get(url, { timeout: 2000 }, (res) => {
          res.resume()
          if (res.statusCode && res.statusCode < 500) return resolve(true)
          if (Date.now() - started > timeoutMs) return reject(new Error('server not ready: ' + url))
          setTimeout(tick, 800)
        })
        req.on('timeout', () => {
          req.destroy()
          if (Date.now() - started > timeoutMs) return reject(new Error('server not ready: ' + url))
          setTimeout(tick, 800)
        })
        req.on('error', () => {
          if (Date.now() - started > timeoutMs) return reject(new Error('server not ready: ' + url))
          setTimeout(tick, 800)
        })
      } catch (err) {
        if (Date.now() - started > timeoutMs) return reject(err)
        setTimeout(tick, 800)
      }
    }
    tick()
  })
}

function probeServer(timeoutMs = 2500) {
  const candidates = Array.from(
    new Set([
      BASE,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://[::1]:5173',
    ]),
  )
  return Promise.any(candidates.map((url) => waitHttpOk(url, timeoutMs).then(() => url)))
}

async function ensureServer() {
  try {
    const readyUrl = await probeServer(3000)
    if (readyUrl !== BASE) {
      console.log('using detected server URL', readyUrl, '(BASE was', BASE + ')')
    }
    // keep BASE as configured for navigation; if localhost fails later user can set BASE_URL
    log('ensure-server', true, 'already running ' + readyUrl)
    return
  } catch {
    // start vite
  }
  console.log('starting vite dev server...')
  const isWin = process.platform === 'win32'
  serverChild = spawn(
    isWin ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
      shell: isWin,
    },
  )
  serverChild.stdout.on('data', (d) => process.stdout.write('[vite] ' + d))
  serverChild.stderr.on('data', (d) => process.stderr.write('[vite] ' + d))
  await waitHttpOk('http://127.0.0.1:5173', 90000)
  log('ensure-server', true, 'started http://127.0.0.1:5173')
}

function mockChatBody(userText) {
  const short = /再说短一点|再举一例|我还不懂/.test(userText)
  const content = short
    ? [
        '### Step · 更短一版',
        '',
        '- **ref** 像盒子，改值用 `.value`',
        '- **reactive** 像可追踪的普通对象',
        '',
        '请用自己的话回答：ref 和 reactive 各适合什么场景？',
      ].join('\n')
    : [
        '### Step 1 · 响应式是什么',
        '',
        '响应式让数据变化时页面自动更新。',
        '',
        '- 用 `ref` 包装基础值',
        '- 用 `reactive` 包装对象',
        '',
        '```js',
        "const count = ref(0)",
        'count.value++',
        '```',
        '',
        '请用自己的话回答：为什么改 `count` 要写 `count.value`？',
      ].join('\n')

  return JSON.stringify({
    id: 'chatcmpl-smoke',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-smoke',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  })
}

async function main() {
  console.log('ISSUE-07 smoke E2E')
  console.log('BASE', BASE)
  console.log('OUT ', OUT_DIR)

  await ensureServer()

  const browser = await chromium.launch({ headless: HEADLESS })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'zh-CN',
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // Mock all AI chat completions
  await page.route('**/chat/completions', async (route) => {
    aiHits += 1
    let userBlob = ''
    try {
      const raw = route.request().postData() || '{}'
      const body = JSON.parse(raw)
      const msgs = Array.isArray(body.messages) ? body.messages : []
      userBlob = msgs.map((m) => String(m.content || '')).join('\n')
    } catch {
      userBlob = ''
    }
    // small delay to exercise loading UI without slowing smoke much
    await new Promise((r) => setTimeout(r, 120))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: mockChatBody(userBlob),
    })
  })

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('#app', { timeout: 15000 })
    await shot(page, 'home')
    const homeText = await page.locator('body').innerText()
    log('open-home', /AI Learning OS|开始学习|继续/.test(homeText), homeText.slice(0, 120).replace(/\s+/g, ' '))

    // Seed fixture project
    await page.evaluate((fixture) => {
      localStorage.setItem('aios_projects', JSON.stringify([fixture]))
      localStorage.setItem('aios_active_project', fixture.id)
    }, FIXTURE)
    log('seed-project', true, FIXTURE.id)

    await page.goto(`${BASE}/learn/${FIXTURE.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForTimeout(600)
    await shot(page, 'learn')

    const onLearn = page.url().includes('/learn/')
    const learnText = await page.locator('body').innerText()
    log(
      'enter-existing-project',
      onLearn && /基础入门|响应式基础|冒烟测试/.test(learnText),
      `url=${page.url()} | ${learnText.slice(0, 160).replace(/\s+/g, ' ')}`,
    )
    if (!onLearn) throw new Error('failed to enter project page')

    // Open KP detail: resumeFromRoute may already auto-open when
    // currentKnowledgePointId is set (overlay then blocks kp-card clicks).
    const detail = page.locator('.detail-panel')
    let detailVisible = await detail.isVisible().catch(() => false)
    let openVia = 'already-open'

    if (!detailVisible) {
      const modHeader = page.locator('.module-header').first()
      if (await modHeader.count()) {
        await modHeader.click().catch(() => {})
        await page.waitForTimeout(200)
      }

      const kpCard = page.locator('.kp-card').filter({ hasText: '响应式基础' }).first()
      const target = (await kpCard.count()) ? kpCard : page.locator('.kp-card').first()
      try {
        await target.click({ timeout: 5000 })
        openVia = 'click'
      } catch (clickErr) {
        // Overlay or other layer intercepts — force open or close-then-open
        const closeBtn = page.locator('.detail-overlay .close-btn, .detail-panel .close-btn, button').filter({ hasText: /关闭|×|✕/ }).first()
        if (await closeBtn.count()) {
          await closeBtn.click({ force: true }).catch(() => {})
          await page.waitForTimeout(200)
        }
        await target.click({ force: true, timeout: 5000 })
        openVia = 'force-click'
      }
      await page.waitForTimeout(400)
      detailVisible = await detail.isVisible().catch(() => false)
    }

    await shot(page, 'kp-open')

    const tabBar = page.locator('.tab-bar, .tab-btn')
    const explainTab = page.locator('.tab-btn').filter({ hasText: /讲解|AI/ }).first()
    const tabVisible = (await tabBar.count()) > 0
    log(
      'open-knowledge-point',
      detailVisible && tabVisible,
      `detail=${detailVisible} tabs=${tabVisible} via=${openVia}`,
    )
    if (!detailVisible) throw new Error('detail panel not visible')

    // Ensure explain tab
    if (await explainTab.count()) {
      await explainTab.click().catch(() => {})
    }
    await page.waitForTimeout(200)
    const chatVisible = await page.locator('.ai-chat').isVisible().catch(() => false)
    log('explain-tab-visible', chatVisible, chatVisible ? 'ai-chat ok' : 'ai-chat missing')
    if (!chatVisible) throw new Error('explain/ai-chat not visible')

    // Next-step bar regression (ISSUE-05)
    const nextBar = page.locator('.next-step-bar')
    const nextBarOk = await nextBar.isVisible().catch(() => false)
    log('next-step-bar', nextBarOk, nextBarOk ? '当前建议 visible' : 'missing (non-blocking for core smoke)')

    // Start teaching
    const startBtn = page.locator('button').filter({ hasText: /开始 AI 教学|继续教学/ }).first()
    await startBtn.click({ timeout: 8000 })
    log('click-start-teaching', true)

    await page.waitForSelector('.message, .message-content', { timeout: 15000 })
    let msgCount = await page.locator('.message').count()
    await shot(page, 'teaching-started')
    log('teaching-message', msgCount > 0, `messages=${msgCount} aiHits=${aiHits}`)
    if (msgCount <= 0) throw new Error('no teaching message after start')

    // Prefer quick action (ISSUE-01/03)
    const quick = page.locator('.quick-btn, .quick-actions button').filter({ hasText: /再说短一点/ }).first()
    let usedQuick = false
    if ((await quick.count()) && (await quick.isVisible().catch(() => false))) {
      const before = msgCount
      await quick.click()
      usedQuick = true
      log('click-quick-action', true, '再说短一点')
      await page.waitForFunction(
        (n) => document.querySelectorAll('.message').length > n,
        before,
        { timeout: 15000 },
      )
      msgCount = await page.locator('.message').count()
      log('quick-action-response', msgCount > before, `messages=${msgCount}`)
    } else {
      // Fallback: send a chat reply
      const input = page.locator('.chat-input').first()
      await input.fill('我的理解：ref 管基础类型，reactive 管对象。')
      const send = page.locator('button').filter({ hasText: /^发送$/ }).first()
      const before = msgCount
      await send.click()
      log('send-chat', true, 'fallback send')
      await page.waitForFunction(
        (n) => document.querySelectorAll('.message').length > n,
        before,
        { timeout: 15000 },
      )
      msgCount = await page.locator('.message').count()
      log('chat-response', msgCount > before, `messages=${msgCount}`)
    }

    await shot(page, 'after-interact')
    log(
      'smoke-core-passed',
      aiHits >= 1 && msgCount >= 2,
      `aiHits=${aiHits} messages=${msgCount} quick=${usedQuick}`,
    )

    if (pageErrors.length) {
      log('page-errors', false, pageErrors.slice(0, 3).join(' | '))
    } else {
      log('page-errors', true, 'none')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log('fatal', false, msg)
    try {
      await shot(page, 'fatal')
    } catch {}
  }

  const report = writeReport()
  console.log('==== SUMMARY ====')
  console.log(
    JSON.stringify(
      {
        okCount: report.okCount,
        failCount: report.failCount,
        aiHits: report.aiHits,
        report: REPORT,
        screenshots: OUT_DIR,
        failedSteps: report.steps.filter((s) => !s.ok).map((s) => s.step),
      },
      null,
      2,
    ),
  )

  await browser.close()
  if (serverChild) {
    try {
      serverChild.kill('SIGTERM')
    } catch {}
  }

  // Core steps that must pass (next-step-bar is soft)
  const required = [
    'enter-existing-project',
    'open-knowledge-point',
    'explain-tab-visible',
    'teaching-message',
  ]
  const requiredFailed = report.steps.filter((s) => required.includes(s.step) && !s.ok)
  const hardFail = report.failCount > 0 && (
    requiredFailed.length > 0 ||
    report.steps.some((s) => s.step === 'fatal' && !s.ok) ||
    report.steps.some((s) => s.step === 'smoke-core-passed' && !s.ok)
  )
  // If only soft checks failed (next-step-bar), still exit 0? Prefer strict: any FAIL except next-step-bar fails.
  const soft = new Set(['next-step-bar'])
  const hardFails = report.steps.filter((s) => !s.ok && !soft.has(s.step))
  process.exit(hardFails.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
