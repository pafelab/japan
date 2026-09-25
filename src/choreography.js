/* choreography.js — Komorebi & Neon v2 · scroll choreography (DOM layer)
   gsap 3.15 + ScrollTrigger · lenis 1.3. Built from the tested blueprint in storyboard §5.5; the
   additions (scene modules, GPS decode, motion toggle, navigation, tiers) are marked "v2 build". */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { emit, scroll, prefs, SCENES } from './app.js';
import { stonesCounter } from './scenes/s02.js';
import { initDeer } from './scenes/s03.js';
import { initS04 } from './scenes/s04.js';

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin, CustomEase);
ScrollTrigger.config({ ignoreMobileResize: true });
CustomEase.create('expressive', '0.16,1,0.3,1');           // the --ease-expressive token, for GSAP

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const VH = () => document.documentElement.clientHeight;   // = svh on mobile; stable while the URL bar moves

// Scroll budgets in viewport heights: the single source of truth for §3.1.
export const BUDGET = { s01: 1.2, s02: 2.0, s03PerCard: 1.0, s03Portal: 1.2, s04: 2.0 };

export { scroll };
let stage = null;                                          // set when the lazy WebGL chunk is ready

// Layout box of el inside ancestor, ignoring transforms (safe to call mid-animation).
function layoutRect(el, ancestor) {
  let l = 0, t = 0;
  for (let n = el; n && n !== ancestor; n = n.offsetParent) { l += n.offsetLeft; t += n.offsetTop; }
  return { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight };
}

// Smallest scale about (ox, oy) that pushes every edge of the rect out of a W×H frame.
// b = Infinity skips the bottom edge (a torii has no sill; the ground may stay in view).
function coverScale({ l, t, r, b }, ox, oy, W, H) {
  return Math.max(1, ox / (ox - l), (W - ox) / (r - ox), oy / (oy - t),
                  Number.isFinite(b) ? (H - oy) / (b - oy) : 0);
}

const pinned = (trigger, len, extra = {}) => ({ trigger, start: 'top top', end: () => '+=' + len(),
  pin: true, scrub: true, anticipatePin: 1, invalidateOnRefresh: true, ...extra });

// ── S01 鳥居 Threshold · a camera dolly through the gate ──────────────────────
function scene01() {
  const root = $('.s01'), opening = $('.s01 .opening');
  const planes = [                                         // d = distance from the camera; the gate is 1
    { el: $('.s01 .sky'), d: 8 }, { el: $('.s01 .misen'), d: 6 }, { el: $('.s01 .torii'), d: 1 },
    { el: $('.s01 .mist'), d: 0.55, fade: [1.6, 3] },      // nearer than the gate: dissolves, never engulfs
  ].map(p => {                                             // quickSetter can't take the 'scale' alias: set both axes
    const sx = gsap.quickSetter(p.el, 'scaleX'), sy = gsap.quickSetter(p.el, 'scaleY');
    return { ...p, scale: (v) => { sx(v); sy(v); }, alpha: gsap.quickSetter(p.el, 'opacity') };
  });
  const EYE = { x: 0.5, y: 0.6 };                          // aim point in the opening (x 0.46 = slightly off-axis)
  const cam = { delta: 0 };

  function aim() {                                         // vanishing point + travel that clears the gate
    const o = layoutRect(opening, root);
    const ox = o.l + EYE.x * (o.r - o.l), oy = o.t + EYE.y * (o.b - o.t);
    planes.forEach(p => gsap.set(p.el, { transformOrigin: `${ox}px ${oy}px` }));
    const cover = coverScale({ ...o, b: Infinity }, ox, oy, root.offsetWidth, root.offsetHeight);
    return 1 - 1 / (cover * 1.08);                         // Δ at which the gate reaches cover × 1.08
  }
  function render() {
    for (const p of planes) {
      const s = p.d / Math.max(p.d - cam.delta, 1e-3);     // perspective: nearer planes grow faster
      if (!p.fade) { p.scale(s); continue; }
      p.alpha(gsap.utils.clamp(0, 1, gsap.utils.mapRange(p.fade[0], p.fade[1], 1, 0, s)));
      p.scale(Math.min(s, p.fade[1]));
    }
  }
  gsap.timeline({ defaults: { ease: 'none' },
      scrollTrigger: pinned(root, () => BUDGET.s01 * VH(), { id: 's01', onRefresh: render }) })
    .fromTo(cam, { delta: 0 }, { delta: aim, duration: 0.8, ease: 'power1.inOut', onUpdate: render }, 0.05)
    .fromTo('.s01 .title', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, 0.05)
    .fromTo('.s01 .fog', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.6)
    .to({}, { duration: 0.1 }, 0.9);                       // hold the flat fog frame: the seam into S02
  render();
}

