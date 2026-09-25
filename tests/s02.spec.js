/* S02 静寂 Echoes of Stillness · the shoji closes into flat washi, the seam into the interlude. */
import { test, expect, open, note, scrollToY, mustTrig, look } from './kn.js';

test('S02 shoji fully closed at the end of the pin (left edge ≤ 0.5px)', async ({ page }) => {
  await open(page);
  const t = await mustTrig(page, 's02');
  await scrollToY(page, t.end);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.s02 .shoji');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom,
             W: document.documentElement.clientWidth, H: document.documentElement.clientHeight };
  });
  expect(r, '.s02 .shoji exists').not.toBeNull();
  const l = await look(page, '.s02 .shoji');
  note('shoji', `left ${r.left.toFixed(2)}px, right ${r.right.toFixed(2)}px, top ${r.top.toFixed(2)}, bottom ${r.bottom.toFixed(2)}; opacity ${l.opacity}, ${l.visibility}`);
  expect(r.left, 'shoji left edge').toBeLessThanOrEqual(0.5);
  expect(r.left, 'shoji left edge').toBeGreaterThanOrEqual(-0.5);
  expect(r.right, 'shoji reaches the right edge').toBeGreaterThanOrEqual(r.W - 0.5);
  expect(r.top, 'shoji covers the top').toBeLessThanOrEqual(0.5);
  expect(r.bottom, 'shoji covers the bottom').toBeGreaterThanOrEqual(r.H - 0.5);
  expect(l.opacity, 'shoji opaque').toBe(1);
  expect(l.visibility, 'shoji visible').toBe('visible');
});
