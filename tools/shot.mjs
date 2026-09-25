#!/usr/bin/env node
/* Screenshot the running page at chosen scroll positions (for visual self-checks during the build).

   node tools/shot.mjs --at 0,s01:0.5,s02:1,#field-notes,y:12000 --out shots/s01 [options]

   Positions (comma-separated):
     y:N        absolute scroll position in px          vh:N    N viewport heights
     ID:P       ScrollTrigger id at progress P (0–1)     e.g. s01:0.5  s03-portal:1  s04:0.9
     #id        where the page's own navigation lands for that scene or element id
   Options:
     --url U        default http://localhost:5173/?harness   (the dev server; ?harness exposes window.__kn)
     --size WxH     default 1440x900         --dpr N   device pixel ratio, default 1 (0.5 = smaller files)
     --touch        phone profile (390x844 unless --size, touch, coarse pointer)
     --reduced      prefers-reduced-motion: reduce
     --wait MS      extra wait after each scroll, default 250 (use 3600 to see the S06 settle finish)
     --full         full-page screenshot instead of the viewport (only sensible with --reduced)
     --eval JS      run this in the page after load (e.g. "localStorage.clear()")
   Prints console errors and page errors. Files: <out>-<label>.png
*/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] ?? true); };
const flag = (name) => args.includes('--' + name);

const touch = flag('touch');
const [W, H] = String(opt('size', touch ? '390x844' : '1440x900')).split('x').map(Number);
const url = opt('url', 'http://localhost:5173/?harness');
const out = opt('out', 'shots/shot');
const wait = +opt('wait', 250);
const at = String(opt('at', '0')).split(',').map(s => s.trim()).filter(Boolean);
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: +opt('dpr', 1),
  hasTouch: touch, isMobile: touch, reducedMotion: flag('reduced') ? 'reduce' : 'no-preference',
});
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
if (opt('eval', null)) await page.evaluate(opt('eval'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

for (const pos of at) {
  const y = await page.evaluate((pos) => {
    const kn = window.__kn, vh = document.documentElement.clientHeight;
    if (/^\d+(\.\d+)?$/.test(pos)) return +pos;
    if (pos.startsWith('y:')) return +pos.slice(2);
    if (pos.startsWith('vh:')) return +pos.slice(3) * vh;
    if (pos.startsWith('#')) return kn ? kn.sceneTarget(pos.slice(1)) : document.getElementById(pos.slice(1)).getBoundingClientRect().top + scrollY;
    const [id, p] = pos.split(':');
    const st = kn?.ScrollTrigger.getById(id);
    if (!st) throw new Error('no ScrollTrigger with id ' + id + ' (motion off, or not created on this profile?)');
    return st.start + (+p) * (st.end - st.start);
  }, pos);
  await page.evaluate((y) => {
    const l = window.__kn?.lenis;
    if (l) l.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
    window.__kn?.ScrollTrigger.update();
  }, y);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.waitForTimeout(wait);
  const label = pos.replace(/[^\w.-]+/g, '_');
  const file = `${out}-${label}.png`;
  await page.screenshot({ path: file, fullPage: flag('full') });
  const info = await page.evaluate(() => ({ y: Math.round(scrollY), h: document.documentElement.scrollHeight, mode: document.querySelector('.hud')?.dataset.mode, scene: window.__kn?.scroll.scene }));
  console.log(`${file}  y=${info.y}/${info.h}  hud=${info.mode}  scene=${info.scene}`);
}
await browser.close();
