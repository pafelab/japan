/* Phone 390×844 with touch (spec §7): native scrolling, the native swipe row, the HUD flip at S04
   mid-screen. Every test here is tagged @phone and runs only in the "phone" project. */
import { test, expect, open, note, scrollToY, mustTrig, VH, checkNoOverflow, scrollThrough } from './kn.js';

test.describe('phone', { tag: '@phone' }, () => {
  test('Phone 390×844 with touch: no Lenis, native swipe row', async ({ page }) => {
    await open(page);
    const s = await page.evaluate(() => {
      const s03 = document.querySelector('.s03'), track = document.querySelector('.s03 .track');
      const cs = track && getComputedStyle(track);
      return {
        coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
        input: document.documentElement.dataset.input, motion: document.documentElement.dataset.motion,
        lenis: !!window.__kn.lenis, lenisClass: document.documentElement.classList.contains('lenis'),
        rail: s03?.classList.contains('is-rail'), railTrigger: !!window.__kn.ScrollTrigger.getById('s03'),
        overflowX: cs?.overflowX, snap: cs?.scrollSnapType, scrollable: track ? track.scrollWidth > track.clientWidth + 1 : false,
        cards: document.querySelectorAll('.s03 .card').length,
        cardHeights: [...document.querySelectorAll('.s03 .card')].map(c => Math.round(c.getBoundingClientRect().height)),
      };
    });
    note('state', JSON.stringify(s));
    expect(s.fine, 'the phone profile is not a fine pointer').toBe(false);
    expect(s.input).toBe('coarse');
    expect(s.motion).toBe('on');
    expect(s.lenis || s.lenisClass, 'no Lenis on touch').toBe(false);
    expect(s.rail, 'no .is-rail').toBe(false);
    expect(s.railTrigger, "no 's03' pin").toBe(false);
    expect(['auto', 'scroll']).toContain(s.overflowX);
    expect(s.snap).toMatch(/x/);
    expect(s.scrollable, 'the row scrolls sideways').toBe(true);
    for (const h of s.cardHeights) expect.soft(h, 'cards have an explicit height').toBeGreaterThan(200);
  });

  test('Phone: HUD flips at S04 mid-screen', async ({ page }) => {
    await open(page);
    const t = await mustTrig(page, 's04'), vh = await VH(page);
    const flipAt = t.start - vh / 2;
    const mode = () => page.locator('.hud').getAttribute('data-mode');
    const seq = [];
    for (const [y, want] of [[flipAt - 200, 'paper'], [flipAt - 4, 'paper'], [flipAt + 4, 'night'], [t.end, 'night'], [flipAt - 4, 'paper']]) {
      const at = await scrollToY(page, y);
      const got = await mode();
      seq.push(`${at}:${got}`);
      expect.soft(got, `HUD at y ${at} (flip at ${flipAt.toFixed(1)})`).toBe(want);
    }
    const s04Top = await page.evaluate(() => document.querySelector('.s04').getBoundingClientRect().top);
    note('sequence', seq.join(' → ') + ` (S04 top ${s04Top.toFixed(1)}px at the last position)`);
  });

  test('No sideways page overflow: phone 390×844', async ({ page }) => {
    await open(page);
    await checkNoOverflow(page);
  });

  test('No JavaScript errors on load and after a full scroll through (phone)', async ({ page, errors }) => {
    await open(page);
    await scrollThrough(page, { step: 0.5, back: true });
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
