/* S04 東京 Hyper-Density · the DOM rain and the billboard's off-screen pause.
   Called by the core (scene04) only when motion is on; the static page keeps a few still streaks
   (CSS) and a still billboard. The rain is one 2D canvas inside .rain, drawn on gsap.ticker:
   streaks fall at speed × (1 − freeze), with a small boost from scroll velocity, and as the core
   tweens --freeze 0 → 1 they slow, fade and gather into two hairlines at exactly 28% and 72% of
   the width — S05's column rules (the match cut, spec R12). While the WebGL stage draws the rain
   (.s04.gl-ready) this module draws nothing. */
import { gsap } from 'gsap';
import { scroll } from '../app.js';

const LINES = [0.28, 0.72];
const TINTS = ['#E4EAF4', '#E4EAF4', '#E4EAF4', '#E4EAF4', '#8FF6FF', '#FF7FA6', '#FF9A7A'];
const HAIRLINE = '#E4EAF4';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function initS04(root, { fine = true, signal } = {}) {
  const rain = root?.querySelector('.rain');
  const billboard = root?.querySelector('.billboard');
  if (!rain || signal?.aborted) return { destroy() {} };

  const canvas = document.createElement('canvas');
  canvas.className = 'rain__canvas';
  rain.append(canvas);
  rain.classList.add('is-live');                          // hides the still CSS streaks
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1, drops = [], groups = [];
  let visible = true, boost = 0, frozenDrawn = false, cleared = false, dead = false;

  // A drop: x (fraction of the width, before wind drift), y (px, head), depth z (0 far … 1 near).
  function place(d, anywhere) {
    d.x = -0.1 + Math.random() * 1.1;
    d.len = (0.02 + 0.055 * d.z) * H;
    d.y = anywhere ? Math.random() * (H + d.len) : -Math.random() * H * 0.25;
    d.speed = (0.95 + 1.55 * d.z) * H * (0.85 + Math.random() * 0.3);   // px per second
    return d;
  }
  function seed() {
    const count = Math.round(Math.min(fine ? 340 : 120, (W * H) / (fine ? 6400 : 14000)));
    drops = [];
    const buckets = new Map();
    for (let i = 0; i < count; i++) {
      const z = Math.random() ** 1.6;                     // most rain is far and faint
      const tint = Math.floor(Math.random() * TINTS.length);
      const band = z < 0.34 ? 0 : z < 0.7 ? 1 : 2;
      drops.push(place({ z }, true));
      const key = tint * 3 + band;
      if (!buckets.has(key)) buckets.set(key, { color: TINTS[tint], width: [0.7, 1.05, 1.5][band],
                                                alpha: [0.16, 0.26, 0.36][band], idx: [] });
      buckets.get(key).idx.push(i);
    }
    groups = [...buckets.values()];
  }
  function resize() {
    const w = rain.clientWidth, h = rain.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.5);
    W = w; H = h;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    frozenDrawn = false;
    seed();
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // The two hairlines: drawn top-down as the rain freezes, snapped to device pixels so they sit
  // exactly on the 1px rules of .seam.rules (left: 28% / 72%) that fade in over them.
  function hairlines(f) {
    const a = smooth(0.34, 1, f), grow = smooth(0.3, 0.86, f);
    if (a <= 0 || grow <= 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = Math.max(1, Math.round(dpr)), y1 = grow * canvas.height;
    for (const L of LINES) {
      const x = Math.round(L * W * dpr);
      ctx.globalAlpha = 0.52 * a;
      ctx.fillStyle = HAIRLINE;
      ctx.fillRect(x, 0, w, y1);
      if (grow < 1) {                                     // the bright tip still tracing the line down
        const tip = 0.12 * canvas.height;
        const g = ctx.createLinearGradient(0, y1 - tip, 0, y1);
        g.addColorStop(0, 'rgba(242,244,248,0)'); g.addColorStop(1, 'rgba(242,244,248,1)');
        ctx.globalAlpha = 0.5 * a * (1 - grow);
        ctx.fillStyle = g;
        ctx.fillRect(x - w, y1 - tip, w * 3, tip);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(time, deltaMs) {
    if (!visible || !W) return;
    if (root.classList.contains('gl-ready')) {            // the stage draws the rain now
      if (!cleared) { clear(); cleared = true; }
      frozenDrawn = false;
      return;
    }
    cleared = false;
    const f = clamp01(parseFloat(rain.style.getPropertyValue('--freeze')) || 0);
    if (f >= 0.999) {                                     // fully frozen: a still frame, draw it once
      if (!frozenDrawn) { clear(); hairlines(1); frozenDrawn = true; }
      return;
    }
    frozenDrawn = false;

    const dt = Math.min(deltaMs, 50) / 1000;
    const v = Math.min(Math.abs(scroll.velocity || 0) / 2600, 1);
    boost += (v - boost) * Math.min(1, dt * 5);
    const run = (1 - f) * (1 + 0.8 * boost);             // speed × (1 − freeze), nudged by the scroll
    const gather = smooth(0.22, 0.92, f);                 // pull toward the nearest hairline
    const fade = (1 - gather) ** 1.4 * (1 - 0.35 * smooth(0.5, 1, f));
    const wind = 0.13 * (1 - f);                          // slant straightens as the rain stops
    const stretch = (1 + 1.2 * boost) * (1 + 2.4 * gather);

    clear();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    for (const g of groups) {
      ctx.strokeStyle = g.color; ctx.lineWidth = g.width;
      ctx.globalAlpha = g.alpha * fade;
      ctx.beginPath();
      for (const i of g.idx) {
        const d = drops[i];
        d.y += d.speed * run * dt;
        const len = d.len * stretch;
        if (d.y - len > H) place(d, false);
        const x0 = d.x * W + wind * d.y;                  // wind drift: the drop falls on a slant
        const target = (x0 < W / 2 ? LINES[0] : LINES[1]) * W;
        const x = x0 + (target - x0) * gather;
        ctx.moveTo(x - wind * len, d.y - len);
        ctx.lineTo(x, d.y);
      }
      if (ctx.globalAlpha > 0.002) ctx.stroke();
    }
    hairlines(f);
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(rain);
  // Off screen: stop drawing, and pause the billboard's loop (CSS reads .is-paused).
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    billboard?.classList.toggle('is-paused', !visible);
    if (!visible) { clear(); frozenDrawn = false; }
  }, { rootMargin: '64px 0px' });
  io.observe(root);
  gsap.ticker.add(frame);

  function destroy() {
    if (dead) return;
    dead = true;
    gsap.ticker.remove(frame);
    io.disconnect(); ro.disconnect();
    canvas.remove();
    rain.classList.remove('is-live');
    billboard?.classList.remove('is-paused');
    signal?.removeEventListener('abort', destroy);
  }
  signal?.addEventListener('abort', destroy, { once: true });
  return { destroy };
}
