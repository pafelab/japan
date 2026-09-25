/* S06 富士 First Light · CSS sticky under the washi curtain, and the timed settle (spec §4.7, §5.5). */
import { test, expect, open, note, scrollToY, mustTrig, VH } from './kn.js';

test('S06 sticky from the start of the curtain to the end of the page', async ({ page }) => {
  await open(page);
  const t = await mustTrig(page, 's06'), vh = await VH(page);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  const curtain = t.start - vh;                         // S05's bottom edge reaches the bottom of the screen
  const ys = [];
  for (let y = curtain; y < max; y += vh / 4) ys.push(y);
  ys.push(max);
  const rows = [];
  for (const y of ys) {
    const at = await scrollToY(page, y);
    const r = await page.evaluate(() => {
      const s = document.querySelector('.s06').getBoundingClientRect();
      const c = document.querySelector('.s05').getBoundingClientRect();
      return { top: s.top, bottom: s.bottom, curtainBottom: c.bottom };
    });
    rows.push({ y: at, ...r });
  }
  const worst = rows.reduce((w, r) => (Math.abs(r.top) > Math.abs(w.top) ? r : w), rows[0]);
  note('sticky', `${rows.length} samples from ${Math.round(curtain)} to ${max}; worst top ${worst.top.toFixed(2)}px at y ${worst.y}`);
  for (const r of rows) expect.soft(Math.abs(r.top), `.s06 top at y ${r.y}`).toBeLessThanOrEqual(1);
  const end = rows[rows.length - 1];
  expect(Math.abs(end.bottom - vh), 'the page ends with S06 filling the screen').toBeLessThanOrEqual(1);
  expect(rows[0].curtainBottom, 'the curtain starts at the bottom of the screen').toBeGreaterThanOrEqual(vh - 2);
});

test('S06 settle lands at scale 1.000 (≈ 3.6 s after the curtain lifts)', async ({ page }) => {
  await open(page);
  const t = await mustTrig(page, 's06');
  await scrollToY(page, t.start - 10);
  const before = await page.evaluate(() => window.__kn.gsap.getProperty('.s06 .fuji', 'scale'));
  await scrollToY(page, t.start + 2);
  await page.waitForTimeout(3600);
  const s = await page.evaluate(() => {
    const g = window.__kn.gsap;
    const ui = [...document.querySelectorAll('.s06 .ui > *')].map(e => { const cs = getComputedStyle(e); return { o: +cs.opacity, v: cs.visibility, f: cs.filter }; });
    const aka = [...document.querySelectorAll('.s06 .akafuji')].map(e => +getComputedStyle(e).opacity);
    const refl = document.querySelector('.s06 .reflection');
    return { fuji: g.getProperty('.s06 .fuji', 'scale'), reflection: refl ? g.getProperty(refl, 'scale') : null, ui, aka };
  });
  note('settle', `fuji ${(+before).toFixed(3)} → ${(+s.fuji).toFixed(3)}; reflection ${s.reflection == null ? 'n/a' : (+s.reflection).toFixed(3)}; akafuji ${s.aka.join(', ')}; ui ${s.ui.map(u => u.o).join(', ')}`);
  expect.soft(+before, 'before the curtain lifts, Fuji waits at 1.08').toBeCloseTo(1.08, 3);
  expect(+s.fuji, '.fuji scale').toBeCloseTo(1, 3);
  if (s.reflection != null) expect.soft(+s.reflection, '.reflection scale').toBeCloseTo(1, 3);
  expect.soft(s.aka.length, '.akafuji exists').toBeGreaterThan(0);
  for (const o of s.aka) expect.soft(o, '.akafuji opacity').toBe(1);
  expect.soft(s.ui.length, '.ui has 1–5 children').toBeGreaterThan(0);
  expect.soft(s.ui.length, '.ui has at most five children').toBeLessThanOrEqual(5);
  for (const u of s.ui) { expect.soft(u.o, '.ui child opacity').toBe(1); expect.soft(u.v, '.ui child visibility').toBe('visible'); }
});
