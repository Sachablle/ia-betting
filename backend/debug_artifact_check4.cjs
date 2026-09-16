const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const filePath = 'file://' + path.resolve('/private/tmp/claude-501/-Users-sacha-Desktop-Claude-projets-Projets-betting-/dacc8c16-598e-4cc3-807e-59078b1fd2a1/scratchpad/seuils_par_marche_live.html');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
  await page.goto(filePath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Portugal Résultat -> hover the point row to trigger pointBucketTooltipHTML
  await page.locator('.league-tab', { hasText: 'Portugal' }).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  const ptRow = page.locator('tr').filter({ hasText: '42%' }).first();
  await ptRow.hover({ timeout: 2000 }).catch(e => console.log('hover 42% row failed:', e.message));
  await page.waitForTimeout(300);
  const tooltipText = await page.locator('#candTooltip').textContent().catch(() => null);
  console.log('point tooltip text:', tooltipText);

  // Click on the "42%" row to see candidate list if it opens something, or check the cand-section
  // for lower threshold display by lowering current threshold via URL hash isn't available, so
  // instead just verify hovering the row didn't crash and printed a bet label.

  console.log('ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