// Seam sheet: a tall layer (flat top, 35svh feathered bottom) that is translated, never faded, so its
// flat part always covers the section's top edge while the new scene clears from the foreground up.
function seamSheet(root, sheet) {
  gsap.fromTo(sheet, { autoAlpha: 1, y: 0 }, { y: () => -sheet.offsetHeight, ease: 'none',
    scrollTrigger: { trigger: root, start: 'top bottom', end: () => 'top top-=' + 0.2 * VH(),
                     scrub: true, invalidateOnRefresh: true } });
}

// ── S02 静寂 Echoes of Stillness ──────────────────────────────────────────────
function scene02() {
  const root = $('.s02');
  const count = stonesCounter(root);                       // v2 build: the "never 15 / 15" counter
  seamSheet(root, $('.s02 .fog'));
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: pinned(root, () => BUDGET.s02 * VH(), { id: 's02' }) })
    .fromTo('.s02 .garden__img', { xPercent: 0 }, { xPercent: -6, duration: 0.7,        // a walk along the veranda
       onUpdate() { const p = this.progress(); stage?.garden?.setOrbit(p); count(p); } }, 0)
    .from('.s02 .haiku .line', { autoAlpha: 0, y: 24, duration: 0.12, stagger: 0.08, ease: 'power2.out' }, 0.12)
    .fromTo('.s02 .shoji', { autoAlpha: 1, xPercent: 100 }, { xPercent: 0, duration: 0.2, ease: 'power2.inOut' }, 0.72)
    .to({}, { duration: 0.08 }, 0.92);                     // closed shoji = flat washi = seam into the interlude
}

// v2 build: GPS digits decode per card (ScrambleText), rather than counting between cities.
function decodeGps(card) {
  $$('[data-gps]', card).forEach(el => {
    const text = (el.dataset.gpsText ??= el.textContent);
    gsap.to(el, { duration: 0.9, overwrite: true,
      scrambleText: { text, chars: '0123456789', revealDelay: 0.25, speed: 0.7 } });
  });
}

