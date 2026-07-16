# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\app.test.ts >> AI Learning OS - Full Feature Test >> start learning -> KnowledgeTreeView
- Location: tests\app.test.ts:31:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('button:has-text("开始学习")').first()
    - locator resolved to <button disabled data-v-25547efb="" class="submit-btn">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    55 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { chromium } from 'playwright';
  3  | 
  4  | test.describe('AI Learning OS - Full Feature Test', () => {
  5  |   let browser, page;
  6  | 
  7  |   test.beforeAll(async () => {
  8  |     browser = await chromium.launch({ headless: true });
  9  |   });
  10 | 
  11 |   test.afterAll(async () => {
  12 |     await browser.close();
  13 |   });
  14 | 
  15 |   test('home page renders correctly', async () => {
  16 |     page = await browser.newPage();
  17 |     await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  18 |     await page.waitForSelector('#app', { timeout: 10000 });
  19 |     await page.screenshot({ path: './screenshots/01-home.png', fullPage: true });
  20 |     
  21 |     const body = await page.evaluate(() => document.body.innerText);
  22 |     console.log('=== HOME PAGE ===\n', body.slice(0, 1500));
  23 |     
  24 |     expect(body).toContain('AI Learning OS');
  25 |     expect(body).toContain('开始学习');
  26 |     expect(body).toContain('智能知识图谱');
  27 |     expect(body).toContain('AI 私人老师');
  28 |     await page.close();
  29 |   });
  30 | 
  31 |   test('start learning -> KnowledgeTreeView', async () => {
  32 |     page = await browser.newPage();
  33 |     await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  34 |     
  35 |     // Click "开始学习"
  36 |     const btn = page.locator('button:has-text("开始学习")').first();
> 37 |     await btn.click();
     |               ^ Error: locator.click: Target page, context or browser has been closed
  38 |     await page.waitForLoadState('networkidle');
  39 |     await page.waitForTimeout(1500);
  40 |     await page.screenshot({ path: './screenshots/02-knowledge-tree.png', fullPage: true });
  41 |     
  42 |     const body = await page.evaluate(() => document.body.innerText);
  43 |     console.log('=== KNOWLEDGE TREE ===\n', body.slice(0, 1500));
  44 |     
  45 |     // Should show knowledge tree content
  46 |     expect(body).toContain('知识树');
  47 |     await page.close();
  48 |   });
  49 | 
  50 |   test('projects page', async () => {
  51 |     page = await browser.newPage();
  52 |     await page.goto('http://localhost:5174/projects', { waitUntil: 'networkidle' });
  53 |     await page.waitForTimeout(1000);
  54 |     await page.screenshot({ path: './screenshots/03-projects.png', fullPage: true });
  55 |     
  56 |     const body = await page.evaluate(() => document.body.innerText);
  57 |     console.log('=== PROJECTS PAGE ===\n', body.slice(0, 1500));
  58 |     expect(body).toBeTruthy();
  59 |     await page.close();
  60 |   });
  61 | 
  62 |   test('learn with a path ID', async () => {
  63 |     page = await browser.newPage();
  64 |     await page.goto('http://localhost:5174/learn/default-path', { waitUntil: 'networkidle' });
  65 |     await page.waitForTimeout(1500);
  66 |     await page.screenshot({ path: './screenshots/04-learn-path.png', fullPage: true });
  67 |     
  68 |     const body = await page.evaluate(() => document.body.innerText);
  69 |     console.log('=== LEARN PATH ===\n', body.slice(0, 1500));
  70 |     await page.close();
  71 |   });
  72 | 
  73 |   test('check console errors on all routes', async () => {
  74 |     const errors = [];
  75 |     page = await browser.newPage();
  76 |     page.on('console', msg => {
  77 |       if (msg.type() === 'error') errors.push(`${msg.type()}: ${msg.text()}`);
  78 |     });
  79 |     
  80 |     await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  81 |     await page.waitForTimeout(1000);
  82 |     
  83 |     await page.goto('http://localhost:5174/projects', { waitUntil: 'networkidle' });
  84 |     await page.waitForTimeout(1000);
  85 |     
  86 |     await page.goto('http://localhost:5174/learn/default-path', { waitUntil: 'networkidle' });
  87 |     await page.waitForTimeout(1000);
  88 |     
  89 |     if (errors.length > 0) {
  90 |       console.log('CONSOLE ERRORS:', errors);
  91 |     } else {
  92 |       console.log('No console errors on any route.');
  93 |     }
  94 |     await page.close();
  95 |   });
  96 | });
  97 | 
```