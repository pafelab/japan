/* Audio (spec §6, contract §5): off by default, never autoplays. No AudioContext may exist before the
   sound button is clicked; the click (a user gesture) creates it. */
import { test, expect, open, note, scrollToY } from './kn.js';

test('Audio: no AudioContext before the sound button is clicked; the click creates one', async ({ page }) => {
  await page.addInitScript(() => {
    window.__acCount = 0;
    for (const k of ['AudioContext', 'webkitAudioContext']) {
      const C = window[k];
      if (typeof C !== 'function') continue;
      window[k] = class extends C { constructor(...a) { super(...a); window.__acCount++; } };
    }
  });
  await open(page);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const f of [0.1, 0.3, 0.5, 0.8, 1, 0]) await scrollToY(page, f * h);
  await page.mouse.move(400, 400);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__acCount), 'AudioContexts created before any click').toBe(0);

  const sound = page.locator('[data-toggle="sound"]');
  const pressedBefore = await sound.getAttribute('aria-pressed');
  await sound.click();
  await expect.poll(() => page.evaluate(() => window.__acCount), { message: 'the sound button creates an AudioContext' }).toBeGreaterThanOrEqual(1);
  const after = await page.evaluate(() => window.__acCount);
  const pressedAfter = await sound.getAttribute('aria-pressed');
  note('audio', `contexts ${after}; aria-pressed ${pressedBefore} → ${pressedAfter}`);
  expect.soft(pressedBefore, 'sound starts off').toBe('false');
  expect.soft(pressedAfter, 'the button reports sound on').toBe('true');
});