// ── S03 旅 Traverse · pinned rail → sign portal (fine pointer + room only) ─────
function scene03({ lenis, signal }) {
  const root = $('.s03'), track = $('.s03 .track'), cards = $$('.s03 .card'), n = cards.length;
  const rideLen = () => (n - 1) * BUDGET.s03PerCard * VH();
  const portalLen = () => BUDGET.s03Portal * VH();
  root.classList.add('is-rail');                           // CSS default is the native swipe row

  const pin = ScrollTrigger.create({ trigger: root, start: 'top top', end: () => '+=' + (rideLen() + portalLen()),
                                     pin: true, anticipatePin: 1, invalidateOnRefresh: true, id: 's03' });
  const ride = gsap.to(track, { x: () => -(track.scrollWidth - root.clientWidth), ease: 'none',
    scrollTrigger: { trigger: root, start: 'top top', end: () => '+=' + rideLen(), scrub: true, invalidateOnRefresh: true } });

  cards.forEach(card => {                                  // window parallax: media is 130% wide, moves ±15%
    const media = $('.card__media', card);
    if (media) gsap.fromTo(media, { x: () => -0.15 * card.offsetWidth }, { x: () => 0.15 * card.offsetWidth, ease: 'none',
      scrollTrigger: { trigger: card, containerAnimation: ride, start: 'left right', end: 'right left',
                       scrub: true, invalidateOnRefresh: true } });
    if ($('[data-gps]', card)) ScrollTrigger.create({ trigger: card, containerAnimation: ride, start: 'left 55%',
      end: 'right 45%', onEnter: () => decodeGps(card), onEnterBack: () => decodeGps(card) });
  });

  const stageEl = $('.card--osaka .card__stage'), sign = $('.card--osaka .card__sign');
  const kmh = { v: 0 }, readout = $('.s03 .speed__value');
  const geom = () => {                                     // zoom about the sign's centre until it fills the frame
    const s = layoutRect(sign, stageEl), ox = (s.l + s.r) / 2, oy = (s.t + s.b) / 2;
    return { origin: `${ox}px ${oy}px`, cover: 1.05 * coverScale(s, ox, oy, stageEl.offsetWidth, stageEl.offsetHeight) };
  };
  gsap.timeline({ defaults: { ease: 'none' },
      // numeric start: a 'top+=… top' string inside the pinned range gets the pin's own spacing added (measured)
      scrollTrigger: { trigger: root, start: () => pin.start + rideLen(), end: () => '+=' + portalLen(),
                       scrub: true, invalidateOnRefresh: true, id: 's03-portal' } })
    .fromTo('.s03 .speed', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, 0.1)      // v2 build: readout appears
    .fromTo(stageEl, { scale: 1, transformOrigin: () => geom().origin }, { scale: 0.96, duration: 0.15, ease: 'power1.out' }, 0.05)
    .fromTo(stageEl, { scale: 0.96 }, { scale: () => geom().cover, duration: 0.6, ease: 'expo.in', immediateRender: false }, 0.2)
    .fromTo(kmh, { v: 0 }, { v: 285, duration: 0.7, ease: 'power2.in',
       onUpdate: () => { readout.textContent = Math.round(kmh.v); } }, 0.15)
    .fromTo('.s03 .bloom', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.55)
    .to({}, { duration: 0.1 }, 0.9);                       // flat bloom = seam into S04

  track.addEventListener('focusin', (e) => {               // keyboard: bring the focused card into the frame
    const i = cards.indexOf(e.target.closest('.card'));
    if (i < 0) return;
    const y = pin.start + rideLen() * (i / (n - 1));
    lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
  }, { signal });
  return { flipAt: () => pin.start + 0.8 * rideLen(), cleanup: () => root.classList.remove('is-rail') };
}

// v2 build: on the native swipe row (touch, or no room), decode each card as it snaps into view.
function rowDecode() {
  const io = new IntersectionObserver((entries) => entries.forEach(e => e.isIntersecting && decodeGps(e.target)),
                                      { threshold: 0.6 });
  $$('.s03 .card').forEach(c => $('[data-gps]', c) && io.observe(c));
  return () => io.disconnect();
}

// ── S04 東京 Hyper-Density ─────────────────────────────────────────────────────
function scene04({ fine, signal }) {
  const root = $('.s04');
  seamSheet(root, $('.s04 .bloom'));
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: pinned(root, () => BUDGET.s04 * VH(), { id: 's04' }) })
    .fromTo('.s04 .col--jp', { y: () => 0.2 * VH() }, { y: () => -0.2 * VH(), duration: 1 }, 0)
    .fromTo('.s04 .col--en', { y: () => -0.2 * VH() }, { y: () => 0.2 * VH(), duration: 1 }, 0)
    .fromTo('.s04 .rain', { '--freeze': 0 }, { '--freeze': 1, duration: 0.25 }, 0.62)     // streaks slow into hairlines
    .fromTo('.s04 .signs', { autoAlpha: 1 }, { autoAlpha: 0.12, duration: 0.2 }, 0.68)    // power down: a dim, never a flicker
    .fromTo('.s04 .rules', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, 0.8);    // seam: sumi + rules at 28 | 44 | 28
  return initS04(root, { fine, signal });                 // v2 build: rain + billboard loops (motion only)
}

