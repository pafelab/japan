/* Seam sheets (spec §3.2): while the incoming section enters, the flat part of its sheet (the sheet's
   height minus the 35svh feather) must cover the section's moving top edge; the sheet is translated,
   never faded, and has left the section 0.2 viewport heights into the pin. The outgoing section must
   end on the same flat frame (S01 fog, S03 bloom) and sit flush against the incoming one. */
import { test, expect, open, note, scrollToY, mustTrig, VH } from './kn.js';

const POINTS = [0.9, 0.7, 0.5, 0.3, 0.15];

async function sheetState(page, { section, sheet, prev, prevFrame }) {
  return page.evaluate(({ section, sheet, prev, prevFrame }) => {
    const s = document.querySelector(section), sh = document.querySelector(sheet);
    const p = document.querySelector(prev), pf = document.querySelector(prevFrame);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:35svh;width:1px;top:0;left:0';
    document.body.append(probe);
    const feather = probe.getBoundingClientRect().height;
    probe.remove();
    const S = s.getBoundingClientRect(), SH = sh.getBoundingClientRect(), P = p.getBoundingClientRect();
    const cs = getComputedStyle(sh), pcs = getComputedStyle(pf);
    return { edge: S.top, sheetTop: SH.top, sheetBottom: SH.bottom, flatBottom: SH.bottom - feather,
             opacity: +cs.opacity, visibility: cs.visibility, prevBottom: P.bottom,
             prevFrameOpacity: +pcs.opacity, prevFrameVisibility: pcs.visibility };
  }, { section, sheet, prev, prevFrame });
}

const HANDOFFS = [
  { name: 'S01 → S02 fog sheet', id: 's02', section: '.s02', sheet: '.s02 .fog', prev: '.s01', prevFrame: '.s01 .fog' },
  { name: 'S03 → S04 bloom sheet', id: 's04', section: '.s04', sheet: '.s04 .bloom', prev: '.s03', prevFrame: '.s03 .bloom' },
];

for (const h of HANDOFFS) {
  test(`Seam sheets cover the section edge during entry: ${h.name} (90 / 70 / 50 / 30 / 15%)`, async ({ page }) => {
    await open(page);
    const t = await mustTrig(page, h.id), vh = await VH(page);
    const rows = [];
    for (const f of POINTS) {
      await scrollToY(page, t.start - f * vh);
      const s = await sheetState(page, h);
      rows.push({ f, ...s, margin: s.flatBottom - s.edge });
    }
    note('flat-part margin below the edge', rows.map(r => `${r.f * 100}%: ${r.margin.toFixed(1)}px`).join(' · '));
    for (const r of rows) {
      const at = `at ${r.f * 100}% of the entry`;
      expect.soft(Math.abs(r.edge - r.f * vh), `${at}: the section edge is where we scrolled it (${r.edge.toFixed(1)}px)`).toBeLessThanOrEqual(1.5);
      expect.soft(r.visibility, `${at}: sheet is visible`).toBe('visible');
      expect.soft(r.opacity, `${at}: sheet is opaque (translated, never faded)`).toBe(1);
      expect.soft(r.sheetTop, `${at}: sheet top is at or above the edge`).toBeLessThanOrEqual(r.edge + 0.5);
      expect.soft(r.margin, `${at}: flat part covers the edge`).toBeGreaterThan(0);
      expect.soft(r.prevFrameOpacity, `${at}: ${h.prevFrame} is fully on (the outgoing frame)`).toBe(1);
      expect.soft(Math.abs(r.prevBottom - r.edge), `${at}: ${h.prev} sits flush on the edge (gap ${(r.edge - r.prevBottom).toFixed(2)}px)`).toBeLessThanOrEqual(1);
    }
  });

  test(`Seam sheets are gone 0.2 viewport heights into the pin: ${h.name}`, async ({ page }) => {
    await open(page);
    const t = await mustTrig(page, h.id), vh = await VH(page);
    await scrollToY(page, t.start + 0.2 * vh);
    const s = await sheetState(page, h);
    note('sheet bottom vs section top', `${(s.sheetBottom - s.edge).toFixed(2)}px`);
    expect(Math.abs(s.edge), 'the section is pinned at the top').toBeLessThanOrEqual(1);
    expect(s.sheetBottom, 'the sheet has left the section entirely').toBeLessThanOrEqual(s.edge + 0.5);
  });
}
