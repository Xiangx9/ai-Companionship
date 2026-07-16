import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('AI Learning OS - Full Feature Test', () => {
  let browser, page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test('home page renders correctly', async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.waitForSelector('#app', { timeout: 10000 });
    await page.screenshot({ path: './screenshots/01-home.png', fullPage: true });
    
    const body = await page.evaluate(() => document.body.innerText);
    console.log('=== HOME PAGE ===\n', body.slice(0, 1500));
    
    expect(body).toContain('AI Learning OS');
    expect(body).toContain('开始学习');
    expect(body).toContain('智能知识图谱');
    expect(body).toContain('AI 私人老师');
    await page.close();
  });

  test('start learning -> KnowledgeTreeView', async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    
    // Click "开始学习"
    const btn = page.locator('button:has-text("开始学习")').first();
    await btn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: './screenshots/02-knowledge-tree.png', fullPage: true });
    
    const body = await page.evaluate(() => document.body.innerText);
    console.log('=== KNOWLEDGE TREE ===\n', body.slice(0, 1500));
    
    // Should show knowledge tree content
    expect(body).toContain('知识树');
    await page.close();
  });

  test('projects page', async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:5174/projects', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: './screenshots/03-projects.png', fullPage: true });
    
    const body = await page.evaluate(() => document.body.innerText);
    console.log('=== PROJECTS PAGE ===\n', body.slice(0, 1500));
    expect(body).toBeTruthy();
    await page.close();
  });

  test('learn with a path ID', async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:5174/learn/default-path', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: './screenshots/04-learn-path.png', fullPage: true });
    
    const body = await page.evaluate(() => document.body.innerText);
    console.log('=== LEARN PATH ===\n', body.slice(0, 1500));
    await page.close();
  });

  test('check console errors on all routes', async () => {
    const errors = [];
    page = await browser.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`${msg.type()}: ${msg.text()}`);
    });
    
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    await page.goto('http://localhost:5174/projects', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    await page.goto('http://localhost:5174/learn/default-path', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    if (errors.length > 0) {
      console.log('CONSOLE ERRORS:', errors);
    } else {
      console.log('No console errors on any route.');
    }
    await page.close();
  });
});