// ── S05 匠 Takumi · natural scroll, depth by speed ─────────────────────────────
function scene05({ fine, signal }) {
  const root = $('.s05');
  const D = () => VH() + root.offsetHeight;                // length of the 'top bottom' → 'bottom top' trip
  $$('.s05 .craft').forEach(craft => {
    const s = parseFloat(craft.dataset.speed), plate = $('.plate', craft);
    // speed model: y = (1 − s)·D·(p − ½)  → resting layout when the section is centred
    gsap.fromTo(plate, { y: () => -(1 - s) * D() / 2 }, { y: () => (1 - s) * D() / 2, ease: 'none',
      scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true,
                       invalidateOnRefresh: true, id: 's05-' + craft.dataset.craft } });
    if (fine) magnet(craft, $('.plate__img', craft), signal);
  });
}

// Magnetic hover moves the INNER image; the parallax owns the outer plate (one system per transform).
function magnet(zone, img, signal) {
  const to = (prop) => gsap.quickTo(img, prop, { duration: 0.6, ease: 'power3.out' });
  const x = to('x'), y = to('y'), s = to('scale');
  zone.addEventListener('pointermove', (e) => {
    const r = zone.getBoundingClientRect();
    x(((e.clientX - r.left) / r.width - 0.5) * 24);       // ±12 px
    y(((e.clientY - r.top) / r.height - 0.5) * 24);
    s(1.04);
  }, { signal });
  zone.addEventListener('pointerleave', () => { x(0); y(0); s(1); }, { signal });
}

// ── S06 富士 First Light · CSS sticky reveal + a timed settle ────────────────────
function scene06() {
  const settle = gsap.timeline({ paused: true })
    // the lake's reflection settles with the mountain it mirrors (each scales about the shoreline)
    .fromTo('.s06 .fuji, .s06 .reflection', { scale: 1.08 }, { scale: 1, duration: 3.2, ease: 'power2.out' })
    .fromTo('.s06 .akafuji', { autoAlpha: 0 }, { autoAlpha: 1, duration: 2.4, ease: 'sine.inOut' }, 0.4)
    .from('.s06 .ui > *', { autoAlpha: 0, y: 12, filter: 'blur(8px)', duration: 0.8, stagger: 0.12,
                            ease: 'expo.out', clearProps: 'filter' }, 1.2);
  ScrollTrigger.create({ trigger: '.s05', start: 'bottom top', id: 's06',   // the washi curtain has fully lifted
    onEnter: () => settle.play(), onLeaveBack: () => settle.reverse() });
}

// ── Scene positions (v2 build) · nav targets resolve to trigger positions, not offsetTop (§6) ──────
// A pinned section's own box is fixed while pinned, so measure its pin-spacer instead.
function docTop(el) {
  const box = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el;
  return box.getBoundingClientRect().top + window.scrollY;
}
export function sceneTarget(id) {
  const st = ScrollTrigger.getById(id);
  if (id === 's06') return st ? st.start : docTop($('.s05')) + $('.s05').offsetHeight;
  if (st) return st.start + (id === 's02' || id === 's04' ? 0.2 * VH() : 0);   // past the seam sheet
  const el = document.getElementById(id);
  return el ? Math.max(0, docTop(el)) : 0;
}
let starts = [];                                           // [id, y] where each scene reaches mid-screen
const measureScenes = () => { starts = SCENES.map(id => [id, sceneTarget(id) - VH() / 2]); };

