/* Scene navigation (spec §6): every HUD link lands where the choreography puts its scene
   (window.scrollY = __kn.sceneTarget(id) ± 2px), with the scene filling the screen. */
import { test, expect, open, note, settleScroll } from './kn.js';

const ORDER = ['s02', 'field-notes', 's03', 's04', 's05', 's06', 's01', 's04', 's03'];

test('Navigation: each .hud__nav link lands on its scene', async ({ page }) => {
  await open(page);
  const ids = await page.locator('.hud__nav a[data-target]').evaluateAll(as => as.map(a => a.dataset.target));
  expect(ids).toEqual(['s01', 's02', 'field-notes', 's03', 's04', 's05', 's06']);
  const rows = [];
  for (const id of ORDER) {
    await page.locator(`.hud__nav a[data-target="${id}"]`).click();
    const target = await page.evaluate((id) => window.__kn.sceneTarget(id), id);
    await expect.poll(() => page.evaluate((t) => Math.abs(window.scrollY - t), target),
      { message: `scrollY lands within 2px of ${id} at ${Math.round(target)}`, timeout: 15_000 }).toBeLessThanOrEqual(2);
    await settleScroll(page);
    const s = await page.evaluate((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      const current = document.querySelector('.hud__nav a[aria-current="location"]')?.dataset.target ?? null;
      return { y: window.scrollY, top: r.top, bottom: r.bottom, vh: document.documentElement.clientHeight, current, hash: location.hash };
    }, id);
    rows.push(`${id} y ${s.y} (target ${Math.round(target)}) top ${s.top.toFixed(1)}`);
    expect.soft(s.top, `${id}: the scene's top is at the top of the screen`).toBeLessThanOrEqual(2);
    expect.soft(s.bottom, `${id}: the scene fills the screen`).toBeGreaterThanOrEqual(s.vh - 2);
    expect.soft(s.current, `${id}: the HUD marks it aria-current`).toBe(id);
    expect.soft(s.hash, `${id}: the URL hash follows`).toBe('#' + id);
  }
  note('landings', rows.join(' · '));
});
