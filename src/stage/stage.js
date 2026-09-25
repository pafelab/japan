/* Komorebi & Neon · the WebGL stage (T2+), loaded lazily by the core (§5.2, §5.3).

   One fixed canvas (#gl) behind the page; WebGL only replaces pictures. Three scenes:
     S02 garden  2.5D depth model of the rasterized garden SVG; the walk (setOrbit) + velocity ripple (R8)
     S04 rain    streaks drawn above the page while S04 is on screen; --freeze collapses them into the
                 28% / 72% hairlines (R12); chromatic split at T3
     S06 lake    Sakasa-Fuji: a clean mirror when still, rippled by scroll speed (R16)
   Each scene draws only while its section is on screen, adds .gl-ready to the section after its first
   drawn frame (stage.css then hides the DOM picture) and removes it when disposed.

   createStage({ canvas, tier, scroll }) → { tier, render(time, deltaTime), setTier(n), setMotion(on),
                                            garden: { setOrbit(p) }, dispose() }
   render runs on gsap.ticker (time in s, deltaTime in ms), after Lenis and ScrollTrigger in the same tick,
   so the canvas and the DOM never disagree. setTier(n < 2) / setMotion(false) dispose every GPU resource
   and restore the DOM; setMotion(true) at T2+ rebuilds lazily on the next tick. */
import './stage.css';
import { WebGLRenderer, Scene, Camera } from 'three';
import { follower, disposeQuad } from './gl.js';
import { createGarden } from './garden.js';
import { createRain } from './rain.js';
import { createLake } from './lake.js';

const DPR_CAP = { 2: 1.5, 3: 2 };
const NEAR = '200% 0px 200% 0px';                          // textures load within two viewports (N+1)
const FAR = '500% 0px 500% 0px';                           // and are released beyond five (N−2)

function probeWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