// ── HUD · two modes, one direction-proof breakpoint; also feeds the shaders ─────
function hud(flipAt) {
  const el = $('.hud');
  const links = $$('.hud__nav [data-target]');
  scroll.scene = null;                                     // so the first update marks the current scene
  const update = (self) => {
    scroll.y = self.scroll(); scroll.velocity = self.getVelocity(); scroll.progress = self.progress;
    const mode = scroll.y >= flipAt() ? 'night' : 'paper';
    if (el.dataset.mode !== mode) el.dataset.mode = mode;
    el.style.setProperty('--progress', self.progress.toFixed(4));
    let scene = SCENES[0];
    for (const [id, y] of starts) if (scroll.y >= y) scene = id;
    if (scene !== scroll.scene) {
      scroll.scene = scene;
      links.forEach(a => a.dataset.target === scene ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'));
      emit('scene', { id: scene });
    }
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update,
    onRefresh: (self) => { measureScenes(); update(self); } });
}

function startLenis() {
  const lenis = new Lenis({ lerp: 0.1, anchors: false });  // wheel only (syncTouch stays false); anchors: see navigate()
  const tick = (t) => lenis.raf(t * 1000);                 // one clock: GSAP's ticker drives Lenis
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return { lenis, stop: () => { gsap.ticker.remove(tick); lenis.destroy(); gsap.ticker.lagSmoothing(500, 33); } };
}

// ── Quality tiers + the lazy WebGL stage ─────────────────────────────────────────
// GPU tier (1–3) is detected once; the effective tier is 0 whenever motion is off (§5.3).
let gpuTier = null;
export async function pickTier() {
  const forced = new URLSearchParams(location.search).get('tier');       // ?tier=0..3 for testing
  if (forced != null && /^[0-3]$/.test(forced)) return +forced;
  if (navigator.connection?.saveData) return 1;                           // T1 DOM only
  try {
    const { getGPUTier } = await import('detect-gpu');
    const { tier } = await getGPUTier({ benchmarksURL: '/gpu-benchmarks' }); // self-hosted data
    return tier >= 3 ? 3 : tier === 2 ? 2 : 1;
  } catch { return 1; }
}

function setTier(t) {
  scroll.tier = t;
  document.documentElement.dataset.tier = String(t);
  emit('tier', { tier: t });
}

let stageLoading = false;
function loadStage(tier) {
  if (tier < 2 || stage || stageLoading) return;
  stageLoading = true;
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
  idle(async () => {
    try {
      const { createStage } = await import('./stage/stage.js');   // three.js lives only in this chunk
      stage = await createStage({ canvas: $('#gl'), tier, scroll });
      gsap.ticker.add(stage.render);                       // same tick as Lenis and ScrollTrigger
      stage.setMotion(scroll.motion);
      if (!new URLSearchParams(location.search).has('tier'))     // a forced tier is never downgraded
        watchFrames(() => { const next = stage.tier - 1; stage.setTier(next); setTier(next); });  // once; never up
    } catch (err) {
      console.warn('[stage] WebGL unavailable, staying on T1', err);
      setTier(scroll.motion ? 1 : 0);
    } finally { stageLoading = false; }
  });
}

function watchFrames(degrade, budgetMs = 20, windowMs = 2000) {
  let sum = 0, frames = 0;
  const tick = (time, dt) => {
    if (dt > 250 || !scroll.motion) return;                // tab switch or debugger, not a slow frame
    sum += dt; frames++;
    if (sum < windowMs) return;
    if (sum / frames > budgetMs) { gsap.ticker.remove(tick); degrade(); }
    sum = frames = 0;
  };
  gsap.ticker.add(tick);
}

// ── Build · one gsap.matchMedia context, rebuilt when the motion preference changes ─────
let mm = null, lenisRef = null;
export const getLenis = () => lenisRef;

