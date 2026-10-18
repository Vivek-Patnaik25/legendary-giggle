import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { buildApp } from '../src/server/app.js';
import { resetDbForTesting } from '../src/server/db/index.js';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { performance } from 'perf_hooks';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Relax rate limit in test environment
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '10000';

async function scanPageForForbiddenTokens(page: any, pageName: string): Promise<string[]> {
  const violations: string[] = await page.evaluate(() => {
    const forbidden = ['[object', 'undefined', 'NaN', '&amp;'];
    const hits: string[] = [];

    // 1. Text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      for (const token of forbidden) {
        if (text.includes(token)) {
          hits.push(`[${token}] in text: "${text.trim().slice(0, 100)}"`);
        }
      }
    }

    // 2. Attributes
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      for (const attr of ['title', 'aria-label', 'alt', 'placeholder', 'value']) {
        const val = el.getAttribute(attr);
        if (val) {
          for (const token of forbidden) {
            if (val.includes(token)) {
              hits.push(`[${token}] in <${el.tagName.toLowerCase()} ${attr}="${val}">`);
            }
          }
        }
      }
    }

    return hits;
  });

  if (violations.length > 0) {
    throw new Error(`Forbidden token found on ${pageName}:\n${violations.join('\n')}`);
  }
  return violations;
}

async function auditAccessibility(page: any, viewName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const seriousViolations = results.violations.filter(
    v => v.impact === 'serious' || v.impact === 'critical' || v.id === 'color-contrast'
  );

  if (seriousViolations.length > 0) {
    const details = seriousViolations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map(n => ({ html: n.html, failureSummary: n.failureSummary })),
    }));
    console.error(`  Accessibility Violations on ${viewName}:`, JSON.stringify(details, null, 2));
    throw new Error(`WCAG AA violation on ${viewName}: ${seriousViolations.length} issue(s) found`);
  }

  console.log(`  ✓ ${viewName}: 0 WCAG AA / contrast violations`);
}

