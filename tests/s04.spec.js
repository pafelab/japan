/* S04 東京 Hyper-Density · the pin ends on flat sumi with hairlines at 28% | 72% (the seam into S05).
   Checked on the element (.s04 .rules fully on and covering the frame) and on the pixels: rows of a
   screenshot are flat --sumi-1 except for a lighter hairline at 28% and at 72% of the width. */
import { test, expect, open, note, scrollToY, mustTrig, sampleRow, colourDist, hex } from './kn.js';

const SUMI_1 = hex('#141312'), SUMI_3 = hex('#4A463F');

test('S04 flat sumi + rules frame at the end of the pin', async ({ page }) => {
  await open(page);
  const t = await mustTrig(page, 's04');
  await scrollToY(page, t.end);
  const s = await page.evaluate(() => {
    const el = document.querySelector('.s04 .rules');
    if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const sec = document.querySelector('.s04').getBoundingClientRect();
    const bloom = document.querySelector('.s04 .bloom')?.getBoundingClientRect();
    return { opacity: +cs.opacity, visibility: cs.visibility,
             left: r.left, top: r.top, right: r.right, bottom: r.bottom, secTop: sec.top,
             bloomBottom: bloom ? bloom.bottom : null,
             W: document.documentElement.clientWidth, H: document.documentElement.clientHeight };
  });
  expect(s, '.s04 .rules exists').not.toBeNull();
  expect(s.opacity, '.s04 .rules opacity').toBe(1);
  expect(s.visibility, '.s04 .rules visibility').toBe('visible');
  expect(s.left).toBeLessThanOrEqual(0.5);
  expect(s.top).toBeLessThanOrEqual(0.5);
  expect(s.right).toBeGreaterThanOrEqual(s.W - 0.5);
  expect(s.bottom).toBeGreaterThanOrEqual(s.H - 0.5);
  if (s.bloomBottom != null) expect.soft(s.bloomBottom, 'the bloom sheet is long gone').toBeLessThanOrEqual(s.secTop + 0.5);

  // Pixels: three rows below the HUD.
  const rules = [0.28, 0.72].map((f) => Math.round(f * s.W));
  const nearRule = (x) => rules.some((r) => Math.abs(x - r) <= 3);
  const report = [];
  for (const fy of [0.35, 0.55, 0.8]) {
    const row = await sampleRow(page, fy * s.H);
    const flat = row.filter((_, x) => !nearRule(x));
    const onSumi = flat.filter((p) => colourDist(p, SUMI_1) <= 8).length / flat.length;
    const hair = rules.map((r) => {
      let best = null;
      for (let x = r - 2; x <= r + 2; x++) {
        const p = row[x];
        if (p && (!best || colourDist(p, SUMI_1) > colourDist(best, SUMI_1))) best = p;
      }
      return best;
    });
    report.push(`row ${Math.round(fy * 100)}%: ${(onSumi * 100).toFixed(1)}% sumi-1; hairlines rgb(${hair[0]}) rgb(${hair[1]})`);
    expect.soft(onSumi, `row at ${Math.round(fy * 100)}%: flat --sumi-1 away from the rules`).toBeGreaterThanOrEqual(0.98);
    for (const [i, p] of hair.entries()) {
      expect.soft(colourDist(p, SUMI_1), `row at ${Math.round(fy * 100)}%: a hairline at ${[28, 72][i]}%`).toBeGreaterThanOrEqual(12);
      expect.soft(colourDist(p, SUMI_3), `row at ${Math.round(fy * 100)}%: the hairline is --sumi-3-ish`).toBeLessThanOrEqual(40);
    }
  }
  note('pixels', report.join(' · '));
});