function build() {
  mm?.revert();
  mm = gsap.matchMedia();
  mm.add({ reduce: '(prefers-reduced-motion: reduce)',
           fine: '(hover: hover) and (pointer: fine)',
           roomy: '(min-width: 48em) and (min-height: 30em)',
           all: 'all' }, (ctx) => {                        // matchMedia only runs fn if some condition matches
    const { reduce, fine, roomy } = ctx.conditions;
    const pref = prefs.motion;
    const motion = pref === 'on' ? true : pref === 'off' ? false : !reduce;
    const ac = new AbortController(), undo = [() => ac.abort()];
    let lenis = null, rail = null;
    scroll.motion = motion;
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
    document.documentElement.dataset.input = fine ? 'fine' : 'coarse';
    if (motion && fine) { const L = startLenis(); lenis = L.lenis; undo.push(L.stop); }
    lenisRef = lenis;
    if (motion) {                                          // create in page order: each pin shifts what follows
      scene01(); scene02();
      if (fine && roomy) { rail = scene03({ lenis, signal: ac.signal }); undo.push(rail.cleanup); }
      else undo.push(rowDecode());
      const s04 = scene04({ fine, signal: ac.signal }); if (s04?.destroy) undo.push(s04.destroy);
      scene05({ fine, signal: ac.signal }); scene06();
    }
    undo.push(initDeer($('.s03'), { signal: ac.signal, motion }) ?? (() => {}));
    const s04Top = () => ScrollTrigger.getById('s04')?.start ?? docTop($('.s04'));
    hud(rail ? rail.flipAt : () => s04Top() - VH() / 2);
    setTier(motion ? Math.max(1, gpuTier ?? 1) : 0);
    if (motion && gpuTier >= 2) loadStage(gpuTier);
    stage?.setMotion(motion);
    queueMicrotask(() => emit('motion', { on: motion }));
    return () => { undo.forEach(fn => { try { fn?.(); } catch (e) { console.error(e); } }); lenisRef = null; };
  });
}

// ── Navigation (v2 build) · every in-page link lands where the choreography puts its scene ─────
export function navigate(id, { focus = true } = {}) {
  const el = document.getElementById(id);
  if (!el) return false;
  const y = SCENES.includes(id) ? sceneTarget(id) : docTop(el);
  const far = Math.abs(y - window.scrollY) > 3 * VH();    // long jumps cut rather than fly past every scene
  if (lenisRef) lenisRef.scrollTo(y, { immediate: far || !scroll.motion, force: true });
  else window.scrollTo({ top: y, behavior: far || !scroll.motion ? 'instant' : 'smooth' });
  if (focus) {
    const target = el.matches('section, footer, [tabindex]') ? el : el.closest('section') ?? el;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  if (history.replaceState) history.replaceState(null, '', '#' + id);
  return true;
}

// Motion toggle (§6): takes the same path as reduced motion — revert the context, rebuild, and keep
// the reader on the scene they were looking at.
export function setMotionPref(on) {
  const here = scroll.scene;
  prefs.motion = on ? 'on' : 'off';
  build();
  ScrollTrigger.refresh();
  requestAnimationFrame(() => navigate(here, { focus: false }));
}
export const motionState = () => ({ on: scroll.motion, pref: prefs.motion });

let booted = false;
export function init() {
  if (booted) return mm;
  booted = true;
  document.addEventListener('click', (e) => {              // in-page anchors → trigger positions
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (id && navigate(id)) e.preventDefault();
  });
  build();
  document.fonts?.ready.then(() => ScrollTrigger.refresh()); // late font metrics move every trigger
  pickTier().then((t) => {
    gpuTier = t;
    if (!scroll.motion) return;
    setTier(Math.max(1, t));
    loadStage(t);
  });
  if (location.hash.length > 1) {                          // deep link: land after the pins exist
    const id = decodeURIComponent(location.hash.slice(1));
    window.addEventListener('load', () => requestAnimationFrame(() => navigate(id, { focus: false })), { once: true });
  }
  if (new URLSearchParams(location.search).has('harness')) {   // test hook (Playwright), off by default
    window.__kn = { gsap, ScrollTrigger, BUDGET, scroll, VH, sceneTarget, navigate, setMotionPref,
                    get lenis() { return lenisRef; }, get stage() { return stage; } };
  }
  return mm;
}