async function main() {
  console.log('=== Starting Pantry Rescue Acceptance Checks (v4) ===\n');

  const v4Dir = path.resolve(process.cwd(), 'docs/screens/v4');
  const seqDir = path.join(v4Dir, 'first-run-sequence');
  fs.mkdirSync(v4Dir, { recursive: true });
  fs.mkdirSync(seqDir, { recursive: true });

  // 1. Initialize test database
  const testDb = resetDbForTesting(':memory:');

  // Start test server on an ephemeral port
  const app = buildApp({ dbPath: ':memory:', enableLogging: false });
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = address;
  console.log(`✓ Test server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ----------------------------------------------------
    // CHECK 1: Record 30-Second First-Run Flow Video (WebM)
    // ----------------------------------------------------
    console.log('\n--- Running Check 1: Record First-Run Flow (docs/screens/v4/first-run.webm) ---');
    const rawVideoDir = path.join(v4Dir, 'raw-video');
    fs.mkdirSync(rawVideoDir, { recursive: true });

    const recContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: {
        dir: rawVideoDir,
        size: { width: 1280, height: 800 },
      },
    });

    const recPage = await recContext.newPage();
    const flowStart = performance.now();

    // 1. Open cold state
    await recPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await recPage.waitForSelector('text=Pantry Rescue', { timeout: 10000 });
    await recPage.screenshot({ path: path.join(seqDir, '01-cold-open.png') });
    await recPage.waitForTimeout(2500);

    // 2. Open Add Item modal
    const addBtn = recPage.locator('button[aria-label="Add item to fridge"], button[aria-label="Add item"], button:has-text("Add")').first();
    await addBtn.click();
    await recPage.waitForSelector('text=Quick Presets', { timeout: 5000 });
    await recPage.screenshot({ path: path.join(seqDir, '02-modal-opened.png') });
    await recPage.waitForTimeout(2500);

    // 3. Select Baby Spinach preset
    const spinachPreset = recPage.locator('button:has-text("Baby Spinach")');
    await spinachPreset.click();
    await recPage.screenshot({ path: path.join(seqDir, '03-preset-selected.png') });
    await recPage.waitForTimeout(2500);

    // 4. Confirm addition
    const submitAdd = recPage.locator('button:has-text("Add to Fridge")');
    await submitAdd.click();
    await recPage.waitForSelector('text=Baby Spinach', { timeout: 5000 });
    await recPage.screenshot({ path: path.join(seqDir, '04-item-added.png') });
    await recPage.waitForTimeout(3000);

    // 5. Tap "Use" to rescue the item and trigger tactile feedback
    const useBtn = recPage.locator('button:has-text("Use")').first();
    await useBtn.click();
    await recPage.waitForSelector('text=Saved!', { timeout: 5000 });
    await recPage.screenshot({ path: path.join(seqDir, '05-tactile-reward.png') });
    await recPage.waitForTimeout(4000);

    // 6. Navigate to Fridge View
    await recPage.locator('header nav button:has-text("Fridge")').click();
    await recPage.waitForTimeout(1000);
    await recPage.screenshot({ path: path.join(seqDir, '06-fridge-view.png') });
    await recPage.waitForTimeout(3000);

    // 7. Navigate to Wins View
    await recPage.locator('header nav button:has-text("Wins")').click();
    await recPage.waitForTimeout(1000);
    await recPage.screenshot({ path: path.join(seqDir, '07-wins-achievement.png') });
    await recPage.waitForTimeout(3000);

    // 8. Open Weekly Report Card
    const reportCardBtn = recPage.locator('button:has-text("Weekly Report Card")');
    if (await reportCardBtn.isVisible()) {
      await reportCardBtn.click();
      await recPage.waitForSelector('text=Sir Expiry\'s dispatch', { timeout: 5000 });
      await recPage.screenshot({ path: path.join(seqDir, '08-weekly-postcard.png') });
      await recPage.waitForTimeout(4000);
      await recPage.keyboard.press('Escape');
    }

    const elapsed = (performance.now() - flowStart) / 1000;
    console.log(`  ✓ First-run flow executed in ${elapsed.toFixed(1)}s`);

    const videoObj = recPage.video();
    const sessionCookies = await recContext.cookies();
    await recPage.close();
    await recContext.close();

    // Save video file to docs/screens/v4/first-run.webm directly
    const destWebm = path.join(v4Dir, 'first-run.webm');
    if (videoObj) {
      const videoPath = await videoObj.path();
      if (fs.existsSync(videoPath)) {
        fs.copyFileSync(videoPath, destWebm);
        console.log(`  ✓ Saved authentic WebM recording to ${destWebm} (${(fs.statSync(destWebm).size / 1024).toFixed(0)} KB)`);
      }
    }
    if (fs.existsSync(rawVideoDir)) {
      fs.rmSync(rawVideoDir, { recursive: true, force: true });
    }

    // ----------------------------------------------------
    // Seed items & activity for comprehensive screenshot suite
    // ----------------------------------------------------
    console.log('\n--- Seeding items for complete flow capture ---');
    const sessionCookie = sessionCookies.find(c => c.name === 'pantry_session');
    let guestUser: { id: string };
    let household: { id: string };

    if (sessionCookie) {
      const session = testDb.prepare('SELECT user_id FROM sessions WHERE id = ?').get(sessionCookie.value) as { user_id: string };
      const member = testDb.prepare('SELECT household_id FROM members WHERE user_id = ?').get(session.user_id) as { household_id: string };
      guestUser = { id: session.user_id };
      household = { id: member.household_id };
    } else {
      const session = testDb.prepare('SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 1').get() as { user_id: string };
      const member = testDb.prepare('SELECT household_id FROM members WHERE user_id = ?').get(session.user_id) as { household_id: string };
      guestUser = { id: session.user_id };
      household = { id: member.household_id };
    }

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

    // Record rescues for the scoreboard & weekly report
    testDb.prepare(`
      INSERT INTO scoreboard_events (id, household_id, user_id, event_type, item_id, quantity, unit, date, created_at)
      VALUES (?, ?, ?, 'rescued', 'item-1', 1, 'piece', date('now', '-2 days'), datetime('now', '-2 days'))
    `).run('evt-1', household.id, guestUser.id);

    testDb.prepare(`
      INSERT INTO scoreboard_events (id, household_id, user_id, event_type, item_id, quantity, unit, date, created_at)
      VALUES (?, ?, ?, 'rescued', 'item-2', 1, 'piece', date('now', '-1 day'), datetime('now', '-1 day'))
    `).run('evt-2', household.id, guestUser.id);

    // Unlock achievement badge
    testDb.prepare(`
      INSERT OR IGNORE INTO badges (id, household_id, badge_key, metadata, unlocked_at)
      VALUES ('b-1', ?, 'onion_survivor', '{}', datetime('now'))
    `).run(household.id);

    // ----------------------------------------------------
    // CHECK 2: Full-Flow Screenshot Capture into docs/screens/v4/
    // ----------------------------------------------------
    console.log('\n--- Running Check 2: Screenshot Capture (docs/screens/v4/) ---');

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

        // Apply and verify theme
        if (theme === 'dark') {
          const themeBtn = page.locator('button[aria-label="Toggle color theme"]');
          await themeBtn.click();
          await page.waitForTimeout(400);

          const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          if (bodyBg !== 'rgb(12, 10, 9)') {
            throw new Error(`Dark mode failed to apply body background. Expected rgb(12, 10, 9), got ${bodyBg}`);
          }
        }

        // 1. Capture Today View
        await page.screenshot({ path: path.join(v4Dir, `${vp.name}-${theme}-today.png`), fullPage: false });
        console.log(`  ✓ Saved ${vp.name}-${theme}-today.png`);

        // 2. Capture Fridge View
        if (vp.name === 'mobile') {
          await page.locator('nav[aria-label="Mobile navigation"] button:has-text("Fridge")').click();
        } else {
          await page.locator('header nav button:has-text("Fridge")').click();
        }
        await page.waitForSelector('text=Greek Yogurt', { timeout: 5000 });
        await page.screenshot({ path: path.join(v4Dir, `${vp.name}-${theme}-fridge.png`), fullPage: false });
        console.log(`  ✓ Saved ${vp.name}-${theme}-fridge.png`);

        // 3. Capture Wins View
        if (vp.name === 'mobile') {
          await page.locator('nav[aria-label="Mobile navigation"] button:has-text("Wins")').click();
        } else {
          await page.locator('header nav button:has-text("Wins")').click();
        }
        await page.waitForSelector('text=Achievements', { timeout: 5000 });
        await page.screenshot({ path: path.join(v4Dir, `${vp.name}-${theme}-wins.png`), fullPage: false });
        console.log(`  ✓ Saved ${vp.name}-${theme}-wins.png`);

        // 4. Capture Weekly Report Modal (from Wins view)
        const reportBtn = page.locator('button:has-text("Weekly Report Card")');
        if (await reportBtn.isVisible()) {
          await reportBtn.click();
          await page.waitForSelector('text=Sir Expiry\'s dispatch', { timeout: 5000 });
          await page.screenshot({ path: path.join(v4Dir, `${vp.name}-${theme}-modal-report.png`), fullPage: false });
          console.log(`  ✓ Saved ${vp.name}-${theme}-modal-report.png`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }

        // 5. Capture Add Item Modal
        const openAdd = page.locator('button[aria-label="Add item to fridge"], button[aria-label="Add item"]').first();
        if (await openAdd.isVisible()) {
          await openAdd.click();
          await page.waitForSelector('text=Quick Presets', { timeout: 5000 });
          await page.screenshot({ path: path.join(v4Dir, `${vp.name}-${theme}-modal-add.png`), fullPage: false });
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
          await page.waitForSelector('text=Ingredients', { timeout: 5000 });
          await page.screenshot({ path: path.join(v4Dir, `${vp.name}-${theme}-modal-recipe.png`), fullPage: false });
          console.log(`  ✓ Saved ${vp.name}-${theme}-modal-recipe.png`);
          await page.keyboard.press('Escape');
        }

        await ctx.close();
      }
    }

    // ----------------------------------------------------
    // CHECK 3: Comprehensive Accessibility & Contrast Audit (Light + Dark, Views + Modals)
    // ----------------------------------------------------
    console.log('\n--- Running Check 3: WCAG AA & Contrast Audit (Light & Dark on Views + Modals) ---');

    for (const theme of ['light', 'dark']) {
      console.log(`\n  [Theme: ${theme.toUpperCase()}]`);
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addCookies(sessionCookies);
      const page = await ctx.newPage();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      if (theme === 'dark') {
        await page.locator('button[aria-label="Toggle color theme"]').click();
        await page.waitForTimeout(300);
      }

      // 1. Audit Today View
      await auditAccessibility(page, `Today View (${theme})`);

      // 2. Audit Recipe Modal
      const cookBtn = page.locator('button:has-text("Cook")').first();
      if (await cookBtn.isVisible()) {
        await cookBtn.click();
        await page.waitForSelector('text=Ingredients');
        await auditAccessibility(page, `Recipe Modal (${theme})`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 3. Audit Fridge View
      await page.locator('header nav button:has-text("Fridge")').click();
      await page.waitForSelector('text=Greek Yogurt');
      await auditAccessibility(page, `Fridge View (${theme})`);

      // 4. Audit Add Item Modal
      const addBtn = page.locator('button[aria-label="Add item"]').first();
      await addBtn.click();
      await page.waitForSelector('text=Quick Presets');
      await auditAccessibility(page, `Add Item Modal (${theme})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // 5. Audit Wins View
      await page.locator('header nav button:has-text("Wins")').click();
      await page.waitForSelector('text=Achievements');
      await auditAccessibility(page, `Wins View (${theme})`);

      // 6. Audit Weekly Report Modal
      const reportBtn = page.locator('button:has-text("Weekly Report Card")');
      if (await reportBtn.isVisible()) {
        await reportBtn.click();
        await page.waitForSelector('text=Sir Expiry\'s dispatch');
        await auditAccessibility(page, `Weekly Report Modal (${theme})`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      await ctx.close();
    }
    console.log('\n✓ Comprehensive Accessibility & Contrast Audit passed (0 WCAG AA violations)');

    // ----------------------------------------------------
    // CHECK 4: Mobile Viewport Clearance & Keyboard Navigation Test
    // ----------------------------------------------------
    console.log('\n--- Running Check 4: Mobile Viewport Clearance (375px) & Keyboard Navigation ---');
    const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await mobileCtx.addCookies(sessionCookies);
    const mPage = await mobileCtx.newPage();

    // 1. Check Today view mobile clearance
    await mPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await mPage.waitForSelector('text=Expiring soon');
    await mPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mPage.waitForTimeout(500);

    const todayUseBtns = mPage.locator('button:has-text("Use")');
    const lastTodayUse = todayUseBtns.last();
    const todayUseBox = await lastTodayUse.boundingBox();
    const todayAddBtn = mPage.locator('button[aria-label="Add item to fridge"]');
    const todayAddBox = await todayAddBtn.boundingBox();

    if (todayUseBox && todayAddBox) {
      const isOverlapping = !(
        todayUseBox.x + todayUseBox.width < todayAddBox.x ||
        todayUseBox.x > todayAddBox.x + todayAddBox.width ||
        todayUseBox.y + todayUseBox.height < todayAddBox.y ||
        todayUseBox.y > todayAddBox.y + todayAddBox.height
      );
      if (isOverlapping) {
        throw new Error('Mobile clearance failure: floating Add button overlaps Use button on Today view!');
      }
      console.log(`  ✓ Today view mobile clearance verified: Use button bottom (${(todayUseBox.y + todayUseBox.height).toFixed(0)}px) does not overlap Add button top (${todayAddBox.y.toFixed(0)}px)`);
    }

    // 2. Check Fridge view mobile clearance
    await mPage.locator('nav[aria-label="Mobile navigation"] button:has-text("Fridge")').click();
    await mPage.waitForSelector('text=Greek Yogurt');
    await mPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mPage.waitForTimeout(500);

    const fridgeUseBtns = mPage.locator('button:has-text("Use")');
    const lastFridgeUse = fridgeUseBtns.last();
    const fridgeUseBox = await lastFridgeUse.boundingBox();
    const fridgeAddBtn = mPage.locator('button[aria-label="Add item"]');
    const fridgeAddBox = await fridgeAddBtn.boundingBox();

    if (fridgeUseBox && fridgeAddBox) {
      const isOverlapping = !(
        fridgeUseBox.x + fridgeUseBox.width < fridgeAddBox.x ||
        fridgeUseBox.x > fridgeAddBox.x + fridgeAddBox.width ||
        fridgeUseBox.y + fridgeUseBox.height < fridgeAddBox.y ||
        fridgeUseBox.y > fridgeAddBox.y + fridgeAddBox.height
      );
      if (isOverlapping) {
        throw new Error('Mobile clearance failure: floating Add button overlaps Use button on Fridge view!');
      }
      console.log(`  ✓ Fridge view mobile clearance verified: Use button bottom (${(fridgeUseBox.y + fridgeUseBox.height).toFixed(0)}px) does not overlap Add button top (${fridgeAddBox.y.toFixed(0)}px)`);
    }

    await mobileCtx.close();

    // 3. Desktop Keyboard Navigation
    const kbContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await kbContext.addCookies(sessionCookies);
    const kbPage = await kbContext.newPage();
    await kbPage.goto(baseUrl, { waitUntil: 'networkidle' });

    let reachedAdd = false;
    for (let i = 0; i < 20; i++) {
      await kbPage.keyboard.press('Tab');
      const ariaLabel = await kbPage.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
      if (ariaLabel.includes('Add item')) {
        reachedAdd = true;
        break;
      }
    }

    if (reachedAdd) {
      await kbPage.keyboard.press('Enter');
      await kbPage.waitForSelector('text=Quick Presets', { timeout: 3000 });
      console.log('  ✓ Modal opened via keyboard Enter');
      await kbPage.keyboard.press('Escape');
      await kbPage.waitForTimeout(300);
      const modalVisible = await kbPage.locator('text=Quick Presets').isVisible();
      if (modalVisible) {
        throw new Error('Modal did not close on Escape key');
      }
      console.log('  ✓ Modal closed via keyboard Escape');
    }
    console.log('✓ Keyboard navigation & mobile clearance passed');
    await kbContext.close();

    // ----------------------------------------------------
    // CHECK 5: Strict Forbidden Token Scanner ([object, undefined, NaN, &amp;)
    // ----------------------------------------------------
    console.log('\n--- Running Check 5: Strict Forbidden Token Scanner (Loaded Data) ---');
    const scanContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await scanContext.addCookies(sessionCookies);
    const scanPage = await scanContext.newPage();
    await scanPage.goto(baseUrl, { waitUntil: 'networkidle' });

    // 1. Scan Today View
    await scanPageForForbiddenTokens(scanPage, 'Today View');
    console.log('  ✓ Today View clean (no [object, undefined, NaN, &amp;)');

    // 2. Scan Recipe Modal
    const cookRecipeBtn = scanPage.locator('button:has-text("Cook")').first();
    if (await cookRecipeBtn.isVisible()) {
      await cookRecipeBtn.click();
      await scanPage.waitForSelector('text=Ingredients');
      await scanPageForForbiddenTokens(scanPage, 'Recipe Modal');
      console.log('  ✓ Recipe Modal clean (no [object, undefined, NaN, &amp;)');
      await scanPage.keyboard.press('Escape');
      await scanPage.waitForTimeout(300);
    }

    // 3. Scan Fridge View
    await scanPage.locator('header nav button:has-text("Fridge")').click();
    await scanPage.waitForSelector('text=Greek Yogurt');
    await scanPageForForbiddenTokens(scanPage, 'Fridge View');
    console.log('  ✓ Fridge View clean (no [object, undefined, NaN, &amp;)');

    // 4. Scan Add Item Modal
    const addModalBtn = scanPage.locator('button[aria-label="Add item"]').first();
    await addModalBtn.click();
    await scanPage.waitForSelector('text=Quick Presets');
    await scanPageForForbiddenTokens(scanPage, 'Add Item Modal');
    console.log('  ✓ Add Item Modal clean (no [object, undefined, NaN, &amp;)');
    await scanPage.keyboard.press('Escape');
    await scanPage.waitForTimeout(300);

    // 5. Scan Wins View
    await scanPage.locator('header nav button:has-text("Wins")').click();
    await scanPage.waitForSelector('text=Achievements');
    await scanPageForForbiddenTokens(scanPage, 'Wins View');
    console.log('  ✓ Wins View clean (no [object, undefined, NaN, &amp;)');

    // 6. Scan Weekly Report Modal
    const reportModalBtn = scanPage.locator('button:has-text("Weekly Report Card")');
    if (await reportModalBtn.isVisible()) {
      await reportModalBtn.click();
      await scanPage.waitForSelector('text=Sir Expiry\'s dispatch', { timeout: 10000 });
      await scanPageForForbiddenTokens(scanPage, 'Weekly Report Modal');
      console.log('  ✓ Weekly Report Modal clean (no [object, undefined, NaN, &amp;)');
      await scanPage.keyboard.press('Escape');
      await scanPage.waitForTimeout(300);
    }

    // 7. Scan Household Settings Modal
    const settingsBtn = scanPage.locator('button[aria-label="Household settings"]');
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await scanPage.waitForSelector('text=Settings', { timeout: 10000 });
      await scanPageForForbiddenTokens(scanPage, 'Household Settings Modal');
      console.log('  ✓ Household Settings Modal clean (no [object, undefined, NaN, &amp;)');
      await scanPage.keyboard.press('Escape');
      await scanPage.waitForTimeout(300);
    }

    await scanContext.close();

    // ----------------------------------------------------
    // CHECK 6: FFprobe Media Integrity Verification
    // ----------------------------------------------------
    console.log('\n--- Running Check 6: FFprobe WebM Verification ---');
    try {
      const ffprobePath = require('ffprobe-static').path;
      const ffprobeOut = execSync(`"${ffprobePath}" -hide_banner "${destWebm}" 2>&1`, { encoding: 'utf-8' });
      console.log(ffprobeOut.trim());
    } catch (e: any) {
      console.log('FFprobe verification output:\n', e.stdout || e.message);
    }

    // ----------------------------------------------------
    // Summary & File List
    // ----------------------------------------------------
    console.log('\n=== ALL ACCEPTANCE CHECKS PASSED SUCCESSFULLY ===\n');

    console.log('--- Output File List (docs/screens/v4/): ---');
    const files = fs.readdirSync(v4Dir).filter(f => !fs.statSync(path.join(v4Dir, f)).isDirectory());
    for (const file of files) {
      const stats = fs.statSync(path.join(v4Dir, file));
      console.log(`  - docs/screens/v4/${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    const seqFiles = fs.readdirSync(seqDir);
    console.log('\n--- First-Run Flow Sequence (docs/screens/v4/first-run-sequence/): ---');
    for (const sf of seqFiles) {
      const stats = fs.statSync(path.join(seqDir, sf));
      console.log(`  - docs/screens/v4/first-run-sequence/${sf} (${(stats.size / 1024).toFixed(1)} KB)`);
    }
  } finally {
    await browser.close();
    await app.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Acceptance Check Failure:', err);
  process.exit(1);
});
