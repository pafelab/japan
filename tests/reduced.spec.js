/* Reduced motion = T0 (spec §5.3, §6): only the HUD trigger, no pins, no Lenis, seams hidden, the
   final states visible as CSS defaults, S03 as the native row, and a page ≈ 8.9 screens long. */
import { test, expect, open, note, checkNoOverflow, scrollThrough } from './kn.js';

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1920, height: 1080 } });

  test('Reduced motion: only the HUD trigger, no pins, seams hidden', async ({ page }) => {
    await open(page);
    const s = await page.evaluate(() => ({
      motion: document.documentElement.dataset.motion,
      tier: document.documentElement.dataset.tier,
      triggers: window.__kn.ScrollTrigger.getAll().map(t => t.vars.id ?? '(anonymous)'),
      spacers: document.querySelectorAll('.pin-spacer').length,
      lenis: !!window.__kn.lenis || document.documentElement.classList.contains('lenis'),
      rail: document.querySelector('.s03')?.classList.contains('is-rail'),
      seams: [...document.querySelectorAll('.seam')].map(el => {
        const cs = getComputedStyle(el);
        return { cls: el.className, opacity: +cs.opacity, visibility: cs.visibility, display: cs.display };
      }),
    }));
    note('state', `motion ${s.motion}, tier ${s.tier}, triggers [${s.triggers.join(', ')}], spacers ${s.spacers}`);
    expect(s.motion).toBe('off');
    expect(s.triggers.length, 'ScrollTrigger.getAll().length').toBe(1);
    expect(s.spacers, 'no .pin-spacer').toBe(0);
    expect(s.lenis, 'no Lenis').toBe(false);
    expect(s.rail, 'S03 stays the native row').toBe(false);
    expect(s.seams.length, 'seams exist').toBeGreaterThan(0);
    const shown = s.seams.filter(x => x.display !== 'none' && x.visibility !== 'hidden' && x.opacity > 0);
    expect(shown, 'every .seam is hidden').toEqual([]);
  });

  test('Reduced motion: final states visible (haiku, S06 UI, Akafuji, Fuji at rest)', async ({ page }) => {
    await open(page);
    const s = await page.evaluate(() => {
      const vis = (el) => {
        const cs = getComputedStyle(el), m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
        return { o: +cs.opacity, v: cs.visibility, d: cs.display, t: cs.transform, sx: Math.hypot(m.a, m.b), sy: Math.hypot(m.c, m.d), sel: el.className || el.tagName };
      };
      return {
        haiku: [...document.querySelectorAll('.s02 .haiku .line')].map(vis),
        ui: [...document.querySelectorAll('.s06 .ui > *')].map(vis),
        aka: [...document.querySelectorAll('.s06 .akafuji')].map(vis),
        fuji: [...document.querySelectorAll('.s06 .fuji, .s06 .reflection')].map(vis),
        title: [...document.querySelectorAll('.s01 .title')].map(vis),
      };
    });
    note('final states', `haiku ${s.haiku.map(x => x.o).join('/')}, ui ${s.ui.map(x => x.o).join('/')}, akafuji ${s.aka.map(x => x.o).join('/')}, fuji ${s.fuji.map(x => x.t).join(' | ')}`);
    expect(s.haiku.length, 'three haiku lines').toBe(3);
    expect(s.ui.length, '.s06 .ui has children').toBeGreaterThan(0);
    expect(s.aka.length, '.akafuji exists').toBeGreaterThan(0);
    const on = (x) => x.o === 1 && x.v === 'visible' && x.d !== 'none';
    for (const group of ['haiku', 'ui', 'aka', 'title']) for (const x of s[group]) expect.soft(on(x), `${group}: ${x.sel} visible (opacity ${x.o}, ${x.v})`).toBe(true);
    for (const x of s.fuji) expect.soft(Math.abs(x.sx - 1) < 1e-3 && Math.abs(x.sy - 1) < 1e-3, `${x.sel} at scale 1 (${x.t})`).toBe(true);
  });

  test('Reduced motion: the page is ≈ 8.9 screens long', async ({ page }) => {
    await open(page);
    const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: document.documentElement.clientHeight }));
    const screens = h / vh;
    note('page length', `${h}px = ${screens.toFixed(2)} screens (spec 8.9)`);
    expect(screens).toBeGreaterThanOrEqual(7.9);
    expect(screens).toBeLessThanOrEqual(9.9);
  });

  test('No sideways page overflow: reduced motion', async ({ page }) => {
    await open(page);
    await checkNoOverflow(page);
  });

  test('No JavaScript errors on load and after a full scroll through (reduced motion)', async ({ page, errors }) => {
    await open(page);
    await scrollThrough(page, { step: 0.5 });
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
