/* The HUD motion toggle (spec §6): same path as reduced motion, remembered across reloads. */
import { test, expect, open, note } from './kn.js';

const state = (page) => page.evaluate(() => ({
  motion: document.documentElement.dataset.motion,
  triggers: window.__kn.ScrollTrigger.getAll().length,
  spacers: document.querySelectorAll('.pin-spacer').length,
  s01: !!window.__kn.ScrollTrigger.getById('s01'),
  lenis: !!window.__kn.lenis,
  pressed: document.querySelector('[data-toggle="motion"]')?.getAttribute('aria-pressed'),
  stored: (() => { try { return localStorage.getItem('kn:motion'); } catch { return 'n/a'; } })(),
}));

test('Motion toggle: off removes every pin (1 trigger), survives a reload, and on restores the pins', async ({ page }) => {
  await open(page);
  const on = await state(page);
  expect(on.motion).toBe('on');
  expect(on.s01, 'pins exist before the toggle').toBe(true);

  const button = page.locator('[data-toggle="motion"]');
  await expect(button, 'the motion toggle is visible').toBeVisible();
  await button.click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.waitForTimeout(200);
  const off = await state(page);
  note('off', JSON.stringify(off));
  expect.soft(off.triggers, 'only the HUD trigger').toBe(1);
  expect.soft(off.spacers, 'no .pin-spacer').toBe(0);
  expect.soft(off.lenis, 'no Lenis').toBe(false);
  expect.soft(off.pressed, 'aria-pressed changes with the state').not.toBe(on.pressed);

  await page.reload();
  await page.waitForFunction(() => !!window.__kn);
  await page.waitForTimeout(300);
  const reloaded = await state(page);
  note('after reload', JSON.stringify(reloaded));
  expect.soft(reloaded.motion, 'the choice is remembered').toBe('off');
  expect.soft(reloaded.triggers, 'still only the HUD trigger').toBe(1);
  expect.soft(reloaded.pressed, 'the button reflects the remembered state').toBe(off.pressed);

  await page.locator('[data-toggle="motion"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.waitForTimeout(200);
  const back = await state(page);
  note('back on', JSON.stringify(back));
  expect(back.s01, "the 's01' pin is back").toBe(true);
  expect(back.spacers, 'pins are back (s01, s02, s03, s04)').toBeGreaterThanOrEqual(4);
  expect(back.triggers).toBe(on.triggers);
  expect(back.lenis, 'Lenis is back').toBe(true);
});
