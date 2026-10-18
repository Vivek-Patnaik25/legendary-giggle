import { chromium } from 'playwright';
import { buildApp } from '../src/server/app.js';
import { resetDbForTesting } from '../src/server/db/index.js';

async function testThemeToggle() {
  console.log('Testing Dark Mode Toggle with Playwright...');
  resetDbForTesting(':memory:');
  const app = buildApp({ dbPath: ':memory:', enableLogging: false });
  const address = await app.listen({ port: 0, host: '127.0.0.1' });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(address, { waitUntil: 'networkidle' });

    // Initial state: Light mode
    const lightBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    const lightHtmlClass = await page.evaluate(() => document.documentElement.className);
    console.log(`Initial light mode body background: ${lightBg}, html class: "${lightHtmlClass}"`);

    // Click toggle button
    const toggleBtn = page.locator('button[aria-label="Toggle color theme"]');
    await toggleBtn.click();
    await page.waitForTimeout(300);

    // Assert Dark mode
    const darkBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    const darkHtmlClass = await page.evaluate(() => document.documentElement.className);
    console.log(`After toggle dark mode body background: ${darkBg}, html class: "${darkHtmlClass}"`);

    if (darkBg === lightBg) {
      throw new Error(`Dark mode failed to change body background color! Still ${lightBg}`);
    }

    if (!darkHtmlClass.includes('dark')) {
      throw new Error(`document.documentElement missing 'dark' class! Got: "${darkHtmlClass}"`);
    }

    // Toggle back to Light mode
    await toggleBtn.click();
    await page.waitForTimeout(300);
    const restoredBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    console.log(`Restored light mode body background: ${restoredBg}`);

    if (restoredBg !== lightBg) {
      throw new Error(`Failed to restore light background: got ${restoredBg}, expected ${lightBg}`);
    }

    console.log('✓ PASS: Dark mode toggle cleanly changes body background color and html class.');
  } finally {
    await browser.close();
    await app.close();
  }
}

testThemeToggle().catch((err) => {
  console.error('❌ Dark Mode Test Failed:', err);
  process.exit(1);
});
