/* S03 旅 Traverse · the pinned rail, its parallax, the sign portal and the HUD flip (spec §4.4, §5.5). */
import { test, expect, open, note, scrollToY, settleScroll, mustTrig, VH, frames } from './kn.js';

const RIDE_CARDS = 3;   // (n − 1) card moves of BUDGET.s03PerCard viewports each

async function ride(page) {
  const t = await mustTrig(page, 's03'), vh = await VH(page);
  const per = await page.evaluate(() => window.__kn.BUDGET.s03PerCard);
  const n = await page.locator('.s03 .card').count();
  return { t, vh, n, rideLen: (n - 1) * per * vh };
}

test('S03 inner media covers its card across the whole ride (≥ 12 samples, worst gap ≤ 0.5px)', async ({ page }) => {
  await open(page);
  const { t, rideLen } = await ride(page);
  const SAMPLES = 16;
  let worst = { gap: -Infinity };
  for (let i = 0; i <= SAMPLES; i++) {
    const y = t.start + (rideLen * i) / SAMPLES;
    await scrollToY(page, y);
    const gaps = await page.evaluate(() => [...document.querySelectorAll('.s03 .card')].flatMap((card, k) => {
      const media = card.querySelector('.card__media');
      if (!media) return [];
      const c = card.getBoundingClientRect(), m = media.getBoundingClientRect();
      const W = document.documentElement.clientWidth;
      const onScreen = c.right > 0 && c.left < W;
      return [{ card: card.className, k, onScreen, gap: Math.max(m.left - c.left, c.right - m.right, m.top - c.top, c.bottom - m.bottom) }];
    }));
    expect(gaps.length, 'cards with .card__media exist').toBeGreaterThan(0);
    for (const g of gaps) if (g.gap > worst.gap) worst = { ...g, y: Math.round(y), i };
  }
  note('worst gap', `${worst.gap.toFixed(2)}px (${worst.card}, sample ${worst.i}, y ${worst.y})`);
  expect(worst.gap, 'media edge never shows inside its card').toBeLessThanOrEqual(0.5);
});

async function lastCardFlush(page) {
  const { t, rideLen } = await ride(page);
  await scrollToY(page, t.start + rideLen);
  return page.evaluate(() => {
    const root = document.querySelector('.s03').getBoundingClientRect();
    const cards = document.querySelectorAll('.s03 .card');
    const last = cards[cards.length - 1].getBoundingClientRect();
    return { dl: last.left - root.left, dr: last.right - root.right, rootLeft: root.left, rootTop: root.top,
             w: last.width, W: root.width };
  });
}

test('S03 last card flush when the ride ends (1920×1080)', async ({ page }) => {
  await open(page);
  const f = await lastCardFlush(page);
  note('last card', `left ${f.dl.toFixed(2)}px, right ${f.dr.toFixed(2)}px (card ${f.w}px, section ${f.W}px)`);
  expect(Math.abs(f.rootTop), 'the section is pinned at the top').toBeLessThanOrEqual(1);
  expect(Math.abs(f.dl), 'last card left edge flush').toBeLessThanOrEqual(1);
  expect(Math.abs(f.dr), 'last card right edge flush').toBeLessThanOrEqual(1);
});

test('S03 last card flush when the ride ends, after a resize to 1280×800', async ({ page }) => {
  await open(page);
  await lastCardFlush(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);                       // ScrollTrigger's own resize refresh is debounced
  await page.evaluate(() => { window.__kn.ScrollTrigger.refresh(); window.__kn.lenis?.resize?.(); });
  await frames(page, 2);
  expect(await VH(page)).toBe(800);
  const f = await lastCardFlush(page);
  note('last card after resize', `left ${f.dl.toFixed(2)}px, right ${f.dr.toFixed(2)}px (card ${f.w}px, section ${f.W}px)`);
  expect(Math.abs(f.rootTop), 'the section is pinned at the top').toBeLessThanOrEqual(1);
  expect(Math.abs(f.dl), 'last card left edge flush').toBeLessThanOrEqual(1);
  expect(Math.abs(f.dr), 'last card right edge flush').toBeLessThanOrEqual(1);
});

test("S03 portal starts exactly where the ride ends ('s03-portal'.start = 's03'.start + 3 × VH)", async ({ page }) => {
  await open(page);
  const { t, vh } = await ride(page);
  const portal = await mustTrig(page, 's03-portal');
  const s04 = await mustTrig(page, 's04');
  note('portal', `${portal.start.toFixed(1)}–${portal.end.toFixed(1)} (ride ends ${(t.start + RIDE_CARDS * vh).toFixed(1)}; s03 pin ends ${t.end.toFixed(1)})`);
  expect(Math.abs(portal.start - (t.start + RIDE_CARDS * vh))).toBeLessThanOrEqual(1);
  expect(Math.abs(portal.end - t.end), 'the portal ends with the pin').toBeLessThanOrEqual(1);
  expect(portal.start, 'the portal is not inside S04 (the §3.4 bug)').toBeLessThan(s04.start);
});

