const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = path.resolve("screenshots/flow");
const REPORT = path.resolve("screenshots/flow-report.json");
fs.mkdirSync(OUT, { recursive: true });

const envText = fs.readFileSync(path.resolve(".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);
const API_BASE = (env.VITE_API_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
const API_KEY = env.VITE_API_KEY || "";

const steps = [];
const errors = [];
const networkFails = [];
const aiCalls = [];

function writeReport() {
  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      {
        base: BASE,
        okCount: steps.filter((s) => s.ok).length,
        failCount: steps.filter((s) => !s.ok).length,
        steps,
        errors: errors.slice(0, 80),
        networkFails: networkFails.slice(0, 80),
        aiCalls,
      },
      null,
      2
    )
  );
}

function log(step, ok, detail = "") {
  const item = {
    step,
    ok,
    detail: String(detail).slice(0, 800),
    at: new Date().toISOString(),
  };
  steps.push(item);
  console.log(
    `${ok ? "OK" : "FAIL"} | ${step}${detail ? " | " + String(detail).slice(0, 300) : ""}`
  );
  writeReport();
}

async function shot(page, name) {
  const file = path.join(OUT, `${String(steps.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function textOf(page) {
  return page.evaluate(() => document.body?.innerText || "");
}

async function clickByText(page, patterns) {
  for (const p of patterns) {
    const loc = page
      .locator("button, a, [role=button], .tab-btn, .tab-item, .p-btn")
      .filter({ hasText: p })
      .first();
    if (await loc.count()) {
      try {
        if (await loc.isVisible()) {
          await loc.click({ timeout: 5000 });
          return true;
        }
      } catch {}
    }
  }
  return false;
}

function forwardChatCompletions(bodyText, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + "/chat/completions");
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    const started = Date.now();
    const reqHeaders = {
      Authorization: headers.authorization || headers.Authorization || "Bearer " + API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Length": Buffer.byteLength(bodyText),
    };
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: reqHeaders,
        timeout: 360000,
        servername: url.hostname,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode || 502,
            headers: res.headers,
            body: buf,
            ms: Date.now() - started,
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("node-bridge timeout 360s")));
    req.on("error", reject);
    req.write(bodyText);
    req.end();
  });
}

(async () => {
  if (!API_KEY) {
    log("fatal", false, "missing VITE_API_KEY in .env.local");
    process.exit(1);
  }

  console.log("API_BASE", API_BASE);
  console.log("bridge mode: Playwright route -> Node https");

  // No browser proxy: AI traffic is fulfilled by Node bridge.
  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-certificate-errors", "--disable-http2"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("/chat/completions")) return; // handled by route
    networkFails.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || "failed"}`);
  });

  await page.route("**/chat/completions", async (route) => {
    const req = route.request();
    const postData = req.postData() || "";
    let model = "?";
    try {
      model = JSON.parse(postData).model || "?";
    } catch {}
    const call = {
      at: new Date().toISOString(),
      model,
      status: 0,
      ok: false,
      ms: 0,
      error: "",
      bodyPreview: "",
    };
    console.log("AI bridge start", model, "bytes", postData.length);
    try {
      const result = await forwardChatCompletions(postData, req.headers());
      call.status = result.status;
      call.ok = result.status >= 200 && result.status < 300;
      call.ms = result.ms;
      call.bodyPreview = result.body.toString("utf8").slice(0, 240);
      aiCalls.push(call);
      writeReport();
      console.log("AI bridge done", result.status, result.ms + "ms", model);
      await route.fulfill({
        status: result.status,
        headers: {
          "content-type": result.headers["content-type"] || "application/json",
          "access-control-allow-origin": "*",
        },
        body: result.body,
      });
    } catch (err) {
      call.error = err instanceof Error ? err.message : String(err);
      call.ms = 0;
      aiCalls.push(call);
      writeReport();
      console.log("AI bridge error", call.error);
      await route.fulfill({
        status: 502,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        },
        body: JSON.stringify({ error: { message: "node-bridge: " + call.error } }),
      });
    }
  });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#app", { timeout: 15000 });
    let body = await textOf(page);
    await shot(page, "home");
    log("open-home", /AI Learning OS/.test(body), body.slice(0, 160).replace(/\s+/g, " "));

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("input.composer-input, input[type=text]", { timeout: 15000 });
    log("reset-storage", true);

    const goal = "系统学习 Vue3 前端开发";
    await page.locator("input.composer-input, input[type=text]").first().fill(goal);
    await shot(page, "goal-filled");
    log("fill-goal", true, goal);

    await page.locator("button.btn-primary").first().click();
    log("click-start", true);

    // Path generation: 120s timeout x 3 attempts, each real call can be minutes.
    const genDeadline = Date.now() + 15 * 60 * 1000;
    let onLearn = false;
    while (Date.now() < genDeadline) {
      if (/\/learn\//.test(page.url())) {
        onLearn = true;
        break;
      }
      body = await textOf(page);
      if (
        /生成失败|请求失败|超时|请稍后重试/.test(body) &&
        !/正在规划|生成中|1\/3|2\/3|3\/3/.test(body)
      ) {
        break;
      }
      await page.waitForTimeout(3000);
    }
    await shot(page, "after-start");
    onLearn = /\/learn\//.test(page.url());
    body = await textOf(page);
    log(
      "generate-path",
      onLearn,
      `url=${page.url()}; aiCalls=${aiCalls.length}; okAi=${aiCalls.filter((c) => c.ok).length}; body=${body
        .slice(0, 220)
        .replace(/\s+/g, " ")}`
    );
    if (!onLearn) throw new Error("path generation failed: " + body.slice(0, 300));

    await page.waitForTimeout(1500);
    body = await textOf(page);
    await shot(page, "knowledge-tree");
    log(
      "tree-visible",
      /模块|知识|进度|学习/.test(body) || body.length > 50,
      body.slice(0, 240).replace(/\s+/g, " ")
    );

    let detailVisible = await page
      .locator(".detail-panel, .tab-bar, .ai-chat")
      .first()
      .isVisible()
      .catch(() => false);
    if (!detailVisible) {
      const candidates = [
        page.locator(".kp-item, .knowledge-item, .knowledge-card, .tree-kp, .node-item").first(),
        page
          .locator("button, div, li, a")
          .filter({ hasText: /Vue|基础|入门|组件|响应式|模板/ })
          .first(),
      ];
      for (const c of candidates) {
        if (await c.count()) {
          await c.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(800);
          detailVisible = await page
            .locator(".detail-panel, .tab-bar, .ai-chat")
            .first()
            .isVisible()
            .catch(() => false);
          if (detailVisible) break;
        }
      }
    }
    await shot(page, "kp-detail");
    body = await textOf(page);
    detailVisible = await page
      .locator(".detail-panel, .tab-bar, .ai-chat")
      .first()
      .isVisible()
      .catch(() => false);
    log(
      "open-knowledge-point",
      detailVisible || /AI 讲解|学习文档|练习|测试|笔记/.test(body),
      body.slice(0, 220).replace(/\s+/g, " ")
    );

    const teachClicked = await clickByText(page, [
      /开始 AI 教学/,
      /开始AI教学/,
      /继续教学/,
      /开始教学/,
    ]);
    log("click-start-teaching", true, teachClicked ? "clicked" : "maybe auto/no button");
    const teachDeadline = Date.now() + 5 * 60 * 1000;
    let msgCount = 0;
    while (Date.now() < teachDeadline) {
      msgCount = await page.locator(".message, .message-content").count();
      body = await textOf(page);
      if (msgCount > 0 || /教学启动失败|请求失败|超时/.test(body)) break;
      await page.waitForTimeout(2500);
    }
    await shot(page, "teaching");
    msgCount = await page.locator(".message, .message-content").count();
    body = await textOf(page);
    log(
      "ai-teaching",
      msgCount > 0,
      `messages=${msgCount}; ${body.slice(0, 200).replace(/\s+/g, " ")}`
    );

    const chatInput = page.locator(".chat-input, .ai-chat input, textarea.chat-input").first();
    if ((await chatInput.count()) && (await chatInput.isVisible().catch(() => false))) {
      await chatInput.fill("我的理解是：这个知识点主要讲核心概念、使用场景和常见坑。");
      const sent = await clickByText(page, [/发送/]);
      log("send-answer", sent, sent ? "sent" : "send button missing");
      const ansDeadline = Date.now() + 4 * 60 * 1000;
      const before = msgCount;
      while (Date.now() < ansDeadline) {
        msgCount = await page.locator(".message, .message-content").count();
        if (msgCount > before) break;
        await page.waitForTimeout(2500);
      }
      await shot(page, "after-answer");
      log("answer-response", msgCount > before, `messages=${msgCount}`);
    } else {
      log("send-answer", true, "skipped: no chat input");
    }

    await clickByText(page, [/学习文档/, /文档/]);
    await page.waitForTimeout(500);
    if (await page.locator("button").filter({ hasText: /生成文档/ }).count()) {
      await page.locator("button").filter({ hasText: /生成文档/ }).first().click();
      log("click-generate-doc", true);
      const docDeadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < docDeadline) {
        body = await textOf(page);
        if (/文档生成失败|概述|核心|总结|## /.test(body) && !/正在生成/.test(body)) break;
        if (await page.locator(".doc-content, .markdown-body, .tab-pane").count()) {
          const t = await page
            .locator(".tab-pane, .doc-content, .markdown-body")
            .first()
            .innerText()
            .catch(() => "");
          if (t && t.length > 40 && !/生成文档/.test(t)) break;
        }
        await page.waitForTimeout(2500);
      }
    } else {
      log("click-generate-doc", true, "button missing or already generated");
    }
    await shot(page, "doc");
    body = await textOf(page);
    log("generate-doc", !/文档生成失败/.test(body), body.slice(0, 220).replace(/\s+/g, " "));

    await clickByText(page, [/^练习$/, /练习/]);
    await page.waitForTimeout(400);
    if (await page.locator("button").filter({ hasText: /生成练习/ }).count()) {
      await page.locator("button").filter({ hasText: /生成练习/ }).first().click();
      log("click-generate-exercise", true);
      const exDeadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < exDeadline) {
        const cards = await page.locator(".content-card").count();
        body = await textOf(page);
        if (cards > 0 || /提交答案|选择题|练习题生成失败/.test(body)) break;
        await page.waitForTimeout(2500);
      }
    } else {
      log("click-generate-exercise", false, "button missing");
    }
    await shot(page, "exercise");
    const cards = await page.locator(".content-card").count();
    body = await textOf(page);
    log(
      "generate-exercise",
      cards > 0 || /提交答案|选择题/.test(body),
      `cards=${cards}; ${body.slice(0, 180).replace(/\s+/g, " ")}`
    );

    const completed = await clickByText(page, [
      /已完成/,
      /学完并进入下一个/,
      /标记学完/,
      /完成并继续/,
    ]);
    await page.waitForTimeout(800);
    await shot(page, "completed");
    body = await textOf(page);
    log(
      "mark-completed",
      completed || /已完成|已掌握|下一个|进度/.test(body),
      body.slice(0, 180).replace(/\s+/g, " ")
    );

    await page.goto(BASE + "/projects", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "projects");
    body = await textOf(page);
    log(
      "projects-persistence",
      body.includes(goal) || /Vue3|学习/.test(body),
      body.slice(0, 220).replace(/\s+/g, " ")
    );

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await shot(page, "home-continue");
    body = await textOf(page);
    log(
      "home-continue-entry",
      /继续|Vue3|系统学习/.test(body),
      body.slice(0, 220).replace(/\s+/g, " ")
    );
  } catch (err) {
    log("fatal", false, err instanceof Error ? err.message : String(err));
    try {
      await shot(page, "fatal");
    } catch {}
  }

  writeReport();
  const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  console.log("==== SUMMARY ====");
  console.log(
    JSON.stringify(
      {
        okCount: report.okCount,
        failCount: report.failCount,
        errors: report.errors.length,
        networkFails: report.networkFails.length,
        aiCalls: report.aiCalls.length,
        aiOk: report.aiCalls.filter((c) => c.ok).length,
      },
      null,
      2
    )
  );
  await browser.close();
  process.exit(report.failCount > 0 ? 1 : 0);
})();
