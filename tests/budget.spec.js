/* Spec §3.1 budget, §7 input strategy on desktop, and the "no JavaScript errors" row of §5.5. */
import { test, expect, open, note, trig, VH, scrollThrough } from './kn.js';

test.describe('desktop 1920×1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Desktop 1920×1080: fine pointer detected, Lenis on, pinned rail on', async ({ page }) => {
    await open(page);
    const s = await page.evaluate(() => ({
      fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
      input: document.documentElement.dataset.input,
      motion: document.documentElement.dataset.motion,
      lenisObj: !!window.__kn.lenis,
      lenisClass: document.documentElement.classList.contains('lenis'),
      rail: document.querySelector('.s03')?.classList.contains('is-rail') ?? false,
      railTrigger: !!window.__kn.ScrollTrigger.getById('s03'),
    }));
    note('state', JSON.stringify(s));
    expect(s.fine, 'the desktop profile matches (hover: hover) and (pointer: fine)').toBe(true);
    expect(s.motion).toBe('on');
    expect(s.input).toBe('fine');
    expect(s.lenisObj || s.lenisClass, 'Lenis is running (window.__kn.lenis or html.lenis)').toBe(true);
    expect(s.rail, '.s03 has .is-rail').toBe(true);
    expect(s.railTrigger, "ScrollTrigger 's03' (the pinned rail) exists").toBe(true);
  });

  test('Budget §3.1: pins at 0–1296, 2376–4536, 7236–11772, 12852–15012 and a 19,872px document', async ({ page }) => {
    await open(page);
    const budget = await page.evaluate(() => ({ ...window.__kn.BUDGET }));
    expect(budget).toEqual({ s01: 1.2, s02: 2.0, s03PerCard: 1.0, s03Portal: 1.2, s04: 2.0 });
    expect(await VH(page)).toBe(1080);

    const want = { s01: [0, 1296], s02: [2376, 4536], s03: [7236, 11772], s04: [12852, 15012] };
    const got = {};
    for (const id of Object.keys(want)) got[id] = await trig(page, id);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    note('pins', Object.entries(got).map(([id, t]) => `${id} ${t ? `${Math.round(t.start)}–${Math.round(t.end)}` : 'missing'}`).join(' · '));
    note('document', `${height}px (${(height / 1080).toFixed(2)} screens)`);

    for (const [id, [a, b]] of Object.entries(want)) {
      expect.soft(got[id], `ScrollTrigger '${id}' exists`).not.toBeNull();
      if (!got[id]) continue;
      expect.soft(Math.abs(got[id].start - a), `${id} starts at ${a} (got ${got[id].start.toFixed(1)})`).toBeLessThanOrEqual(2);
      expect.soft(Math.abs(got[id].end - b), `${id} ends at ${b} (got ${got[id].end.toFixed(1)})`).toBeLessThanOrEqual(2);
    }
    expect.soft(Math.abs(height - 19872), `document is 19,872px (got ${height})`).toBeLessThanOrEqual(2);
  });

  test('No JavaScript errors on load and after a full scroll through (desktop)', async ({ page, errors }) => {
    await open(page);
    await page.waitForTimeout(500);
    expect(errors, 'errors during load').toEqual([]);
    await scrollThrough(page, { step: 0.5, back: true });
    await page.waitForTimeout(300);
    expect(errors, 'errors after scrolling to the end and back').toEqual([]);
  });
});