test('S03 at the end of the pin: sign fills the frame, bloom flat, readout at 285', async ({ page }) => {
  await open(page);
  const { t } = await ride(page);
  await scrollToY(page, t.end);
  const s = await page.evaluate(() => {
    const sign = document.querySelector('.card--osaka .card__sign')?.getBoundingClientRect();
    const bloom = document.querySelector('.s03 .bloom');
    const bcs = bloom && getComputedStyle(bloom);
    return { sign: sign && { left: sign.left, top: sign.top, right: sign.right, bottom: sign.bottom },
             W: document.documentElement.clientWidth, H: document.documentElement.clientHeight,
             bloomOpacity: bcs ? +bcs.opacity : null, bloomVisibility: bcs?.visibility,
             readout: document.querySelector('.s03 .speed__value')?.textContent.trim() };
  });
  expect(s.sign, '.card--osaka .card__sign exists').toBeTruthy();
  note('sign', `${s.sign.left.toFixed(1)}, ${s.sign.top.toFixed(1)} → ${s.sign.right.toFixed(1)}, ${s.sign.bottom.toFixed(1)}; bloom ${s.bloomOpacity}; readout "${s.readout}"`);
  expect.soft(s.sign.left, 'sign covers the left edge').toBeLessThanOrEqual(0.5);
  expect.soft(s.sign.top, 'sign covers the top edge').toBeLessThanOrEqual(0.5);
  expect.soft(s.sign.right, 'sign covers the right edge').toBeGreaterThanOrEqual(s.W - 0.5);
  expect.soft(s.sign.bottom, 'sign covers the bottom edge').toBeGreaterThanOrEqual(s.H - 0.5);
  expect.soft(s.bloomOpacity, '.s03 .bloom opacity').toBe(1);
  expect.soft(s.bloomVisibility, '.s03 .bloom visibility').toBe('visible');
  expect.soft(s.readout, 'speed readout').toBe('285');
});

test('HUD flips paper → night at 80% of the ride, and back when scrolling up', async ({ page }) => {
  await open(page);
  const { t, rideLen } = await ride(page);
  const flipAt = t.start + 0.8 * rideLen;
  const mode = () => page.locator('.hud').getAttribute('data-mode');
  const seq = [];
  for (const [y, want] of [[t.start, 'paper'], [flipAt - 4, 'paper'], [flipAt + 4, 'night'], [t.end, 'night'],
                           [flipAt + 4, 'night'], [flipAt - 4, 'paper'], [t.start, 'paper']]) {
    await scrollToY(page, y);
    const got = await mode();
    seq.push(`${Math.round(y)}:${got}`);
    expect.soft(got, `HUD at y ${Math.round(y)} (flip at ${Math.round(flipAt)})`).toBe(want);
  }
  note('sequence', seq.join(' → '));
});

test('Keyboard focus moved into an off-screen card lands the card at x ≈ 0', async ({ page }) => {
  await open(page);
  const { t, rideLen, n } = await ride(page);
  await scrollToY(page, t.start);
  // Pick the furthest card that has a focusable element; fall back to a heading made focusable.
  const target = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.s03 .card')];
    const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
    for (let i = cards.length - 1; i >= 1; i--) {
      const el = cards[i].querySelector(FOCUSABLE);
      if (el) { el.setAttribute('data-kn-focus', ''); return { i, fallback: false, tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40) }; }
    }
    const i = cards.length - 1, h = cards[i].querySelector('h2, h3') || cards[i];
    h.setAttribute('tabindex', '-1'); h.setAttribute('data-kn-focus', '');
    return { i, fallback: true, tag: h.tagName, text: h.textContent.trim().slice(0, 40) };
  });
  note('focus target', `card ${target.i} ${target.tag} "${target.text}"${target.fallback ? ' (no focusable element in cards 1–3; used a heading with tabindex=-1)' : ''}`);
  const before = await page.evaluate((i) => document.querySelectorAll('.s03 .card')[i].getBoundingClientRect().left, target.i);
  expect(before, 'the card starts off screen').toBeGreaterThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) - 1);
  await page.locator('[data-kn-focus]').focus();
  await page.evaluate(() => window.__kn.ScrollTrigger.update());
  await frames(page, 2);
  await settleScroll(page);
  const after = await page.evaluate((i) => ({ left: document.querySelectorAll('.s03 .card')[i].getBoundingClientRect().left, y: window.scrollY }), target.i);
  const wantY = t.start + rideLen * (target.i / (n - 1));
  note('card lands', `x ${after.left.toFixed(2)}px at y ${after.y} (expected y ${Math.round(wantY)})`);
  expect(Math.abs(after.left), 'focused card lands at x ≈ 0').toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - wantY), 'scroll lands on the card position of the ride').toBeLessThanOrEqual(2);
});
