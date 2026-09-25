/* S01 鳥居 Threshold · the camera dolly clears the gate (spec §3.3, contract §4 S01).
   At scroll 0 every plane is at scale 1, so .opening's rect is its layout box; cover is computed from
   it exactly as the core does. At the end of the pin the torii layer is at cover × 1.08, so the scaled
   opening must contain the viewport's left, right and top edges (the bottom is ignored: no sill). */
import { test, expect, open, note, scrollToY, mustTrig } from './kn.js';

const EYE = { x: 0.5, y: 0.6 };

async function measureOpening(page) {
  return page.evaluate((EYE) => {
    const root = document.querySelector('.s01'), opening = document.querySelector('.s01 .opening');
    if (!root || !opening) return null;
    const R = root.getBoundingClientRect(), O = opening.getBoundingClientRect();
    const o = { l: O.left - R.left, t: O.top - R.top, r: O.right - R.left, b: O.bottom - R.top };
    const W = root.offsetWidth, H = root.offsetHeight;
    const ox = o.l + EYE.x * (o.r - o.l), oy = o.t + EYE.y * (o.b - o.t);
    const cover = Math.max(1, ox / (ox - o.l), (W - ox) / (o.r - ox), oy / (oy - o.t));
    const svh = H / 100;
    return { o, W, H, ox, oy, cover, geom: { width: (o.r - o.l) / svh, top: o.t / svh, bottom: o.b / svh, centre: (o.l + o.r) / 2 - W / 2 } };
  }, EYE);
}

async function gateClears(page, expected) {
  await open(page);
  await scrollToY(page, 0);
  const m = await measureOpening(page);
  expect(m, '.s01 .opening exists').not.toBeNull();
  note('cover', `${m.cover.toFixed(2)} (spec ${expected.toFixed(2)})`);
  note('opening', `${m.geom.width.toFixed(2)}svh wide, top ${m.geom.top.toFixed(2)}svh, bottom ${m.geom.bottom.toFixed(2)}svh, centre offset ${m.geom.centre.toFixed(1)}px`);

  const t = await mustTrig(page, 's01');
  await scrollToY(page, t.end);
  const end = await page.evaluate(() => {
    const r = document.querySelector('.s01 .opening').getBoundingClientRect();
    const torii = document.querySelector('.s01 .torii');
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
             W: document.documentElement.clientWidth, H: document.documentElement.clientHeight,
             scale: window.__kn.gsap.getProperty(torii, 'scaleX') };
  });
  note('end of pin', `torii scale ${(+end.scale).toFixed(3)} (cover × 1.08 = ${(m.cover * 1.08).toFixed(3)}); opening ${end.left.toFixed(1)} … ${end.right.toFixed(1)} × top ${end.top.toFixed(1)}`);
  expect(end.left, 'left pillar is out of frame (opening.left ≤ 0)').toBeLessThanOrEqual(0.5);
  expect(end.right, 'right pillar is out of frame (opening.right ≥ viewport width)').toBeGreaterThanOrEqual(end.W - 0.5);
  expect(end.top, 'the tie-beam is out of frame (opening.top ≤ 0)').toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(m.cover - expected), `cover ≈ ${expected} when the gate follows the contract geometry (got ${m.cover.toFixed(3)})`).toBeLessThanOrEqual(0.02);
}

const CASES = [
  ['16:9', 1920, 1080, 5.08],
  ['21:9', 2560, 1080, 6.77],
  ['4:3', 1440, 1080, 3.81],
  ['3:4 tablet', 810, 1080, 2.22],
];

for (const [label, width, height, cover] of CASES) {
  test.describe(`${width}×${height}`, () => {
    test.use({ viewport: { width, height } });
    test(`S01 gate clears the frame at the end of the pin: ${label} (${width}×${height}, cover ${cover})`, async ({ page }) => {
      await gateClears(page, cover);
    });
  });
}

test('S01 gate clears the frame at the end of the pin: phone (390×844, cover 2.22)', { tag: '@phone' }, async ({ page }) => {
  await gateClears(page, 2.22);
});

test.describe('2560×1080', () => {
  test.use({ viewport: { width: 2560, height: 1080 } });
  test("v1's fixed 5.5 at 2560×1080 fails: the pillars stay in frame", async ({ page }) => {
    await open(page);
    await scrollToY(page, 0);
    // Scale the torii layer to v1's fixed 5.5 about the same vanishing point, measure, restore.
    const r = await page.evaluate(() => {
      const { gsap } = window.__kn, torii = document.querySelector('.s01 .torii');
      const sx = gsap.getProperty(torii, 'scaleX'), sy = gsap.getProperty(torii, 'scaleY');
      gsap.set(torii, { scaleX: 5.5, scaleY: 5.5 });
      const o = document.querySelector('.s01 .opening').getBoundingClientRect();
      gsap.set(torii, { scaleX: sx, scaleY: sy });
      return { left: o.left, right: o.right, W: document.documentElement.clientWidth };
    });
    note('at 5.5×', `opening ${r.left.toFixed(1)} … ${r.right.toFixed(1)} of ${r.W}`);
    expect(r.left > 0.5 || r.right < r.W - 0.5, 'at 5.5× a pillar is still inside the frame').toBe(true);
  });
});
