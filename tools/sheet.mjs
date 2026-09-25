#!/usr/bin/env node
/* Contact sheet: many scroll positions of the running page composed into one image, for reviews.

   node tools/sheet.mjs --out .tmp/sheet/desktop.png [--size 1280x720] [--cols 4] [--touch] [--reduced]
                        [--url http://localhost:5173/?harness] [--at s01:0,s01:0.5,...] [--wait 350]
   Default positions walk the whole piece: every pinned scene at several progress points, plus the
   interlude, S05 and the S06 curtain and settle. Each frame is labelled with its position. */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const flag = (n) => args.includes('--' + n);
const touch = flag('touch');
const [W, H] = String(opt('size', touch ? '390x844' : '1280x720')).split('x').map(Number);
const cols = +opt('cols', touch ? 6 : 4);
const out = opt('out', '.tmp/sheet/sheet.png');
const url = opt('url', 'http://localhost:5173/?harness');
const DEFAULT = touch || flag('reduced')
  ? '#s01,vh:0.6,#s02,vh:3,#field-notes,vh:5.2,#s03,vh:7.4,#s04,vh:9.5,#s05,vh:11.4,vh:12.2,#s06,end'
  : 's01:0,s01:0.35,s01:0.7,s01:1,s02:0,s02:0.3,s02:0.6,s02:0.9,#field-notes,y+:0.8,s03:0,s03:0.33,s03:0.66,s03:1,s03-portal:0.4,s03-portal:0.8,s04:0.1,s04:0.45,s04:0.75,s04:1,s05-katana:0.3,s05-katana:0.5,s05-katana:0.75,s06:-0.5,s06:0,end';
const at = String(opt('at', DEFAULT)).split(',');
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch,
  reducedMotion: flag('reduced') ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

const shots = [];
let lastY = 0;
for (const pos of at) {
  const y = await page.evaluate(([pos, lastY]) => {
    const kn = window.__kn, vh = document.documentElement.clientHeight;
    const max = document.documentElement.scrollHeight - vh;
    if (pos === 'end') return max;
    if (pos.startsWith('y+:')) return lastY + +pos.slice(3) * vh;
    if (pos.startsWith('vh:')) return +pos.slice(3) * vh;
    if (pos.startsWith('#')) return kn ? kn.sceneTarget(pos.slice(1)) : document.getElementById(pos.slice(1)).getBoundingClientRect().top + scrollY;
    const [id, p] = pos.split(':');
    const st = kn?.ScrollTrigger.getById(id);
    if (!st) return null;
    return st.start + (+p) * (st.end - st.start || vh);
  }, [pos, lastY]);
  if (y == null) continue;
  lastY = y;
  await page.evaluate((y) => { const l = window.__kn?.lenis; l ? l.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y); window.__kn?.ScrollTrigger.update(); }, y);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(pos === 'end' || pos === 's06:0' ? 3600 : +opt('wait', 350));
  shots.push({ label: `${pos}  y=${Math.round(y)}`, png: (await page.screenshot()).toString('base64') });
}

const sheet = await ctx.newPage();
await sheet.setViewportSize({ width: 1600, height: 900 });
const cellW = Math.floor((1600 - (cols + 1) * 8) / cols);
await sheet.setContent(`<body style="margin:0;background:#222;font:12px system-ui;color:#ddd">
  <div style="display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:8px;padding:8px">
  ${shots.map(s => `<figure style="margin:0"><img style="width:100%;display:block" src="data:image/png;base64,${s.png}">
    <figcaption style="padding:2px 0">${s.label}</figcaption></figure>`).join('')}</div></body>`);
await sheet.waitForTimeout(300);
await sheet.screenshot({ path: out, fullPage: true });
console.log(`${out}: ${shots.length} frames${errors.length ? '  ERRORS: ' + errors.join(' | ') : ''}`);
await browser.close();
