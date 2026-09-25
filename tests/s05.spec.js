/* S05 匠 Takumi · depth by speed. The core translates each .plate by y = (1 − s)·D·(p − ½) over the
   'top bottom' → 'bottom top' trip of length D, so a plate's screen position moves by
   Δscreen = −Δscroll + Δy = −s·Δscroll: its apparent speed is −Δscreen/Δscroll = s
   (equivalently 1 − Δy/Δscroll). At the centred frame (p = ½) every plate is at its resting layout. */
import { test, expect, open, note, scrollToY, mustTrig, VH } from './kn.js';

const SPEEDS = { kintsugi: 0.92, katana: 1.10, washi: 0.96 };

const plates = (page) => page.evaluate(() => [...document.querySelectorAll('.s05 .craft')].map(c => {
  const p = c.querySelector('.plate'), r = p.getBoundingClientRect();
  const m = new DOMMatrixReadOnly(getComputedStyle(p).transform === 'none' ? undefined : getComputedStyle(p).transform);
  return { craft: c.dataset.craft, speed: +c.dataset.speed, top: r.top, ty: m.m42, tx: m.m41 };
}));

test('S05 apparent speeds 0.920 / 1.100 / 0.960', async ({ page }) => {
  await open(page);
  const t = await mustTrig(page, 's05-kintsugi'), vh = await VH(page);
  const mid = (t.start + t.end) / 2;
  const y1 = await scrollToY(page, mid - 0.3 * vh);
  const a = await plates(page);
  const y2 = await scrollToY(page, mid + 0.3 * vh);
  const b = await plates(page);
  expect(a.length, 'three crafts').toBe(3);
  const ds = y2 - y1;
  const got = a.map((p, i) => ({ craft: p.craft, speed: -(b[i].top - p.top) / ds, viaY: 1 - (b[i].ty - p.ty) / ds }));
  note('apparent speeds', got.map(g => `${g.craft} ${g.speed.toFixed(3)}`).join(' / '));
  for (const g of got) {
    expect.soft(g.speed, `${g.craft} apparent speed`).toBeCloseTo(SPEEDS[g.craft], 2);
    expect.soft(Math.abs(g.speed - g.viaY), `${g.craft}: screen motion comes from the plate translate only`).toBeLessThanOrEqual(0.002);
  }
  expect(a.map(p => [p.craft, p.speed])).toEqual([['kintsugi', 0.92], ['katana', 1.1], ['washi', 0.96]]);
});

test('S05 resting layout exact at the centred frame', async ({ page }) => {
  await open(page);
  const t = await mustTrig(page, 's05-kintsugi');
  await scrollToY(page, (t.start + t.end) / 2);
  const ps = await plates(page);
  const centre = await page.evaluate(() => {
    const r = document.querySelector('.s05').getBoundingClientRect();
    return (r.top + r.bottom) / 2 - document.documentElement.clientHeight / 2;
  });
  note('plate translate at the centred frame', ps.map(p => `${p.craft} ${p.ty.toFixed(2)}px`).join(' / ') + `; section centre offset ${centre.toFixed(2)}px`);
  expect(Math.abs(centre), 'the section is centred in the viewport').toBeLessThanOrEqual(1);
  for (const p of ps) {
    expect.soft(Math.abs(p.ty), `${p.craft} plate y`).toBeLessThanOrEqual(0.5);
    expect.soft(Math.abs(p.tx), `${p.craft} plate x`).toBeLessThanOrEqual(0.5);
  }
});