export async function createStage({ canvas, tier = 2, scroll = {} }) {
  if (!canvas) throw new Error('[stage] no #gl canvas');
  let currentTier = +tier;
  let motion = scroll.motion ?? true;
  let gl = null, lost = false, broken = false, disposed = false, hadContext = false;
  let orbit = null, lastY = null, lastKey = '', dirty = false, forceDraw = true, raised = false;
  let viewW = 1, viewH = 1, dpr = 1, needResize = true;
  let rasterTimer = 0;
  const pendingRaster = new Set();
  const near = new Map();
  const speed = follower({ rise: 0.14, fall: 0.75 });
  const debug = { ripple: 0 };                             // test hook: a floor for the ripple (screenshots)

  const enabled = () => !disposed && !lost && !broken && motion && currentTier >= 2;
  const cap = () => DPR_CAP[currentTier] ?? 1.5;

  function setRaised(on) {
    if (on === raised) return;
    raised = on;
    canvas.style.zIndex = on ? '2' : '';                   // above main.page (1), below the HUD (50)
    canvas.style.pointerEvents = on ? 'none' : '';
  }

  function scheduleRaster() {
    clearTimeout(rasterTimer);
    rasterTimer = setTimeout(() => {
      const list = [...pendingRaster]; pendingRaster.clear();
      list.forEach(s => s.refresh?.());
    }, 260);
  }

  function build() {
    const renderer = new WebGLRenderer({
      canvas, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    hadContext = true;
    renderer.resetState();                                 // a rebuilt renderer may inherit the old GL state
    renderer.autoClear = false;
    renderer.sortObjects = false;                          // draw order = scene order (rect quads, no depth)
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene(), camera = new Camera();
    const ctx = {
      renderer, scene,
      texScale: () => dpr,
      maxDim: () => Math.min(renderer.capabilities.maxTextureSize || 4096, 4096),
      reraster: (s) => { if (!pendingRaster.has(s)) { pendingRaster.add(s); scheduleRaster(); } },
    };
    const scenes = [createGarden(ctx), createRain(ctx), createLake(ctx)].filter(s => s.section);
    const garden = scenes.find(s => s.name === 'garden');
    if (garden && orbit != null) garden.setOrbit(orbit);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        near.set(e.target, e.isIntersecting);
        if (e.isIntersecting) scenes.find(s => s.section === e.target)?.load();
      }
    }, { rootMargin: NEAR });
    const far = new IntersectionObserver((entries) => {
      for (const e of entries) if (!e.isIntersecting) scenes.find(s => s.section === e.target)?.unload();
    }, { rootMargin: FAR });
    scenes.forEach(s => { io.observe(s.section); far.observe(s.section); });
    gl = { renderer, scene, camera, scenes, garden, io, far };
    needResize = true; forceDraw = true; lastKey = ''; dirty = false;
  }

  function teardown() {
    clearTimeout(rasterTimer); pendingRaster.clear();
    if (gl) {
      gl.io.disconnect(); gl.far.disconnect();
      gl.scenes.forEach(s => { try { s.dispose(); } catch (e) { console.warn('[stage]', e); } });
      disposeQuad();
      if (!lost) { gl.renderer.clear(); gl.renderer.resetState(); }   // leave the context at GL defaults
      gl.renderer.dispose();
      gl = null;
      if (!lost) { canvas.width = 1; canvas.height = 1; }    // release the drawing buffer too
    }
    near.clear();
    document.querySelectorAll('.s02.gl-ready, .s04.gl-ready, .s06.gl-ready').forEach(el => el.classList.remove('gl-ready'));
    setRaised(false);
    speed.reset(); lastY = null; lastKey = ''; dirty = false;
  }

  function resize() {
    needResize = false;
    viewW = canvas.clientWidth || document.documentElement.clientWidth;
    viewH = canvas.clientHeight || document.documentElement.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, cap());
    gl.renderer.setPixelRatio(dpr);
    gl.renderer.setSize(viewW, viewH, false);
    forceDraw = true;
  }

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { needResize = true; if (pendingRaster.size) scheduleRaster(); }, 120);
  };
  const onLost = (e) => { e.preventDefault(); teardown(); lost = true; };
  const onRestored = () => { lost = false; forceDraw = true; };  // render() rebuilds on the next tick
  window.addEventListener('resize', onResize);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function render(time, deltaTime) {
    if (!enabled()) return;
    if (!gl) {
      try { build(); } catch (err) { broken = true; teardown(); console.warn('[stage] WebGL unavailable', err); return; }
    }
    const dt = Math.min(Math.max(+deltaTime || 16.7, 0) / 1000, 0.1);
    if (Math.min(window.devicePixelRatio || 1, cap()) !== dpr) needResize = true;
    if (needResize) resize();

    // Scroll speed from the scroll position itself: scroll.velocity goes stale once scrolling stops.
    const y = window.scrollY;
    let v = lastY == null ? 0 : (y - lastY) / Math.max(dt, 1 / 240);
    if (lastY != null && Math.abs(y - lastY) > 0.6 * viewH) v = 0;   // a navigation jump, not a scroll
    lastY = y;
    const ripple = Math.max(speed.step(Math.min(1.2, Math.abs(v) / 2400), dt), debug.ripple);

    const F = { time, dt, w: viewW, h: viewH, dpr, tier: currentTier, ripple };
    const drawn = [];
    let key = '', animating = false, raise = false;
    for (const s of gl.scenes) {
      if (!near.get(s.section)) { s.hide(); continue; }
      const r = s.frame(F);
      if (!r) continue;
      drawn.push(s); key += r.key + ';';
      animating ||= r.animating; raise ||= !!r.raise;
    }
    setRaised(raise);
    if (drawn.length) {
      if (animating || forceDraw || key !== lastKey) {
        gl.renderer.clear();
        gl.renderer.render(gl.scene, gl.camera);
        drawn.forEach(s => s.afterDraw());
        dirty = true; forceDraw = false; lastKey = key;
      }
    } else if (dirty || forceDraw) {
      gl.renderer.clear();
      dirty = false; forceDraw = false; lastKey = '';
    }
  }

  function setTier(n) {
    const prev = currentTier;
    currentTier = +n;
    if (currentTier < 2) { teardown(); return; }
    if (gl && DPR_CAP[currentTier] !== DPR_CAP[prev]) needResize = true;   // textures follow via their size check
    forceDraw = true;
  }

  function setMotion(on) {
    motion = !!on;
    if (!motion) teardown();
    else { forceDraw = true; lastY = null; }
  }

  function dispose() {
    teardown();
    disposed = true;
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    if (hadContext) canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // Fail early (the core then stays on T1) when WebGL2 can't run here; build at once when it will be used.
  if (enabled()) {
    try { build(); } catch (err) { teardown(); throw err; }
  } else if (!probeWebGL2()) throw new Error('[stage] WebGL2 unavailable');

  return {
    get tier() { return currentTier; },
    render, setTier, setMotion, dispose,
    garden: { setOrbit(p) { orbit = +p || 0; gl?.garden?.setOrbit(orbit); } },
    debug,
    // test hook: what the stage is doing right now
    get stats() {
      return { built: !!gl, lost, tier: currentTier, motion, dpr, raised, ripple: speed.x,
        scenes: gl ? gl.scenes.map(s => ({ name: s.name, near: !!near.get(s.section), ready: !!s.ready,
          glReady: s.section.classList.contains('gl-ready'), raster: s.raster ?? null })) : [] };
    },
  };
}
