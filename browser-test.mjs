import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push('[' + msg.type() + '] ' + msg.text());
    }
  });
  
  console.log('=== Opening home page ===');
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'browser-home.png', fullPage: true });
  console.log('Screenshot saved: browser-home.png');
  
  const title = await page.title();
  console.log('Page title: ' + title);
  
  const content = await page.evaluate(() => {
    return {
      bodyText: document.body ? document.body.innerText.substring(0, 500) : '',
      links: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent?.trim(), href: a.href })),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()),
      inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({ type: i.type, placeholder: i.placeholder })),
    };
  });
  
  console.log('Body text:', content.bodyText);
  console.log('Buttons:', content.buttons);
  console.log('Inputs:', content.inputs);
  
  if (errors.length > 0) {
    console.log('Console errors:', errors);
  } else {
    console.log('No console errors.');
  }
  
  const inputEl = await page.input, textarea;
  if (inputEl) {
    console.log('Testing input field...');
    await inputEl.fill('Python编程基础');
    await page.screenshot({ path: 'browser-input-filled.png', fullPage: true });
    
    const submitBtn = await page.button, [role=\"button\"];
    if (submitBtn) {
      console.log('Clicking button...');
      await submitBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'browser-after-click.png', fullPage: true });
    }
  }
  
  console.log('Navigating to /projects...');
  await page.goto('http://localhost:5174/projects', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'browser-projects.png', fullPage: true });
  
  const projContent = await page.evaluate(() => {
    return {
      bodyText: document.body ? document.body.innerText.substring(0, 500) : '',
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()),
    };
  });
  console.log('Projects page text:', projContent.bodyText);
  console.log('Projects buttons:', projContent.buttons);
  
  await browser.close();
  console.log('Done!');
})();