import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { buildApp } from '../src/server/app.js';
import { resetDbForTesting } from '../src/server/db/index.js';
import path from 'path';
import fs from 'fs';
import { performance } from 'perf_hooks';

async function main() {
  console.log('=== Starting Pantry Rescue Acceptance Checks ===\n');

  // Ensure screenshots directory exists
  const screensDir = path.resolve(process.cwd(), 'docs/screens');
  fs.mkdirSync(screensDir, { recursive: true });

  // 1. Initialize test database with rich mock pantry items
  const testDb = resetDbForTesting(':memory:');
  
  // Start server on an ephemeral port
  const app = buildApp({ dbPath: ':memory:', enableLogging: false });
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = address;
  console.log(`✓ Test server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ----------------------------------------------------
    // CHECK 1: Time-to-first-use (< 60s, cold state)
    // ----------------------------------------------------
    console.log('\n--- Running Check 1: Time-to-first-use (cold state) ---');
    const coldContext = await browser.newContext();
    const coldPage = await coldContext.newPage();

    const startTime = performance.now();
    await coldPage.goto(baseUrl, { waitUntil: 'networkidle' });

    // Verify instant guest onboarding loaded without registration wall
    await coldPage.waitForSelector('text=Pantry Rescue', { timeout: 10000 });

    // Open Add Item modal
    const addBtn = coldPage.locator('button:has-text("Add"), button[aria-label="Add item"]').first();
    await addBtn.click();
    await coldPage.waitForSelector('text=Quick Presets');

    // Click a preset (e.g., Baby Spinach)
    const presetBtn = coldPage.locator('button:has-text("Baby Spinach")');
    await presetBtn.click();

    // Confirm addition
    const submitBtn = coldPage.locator('button:has-text("Add to Fridge")');
    await submitBtn.click();

    // Wait for item to appear on screen
    await coldPage.waitForSelector('text=Baby Spinach', { timeout: 5000 });

    // Click "Use" on Baby Spinach to perform first rescue
    const useBtn = coldPage.locator('button[aria-label*="Use Baby Spinach"], button:has-text("Use")').first();
    await useBtn.click();

    // Verify immediate feedback popover appears
    await coldPage.waitForSelector('text=Saved!', { timeout: 5000 });

    const elapsedMs = performance.now() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);
    console.log(`✓ Time-to-first-use completed in ${elapsedSec}s (Target: < 60s)`);

    if (elapsedMs >= 60000) {
      throw new Error(`Time to first use exceeded 60s: ${elapsedSec}s`);
    }
    const sessionCookies = await coldContext.cookies();
    await coldContext.close();

    // ----------------------------------------------------
    // Seed items & activity for rich screenshot capture
    // ----------------------------------------------------
    console.log('\n--- Seeding items for complete flow capture ---');
    const session = testDb.prepare('SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 1').get() as { user_id: string };
    const member = testDb.prepare('SELECT household_id FROM members WHERE user_id = ?').get(session.user_id) as { household_id: string };
    const guestUser = { id: session.user_id };
    const household = { id: member.household_id };

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const insertStmt = testDb.prepare(`
      INSERT INTO items (id, household_id, name, category, location, current_quantity, initial_quantity, unit, expiry_date, status, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'), datetime('now'))
    `);

    insertStmt.run('item-1', household.id, 'Greek Yogurt', 'dairy', 'fridge', 1, 1, 'piece', todayStr, guestUser.id);
    insertStmt.run('item-2', household.id, 'Bell Pepper', 'produce', 'fridge', 2, 2, 'piece', tomorrow, guestUser.id);
    insertStmt.run('item-3', household.id, 'Brown Onion', 'produce', 'pantry', 3, 3, 'piece', inThreeDays, guestUser.id);
    insertStmt.run('item-4', household.id, 'Fresh Milk', 'dairy', 'fridge', 1, 1, 'l', inSevenDays, guestUser.id);
    insertStmt.run('item-5', household.id, 'Chicken Breast', 'meat', 'freezer', 500, 500, 'g', inSevenDays, guestUser.id);

    // Record some rescues for the scoreboard & weekly report
    testDb.prepare(`
      INSERT INTO scoreboard_events (id, household_id, user_id, event_type, item_id, quantity, unit, date, created_at)
      VALUES (?, ?, ?, 'rescued', 'item-1', 1, 'piece', date('now', '-2 days'), datetime('now', '-2 days'))
    `).run('evt-1', household.id, guestUser.id);

    testDb.prepare(`
      INSERT INTO scoreboard_events (id, household_id, user_id, event_type, item_id, quantity, unit, date, created_at)
      VALUES (?, ?, ?, 'rescued', 'item-2', 1, 'piece', date('now', '-1 day'), datetime('now', '-1 day'))
    `).run('evt-2', household.id, guestUser.id);

    // Unlock an achievement badge
    testDb.prepare(`
      INSERT OR IGNORE INTO badges (id, household_id, badge_key, metadata, unlocked_at)
      VALUES ('b-1', ?, 'onion_survivor', '{}', datetime('now'))
    `).run(household.id);

    // ----------------------------------------------------
    // CHECK 2: Full-Flow Screenshot Capture (Light + Dark, 375px + 1280px)
    // ----------------------------------------------------
    console.log('\n--- Running Check 2: Screenshot Capture (docs/screens/) ---');

    const viewports = [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'mobile', width: 375, height: 812 },
    ];

    const themes = ['light', 'dark'];

    for (const theme of themes) {
      for (const vp of viewports) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        await ctx.addCookies(sessionCookies);
        const page = await ctx.newPage();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });

        // Set theme
        await page.evaluate((t) => {
          if (t === 'dark') {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
          }
        }, theme);
        await page.waitForTimeout(300);

        // 1. Capture Today View
        await page.screenshot({ path: path.join(screensDir, `${vp.name}-${theme}-today.png`), fullPage: false });
        console.log(`  ✓ Saved ${vp.name}-${theme}-today.png`);

        // 2. Capture Fridge View
        if (vp.name === 'mobile') {
          await page.locator('nav[aria-label="Mobile navigation"] button:has-text("Fridge")').click();
        } else {
          await page.locator('header nav button:has-text("Fridge")').click();
        }
        await page.waitForSelector('text=Greek Yogurt');
        await page.screenshot({ path: path.join(screensDir, `${vp.name}-${theme}-fridge.png`), fullPage: false });
        console.log(`  ✓ Saved ${vp.name}-${theme}-fridge.png`);

        // 3. Capture Wins View
        if (vp.name === 'mobile') {
          await page.locator('nav[aria-label="Mobile navigation"] button:has-text("Wins")').click();
        } else {
          await page.locator('header nav button:has-text("Wins")').click();
        }
        await page.waitForSelector('text=Wins & Milestones');
        await page.screenshot({ path: path.join(screensDir, `${vp.name}-${theme}-wins.png`), fullPage: false });
        console.log(`  ✓ Saved ${vp.name}-${theme}-wins.png`);

        // 4. Capture Weekly Report Modal (from Wins view)
        const reportBtn = page.locator('button:has-text("Weekly Report Card")');
        if (await reportBtn.isVisible()) {
          await reportBtn.click();
          await page.waitForSelector('text=Sir Expiry\'s dispatch');
          await page.screenshot({ path: path.join(screensDir, `${vp.name}-${theme}-modal-report.png`), fullPage: false });
          console.log(`  ✓ Saved ${vp.name}-${theme}-modal-report.png`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }

        // 5. Capture Add Item Modal
        const openAdd = page.locator('button[aria-label="Add item"]').first();
        if (await openAdd.isVisible()) {
          await openAdd.click();
          await page.waitForSelector('text=Quick Presets');
          await page.screenshot({ path: path.join(screensDir, `${vp.name}-${theme}-modal-add.png`), fullPage: false });
          console.log(`  ✓ Saved ${vp.name}-${theme}-modal-add.png`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }

        // 6. Capture Recipe Modal (go back to Today view)
        if (vp.name === 'mobile') {
          await page.locator('nav[aria-label="Mobile navigation"] button:has-text("Today")').click();
        } else {
          await page.locator('header nav button:has-text("Today")').click();
        }
        await page.waitForTimeout(300);

        const recipeCard = page.locator('button:has-text("Cook")').first();
        if (await recipeCard.isVisible()) {
          await recipeCard.click();
          await page.waitForSelector('text=Ingredients');
          await page.screenshot({ path: path.join(screensDir, `${vp.name}-${theme}-modal-recipe.png`), fullPage: false });
          console.log(`  ✓ Saved ${vp.name}-${theme}-modal-recipe.png`);
          await page.keyboard.press('Escape');
        }

        await ctx.close();
      }
    }

    // ----------------------------------------------------
    // CHECK 3: Automated Axe Accessibility Check (WCAG AA)
    // ----------------------------------------------------
    console.log('\n--- Running Check 3: Axe Accessibility Audit ---');
    const a11yContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await a11yContext.addCookies(sessionCookies);
    const a11yPage = await a11yContext.newPage();
    await a11yPage.goto(baseUrl, { waitUntil: 'networkidle' });

    // Check Today View
    const todayResults = await new AxeBuilder({ page: a11yPage }).analyze();
    const todayViolations = todayResults.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log(`  Today View violations (serious/critical): ${todayViolations.length}`);

    // Check Fridge View
    await a11yPage.locator('header nav button:has-text("Fridge")').click();
    await a11yPage.waitForSelector('text=Greek Yogurt');
    const fridgeResults = await new AxeBuilder({ page: a11yPage }).analyze();
    const fridgeViolations = fridgeResults.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log(`  Fridge View violations (serious/critical): ${fridgeViolations.length}`);

    // Check Wins View
    await a11yPage.locator('header nav button:has-text("Wins")').click();
    await a11yPage.waitForSelector('text=Wins & Milestones');
    const winsResults = await new AxeBuilder({ page: a11yPage }).analyze();
    const winsViolations = winsResults.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log(`  Wins View violations (serious/critical): ${winsViolations.length}`);

    const totalViolations = todayViolations.length + fridgeViolations.length + winsViolations.length;
    if (totalViolations > 0) {
      console.log('Today violations:', JSON.stringify(todayViolations, null, 2));
      throw new Error(`Accessibility violations found: ${totalViolations} serious/critical issues`);
    }
    console.log(`✓ Accessibility audit passed (0 serious or critical violations)`);
    await a11yContext.close();

    // ----------------------------------------------------
    // CHECK 4: Keyboard Navigation Test (Tab, Enter, Escape)
    // ----------------------------------------------------
    console.log('\n--- Running Check 4: Keyboard Navigation Test ---');
    const kbContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await kbContext.addCookies(sessionCookies);
    const kbPage = await kbContext.newPage();
    await kbPage.goto(baseUrl, { waitUntil: 'networkidle' });

    // Press Tab multiple times to focus through header until Add Item or Today action is focused
    let reachedAdd = false;
    for (let i = 0; i < 20; i++) {
      await kbPage.keyboard.press('Tab');
      const focusedText = await kbPage.evaluate(() => document.activeElement?.textContent || '');
      const ariaLabel = await kbPage.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
      if (focusedText.includes('Add') || ariaLabel.includes('Add item')) {
        reachedAdd = true;
        break;
      }
    }

    // Press Enter to open Add Item Modal
    await kbPage.keyboard.press('Enter');
    await kbPage.waitForSelector('text=Quick Presets', { timeout: 3000 });
    console.log('  ✓ Modal opened via keyboard Enter');

    // Press Escape to dismiss modal
    await kbPage.keyboard.press('Escape');
    await kbPage.waitForTimeout(300);
    const modalVisible = await kbPage.locator('text=Quick Presets').isVisible();
    if (modalVisible) {
      throw new Error('Modal did not close on Escape key');
    }
    console.log('  ✓ Modal closed via keyboard Escape');
    console.log('✓ Keyboard navigation passed');
    await kbContext.close();

    // ----------------------------------------------------
    // CHECK 5: DOM Entity Scan (No Double-Escaping)
    // ----------------------------------------------------
    console.log('\n--- Running Check 5: DOM Entity Scanner (no raw HTML entities) ---');
    const domContext = await browser.newContext();
    await domContext.addCookies(sessionCookies);
    const domPage = await domContext.newPage();
    await domPage.goto(baseUrl, { waitUntil: 'networkidle' });

    const entityMatches = await domPage.evaluate(() => {
      const rawHtml = document.body.innerHTML;
      // Scan visible text nodes
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const violations: string[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent || '';
        if (text.includes('&amp;') || text.includes('&quot;') || text.includes('&#39;') || text.includes('&lt;') || text.includes('&gt;')) {
          violations.push(text.trim());
        }
      }
      return violations;
    });

    if (entityMatches.length > 0) {
      throw new Error(`Double-escaping found in rendered DOM text: ${JSON.stringify(entityMatches)}`);
    }
    console.log('✓ DOM entity scanner passed (0 double-escaped entities found in rendered DOM)');
    await domContext.close();

    console.log('\n=== ALL 5 ACCEPTANCE CHECKS PASSED SUCCESSFULLY ===\n');
  } finally {
    await browser.close();
    await app.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Acceptance Check Failure:', err);
  process.exit(1);
});
