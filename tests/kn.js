/* Shared harness helpers. Not a spec file (the config only runs *.spec.js).

   Scrolling is deterministic: Lenis (when present) jumps with { immediate, force }, otherwise the
   window scrolls instantly; then ScrollTrigger.update() and two animation frames, and (by default)
   a wait until ScrollTrigger stops treating the page as scrolling, so velocity-based anticipatePin
   can't pin early. Every scrubbed tween in the choreography is `scrub: true`, so the page is fully
   rendered for that position. */
import { test as base, expect } from '@playwright/test';

export { expect };

/** test() with an automatic page-error collector: `errors` lists pageerror + console.error lines. */
export const test = base.extend({
  errors: [async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    await use(errors);
    if (errors.length) testInfo.annotations.push({ type: 'page errors', description: errors.join('\n') });
  }, { auto: true }],
});

/** Record a measured value in the report (list reporter prints annotations in the HTML report; we also log). */
export function note(type, description) {
  test.info().annotations.push({ type, description: String(description) });
  console.log(`  · ${test.info().title} — ${type}: ${description}`);
}

export const frames = (page, n = 2) => page.evaluate((n) => new Promise((resolve) => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);

/** Load the page with the harness hook and wait until the choreography is built and fonts are in. */
export async function open(page, { query = '' } = {}) {
  const q = query ? '&' + query.replace(/^[?&]/, '') : '';
  for (let attempt = 1; ; attempt++) {
    try { await page.goto('/?harness' + q); break; }
    catch (e) {                                           // a loaded machine occasionally aborts the first load
      if (attempt >= 2 || !/ERR_ABORTED|frame was detached|ERR_CONNECTION/.test(e.message)) throw e;
      await page.waitForTimeout(1000);
    }
  }
  try {
    await page.waitForFunction(() => !!(window.__kn && window.__kn.ScrollTrigger), null, { timeout: 20_000 });
  } catch {
    throw new Error('window.__kn never appeared: the page failed to boot (see the "page errors" annotation)');
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await frames(page, 3);
  await page.evaluate(() => window.__kn.lenis?.resize?.());
}

/** Scroll to y (px) deterministically and return the resulting window.scrollY.
    An instant jump looks like a huge scroll velocity, and pins created with anticipatePin engage early
    while ScrollTrigger thinks the page is still scrolling. With `settle` (the default) we wait until
    ScrollTrigger.isScrolling() is false (≈ 200 ms after the last scroll event) and update once more, so
    every measurement is the at-rest state for that position. */
export async function scrollToY(page, y, { settle = true } = {}) {
  const actual = await page.evaluate((y) => {
    const kn = window.__kn, lenis = kn?.lenis;
    const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const want = Math.max(0, Math.min(y, max));
    if (lenis) {
      lenis.resize?.();                                     // Lenis' limit is debounced; refresh it first
      lenis.scrollTo(want, { immediate: true, force: true });
    }
    if (!lenis || Math.abs(window.scrollY - want) > 1) window.scrollTo({ top: want, left: 0, behavior: 'instant' });
    kn?.ScrollTrigger.update();
    return window.scrollY;
  }, y);
  await frames(page, 2);
  if (settle) await settleScroll(page);
  return actual;
}

/** Wait until ScrollTrigger no longer considers the page scrolling, then update and render. */
export async function settleScroll(page) {
  await page.evaluate(async () => {
    const ST = window.__kn?.ScrollTrigger;
    if (!ST) return;
    const t0 = performance.now();
    while (ST.isScrolling() && performance.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 60));
      ST.update();
    }
    ST.update();
  });
  await frames(page, 2);
}

/** { start, end } of a ScrollTrigger by id, or null. */
export const trig = (page, id) => page.evaluate((id) => {
  const s = window.__kn.ScrollTrigger.getById(id);
  return s ? { start: s.start, end: s.end } : null;
}, id);

export async function mustTrig(page, id) {
  const t = await trig(page, id);
  expect(t, `ScrollTrigger '${id}' should exist`).not.toBeNull();
  return t;
}

export const VH = (page) => page.evaluate(() => document.documentElement.clientHeight);
export const VW = (page) => page.evaluate(() => document.documentElement.clientWidth);

/** getBoundingClientRect of the first match as a plain object (null if missing). */
export const rect = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, sel);

export async function mustRect(page, sel) {
  const r = await rect(page, sel);
  expect(r, `element ${sel} should exist`).not.toBeNull();
  return r;
}

/** Computed opacity / visibility of the first match. */
export const look = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { opacity: +cs.opacity, visibility: cs.visibility, display: cs.display, transform: cs.transform };
}, sel);

/** Horizontal overflow of the page: scrollWidth beyond the viewport, and whether the window can scroll sideways. */
export const overflowX = (page) => page.evaluate(() => {
  const de = document.documentElement;
  const before = window.scrollX;
  window.scrollTo({ left: 10_000, top: window.scrollY, behavior: 'instant' });
  const moved = window.scrollX;
  window.scrollTo({ left: before, top: window.scrollY, behavior: 'instant' });
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, bodyScrollWidth: document.body.scrollWidth,
           scrollX: moved, visualWidth: window.visualViewport?.width ?? de.clientWidth, innerWidth: window.innerWidth };
});

/** Scroll the whole page top to bottom in steps (half a viewport by default). */
export async function scrollThrough(page, { step = 0.5, back = false } = {}) {
  const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: document.documentElement.clientHeight }));
  const ys = [];
  for (let y = 0; y <= h - vh; y += Math.max(50, step * vh)) ys.push(Math.round(y));
  ys.push(h - vh);
  for (const y of ys) await scrollToY(page, y, { settle: false });
  if (back) for (const y of ys.reverse()) await scrollToY(page, y, { settle: false });
}

/** Assert no horizontal overflow at the top, at every scene target and at the end of the page. */
export async function checkNoOverflow(page) {
  const ids = ['s01', 's02', 'field-notes', 's03', 's04', 's05', 's06'];
  const ys = [0];
  for (const id of ids) ys.push(await page.evaluate((id) => window.__kn.sceneTarget(id), id));
  ys.push(await page.evaluate(() => document.documentElement.scrollHeight));
  const bad = [];
  let widest = 0;
  for (const y of ys) {
    await scrollToY(page, y);
    const o = await overflowX(page);
    widest = Math.max(widest, o.scrollWidth, o.bodyScrollWidth);
    if (o.scrollWidth > o.clientWidth || o.bodyScrollWidth > o.clientWidth || o.scrollX !== 0 || o.visualWidth > o.innerWidth + 0.5)
      bad.push(`y ${Math.round(y)}: scrollWidth ${o.scrollWidth}, body ${o.bodyScrollWidth}, clientWidth ${o.clientWidth}, scrollX after a sideways scroll ${o.scrollX}, visual ${o.visualWidth}`);
  }
  note('widest scrollWidth', `${widest}px over ${ys.length} positions`);
  expect(bad, 'no horizontal overflow at any scene').toEqual([]);
}

/** Screenshot one full-width row of the viewport at y (CSS px) and return its pixels as [r, g, b]. */
export async function sampleRow(page, y) {
  const W = await VW(page);
  const png = await page.screenshot({ clip: { x: 0, y: Math.round(y), width: W, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, 1).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }, png.toString('base64'));
}

/** Largest channel difference between two [r, g, b] colours. */
export const colourDist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
