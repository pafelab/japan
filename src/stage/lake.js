/* S06 富士 · Lake Kawaguchi: Sakasa-Fuji, the inverted reflection (R16).

   The DOM lake (.s06 .lake: the water's CSS background, the inline SVG reflection in .reflection, and
   anything else inside it) is painted into textures once: the water beneath the reflection, the
   reflection without Akafuji and with it (so the red can warm up exactly as the core fades .akafuji),
   and whatever lies over the reflection. The shader follows the reflection's live scale (the settle,
   1.08 → 1 about the shoreline) and the Akafuji opacity. When the scroll is still the lake is a clean
   mirror, identical to the DOM; scroll speed breaks it with a ripple that is compressed toward the
   shoreline (perspective) and settles when you stop. Tier 3 adds sun glints on the ripple, frame-left. */
import { Mesh } from 'three';
import { unitQuad, rawMaterial, NOISE_GLSL, untransformedRect, clipToView, intersects } from './gl.js';
import { paintBox, rasterSize } from './raster.js';
import { canvasTexture } from './textures.js';

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uUnder;
uniform sampler2D uOver;
uniform sampler2D uReflA;
uniform sampler2D uReflB;
uniform vec4 uLake;       // lake box, viewport CSS px
uniform vec4 uRefl;       // the rasterized part of the reflection, layout px (transform removed)
uniform vec2 uOrigin;     // its transform origin, viewport px (layout space)
uniform vec2 uShift;      // its translation
uniform vec2 uScale;      // its scale (the settle)
uniform float uAka;       // Akafuji opacity
uniform float uHasOver;
uniform float uHasUnder;
uniform float uRipple;
uniform float uTime;
uniform float uLight;     // tier 3 glints
uniform float uSunX;      // CSS px
in vec2 vPx;
out vec4 fragColor;
${NOISE_GLSL}

vec4 refl(vec2 p) {
  vec2 L = uOrigin + (p - uShift - uOrigin) / uScale;
  vec2 uv = (L - uRefl.xy) / uRefl.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return mix(texture(uReflA, uv), texture(uReflB, uv), uAka);
}

float wave(vec2 g, float t) {
  return sin(g.y * 0.11 - t * 1.6 + 1.4 * sin(g.x * 0.006 + t * 0.3)) * 0.55
       + sin(g.y * 0.23 + g.x * 0.02 - t * 2.3) * 0.25
       + (vnoise(g * vec2(0.012, 0.06) + vec2(0.0, -t * 0.4)) * 2.0 - 1.0) * 0.4;
}

void main() {
  vec2 luv = (vPx - uLake.xy) / uLake.zw;
  float d = clamp(luv.y, 0.0, 1.0);                        // 0 at the shoreline → 1 nearest
  float persp = d + 0.035;                                 // 1/depth grows with the distance below the horizon
  float z = 1.0 / persp;
  vec2 g = vec2((vPx.x - uLake.x - 0.5 * uLake.z) * z, z * uLake.w * 0.9);
  float w = wave(g, uTime);
  float amp = uRipple * 11.0 * persp * smoothstep(0.0, 0.05, d);
  vec2 disp = vec2(w, 0.22 * wave(g.yx * 0.8 + 11.0, uTime * 0.9)) * amp;

  vec4 under = texture(uUnder, luv) * uHasUnder;
  vec4 r = refl(vPx + disp);
  vec4 col = r + under * (1.0 - r.a);

  // tier 3: the ripple's facets catch the low sun (frame-left): glints along the sun's column
  float hs = w * amp;
  float slope = dFdx(hs) * 0.8 - dFdy(hs);
  float column = exp(-pow((vPx.x - uSunX) / (0.16 * uLake.z + 40.0), 2.0));
  float glint = pow(clamp(slope * 0.9, 0.0, 1.0), 3.0) * column * uLight * smoothstep(0.02, 0.4, uRipple);
  col.rgb += vec3(1.0, 0.86, 0.72) * glint * 0.55 * col.a;
  col.rgb *= 1.0 - clamp(-slope * 0.05, 0.0, 0.06) * uLight;

  if (uHasOver > 0.5) { vec4 o = texture(uOver, luv); col = o + col * (1.0 - o.a); }
  fragColor = col;
}`;

const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING, CONTAINED = Node.DOCUMENT_POSITION_CONTAINED_BY;

export function createLake(ctx) {
  const section = document.querySelector('.s06');
  const lake = section?.querySelector('.lake');
  const reflection = lake?.querySelector('.reflection');
  let tex = null, gen = 0, loading = null, drawnOnce = false, rasterFor = null, cropRel = null;

  const uniforms = {
    uView: { value: [1, 1] }, uRect: { value: [0, 0, 0, 0] },
    uUnder: { value: null }, uOver: { value: null }, uReflA: { value: null }, uReflB: { value: null },
    uLake: { value: [0, 0, 1, 1] }, uRefl: { value: [0, 0, 1, 1] }, uOrigin: { value: [0, 0] },
    uShift: { value: [0, 0] }, uScale: { value: [1, 1] }, uAka: { value: 1 }, uHasOver: { value: 0 }, uHasUnder: { value: 0 },
    uRipple: { value: 0 }, uTime: { value: 0 }, uLight: { value: 0 }, uSunX: { value: 0 },
  };
  const mesh = new Mesh(unitQuad(), rawMaterial({ fragment: FRAG, uniforms }));
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
  ctx.scene.add(mesh);

  const isAka = (el) => el.classList?.contains('akafuji');
  const akaEl = () => reflection?.querySelector('.akafuji') ?? section?.querySelector('.akafuji');
  const sunEl = () => section?.querySelector('.sun, .halo');

  function editAka(show) {
    return (svg, clone) => clone.querySelectorAll('.akafuji').forEach(g => {
      if (!show) g.remove();
      else { g.removeAttribute('style'); g.setAttribute('opacity', '1'); g.setAttribute('visibility', 'visible'); }
    });
  }

  async function load(force = false) {
    if ((tex && !force) || loading || !lake || !reflection) return loading;
    const my = ++gen;
    loading = (async () => {
      const lb = lake.getBoundingClientRect();
      const rb = untransformedRect(reflection);
      if (lb.width < 2 || lb.height < 2 || rb.w < 2 || rb.h < 2) return;
      const s = ctx.texScale(), max = ctx.maxDim();
      // the reflection is far wider than the frame: rasterize only the part that can show in the lake
      const M = 32;
      const cx0 = Math.max(rb.x, lb.left - M), cy0 = Math.max(rb.y, lb.top - M);
      const cx1 = Math.min(rb.x + rb.w, lb.right + M), cy1 = Math.min(rb.y + rb.h, lb.bottom + M);
      if (cx1 - cx0 < 2 || cy1 - cy0 < 2) return;
      const crop = { x: cx0 - rb.x, y: cy0 - rb.y, w: cx1 - cx0, h: cy1 - cy0 };
      const L = rasterSize(lb.width, lb.height, s, max), R = rasterSize(crop.w, crop.h, s, max);
      const lakeBox = { w: lb.width, h: lb.height };
      const hasAka = !!reflection.querySelector('.akafuji');
      const follows = (el) => (reflection.compareDocumentPosition(el) & FOLLOWING) && !(reflection.compareDocumentPosition(el) & CONTAINED);
      const [under, over, A, B] = await Promise.all([
        paintBox(lake, lakeBox, L.pw, L.ph, { skip: (el) => el === reflection || follows(el) }),
        paintBox(lake, lakeBox, L.pw, L.ph, { skip: (el) => el === reflection || (el !== lake && !follows(el) && !el.contains(reflection)), rootBackground: false }),
        paintBox(reflection, rb, R.pw, R.ph, { crop, skip: isAka, mutateSVG: editAka(false) }),
        hasAka ? paintBox(reflection, rb, R.pw, R.ph, { crop, force: isAka, mutateSVG: editAka(true) }) : null,
      ]);
      if (my !== gen) return;
      const old = tex;
      const t = (r) => (r?.painted ? canvasTexture(r.canvas, ctx.renderer) : null);
      tex = { under: t(under), over: t(over), A: t(A), B: t(B) };
      if (!tex.A) tex.A = canvasTexture(A.canvas, ctx.renderer);
      const u = uniforms;
      u.uUnder.value = tex.under ?? tex.A; u.uHasUnder.value = tex.under ? 1 : 0;
      u.uOver.value = tex.over ?? tex.A; u.uHasOver.value = tex.over ? 1 : 0;
      u.uReflA.value = tex.A; u.uReflB.value = tex.B ?? tex.A;
      cropRel = crop;
      rasterFor = { w: Math.round(lb.width), h: Math.round(lb.height), s };
      disposeSet(old);
    })().catch((e) => console.warn('[stage] lake raster failed', e)).finally(() => { loading = null; });
    return loading;
  }

  function disposeSet(set) { if (set) Object.values(set).forEach(t => t?.dispose()); }

  function unload() {
    gen++;
    disposeSet(tex); tex = null;
    ['uUnder', 'uOver', 'uReflA', 'uReflB'].forEach(k => { uniforms[k].value = null; });
    mesh.visible = false; drawnOnce = false;
    section?.classList.remove('gl-ready');
  }

  function frame(F) {
    mesh.visible = false;
    if (!tex || !section) return null;
    const sr = section.getBoundingClientRect();
    if (!intersects({ x: sr.left, y: sr.top, w: sr.width, h: sr.height }, F.w, F.h)) return null;
    const lb = lake.getBoundingClientRect();
    const box = { x: lb.left, y: lb.top, w: lb.width, h: lb.height };
    if (rasterFor && (Math.abs(rasterFor.w - box.w) > 1 || Math.abs(rasterFor.h - box.h) > 1 || rasterFor.s !== ctx.texScale())) ctx.reraster(api);
    // the lake, clipped by the section (overflow: clip) and the viewport
    const x0 = Math.max(box.x, sr.left), y0 = Math.max(box.y, sr.top);
    const q = clipToView({ x: x0, y: y0, w: Math.min(box.x + box.w, sr.right) - x0, h: Math.min(box.y + box.h, sr.bottom) - y0 }, F.w, F.h);
    if (q.w <= 0 || q.h <= 0) return null;
    const rb = untransformedRect(reflection);
    const cs = getComputedStyle(reflection);
    const m = cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform) : null;
    const aka = akaEl();
    const akaOp = aka ? opacity(aka) : 1;
    const sun = sunEl()?.getBoundingClientRect();
    const u = uniforms;
    u.uView.value = [F.w, F.h];
    u.uRect.value = [q.x, q.y, q.w, q.h];
    u.uLake.value = [box.x, box.y, box.w, box.h];
    u.uRefl.value = [rb.x + cropRel.x, rb.y + cropRel.y, cropRel.w, cropRel.h];
    u.uOrigin.value = [rb.x + (rb.ox ?? 0), rb.y + (rb.oy ?? 0)];
    u.uShift.value = m ? [m.e, m.f] : [0, 0];
    u.uScale.value = m ? [m.a || 1, m.d || 1] : [1, 1];
    u.uAka.value = akaOp;
    u.uRipple.value = F.ripple;
    u.uTime.value = F.time;
    u.uLight.value = F.tier >= 3 ? 1 : 0;
    u.uSunX.value = sun && sun.width ? sun.left + sun.width / 2 : box.x + 0.22 * box.w;
    mesh.visible = true;
    return { key: `${q.x}|${q.y}|${q.w}|${q.h}|${box.y}|${u.uScale.value}|${u.uShift.value}|${akaOp.toFixed(4)}|${F.w}|${F.h}`,
             animating: F.ripple > 0 };
  }

  function afterDraw() {
    if (!drawnOnce) { drawnOnce = true; section.classList.add('gl-ready'); }
  }
  function dispose() { unload(); ctx.scene.remove(mesh); mesh.material.dispose(); }

  const api = {
    name: 'lake', section, load, unload, frame, afterDraw, dispose,
    hide() { mesh.visible = false; },
    get ready() { return !!tex; },
    get raster() { return rasterFor; },
    get rasterSource() { return lake; },
    refresh() { return load(true); },
  };
  return api;
}

// GSAP's autoAlpha writes inline opacity/visibility; the computed visibility can't be trusted here
// (.s06.gl-ready hides the whole lake, and visibility inherits).
function opacity(el) {
  if (el.style.visibility === 'hidden') return 0;
  return el.style.opacity !== '' ? parseFloat(el.style.opacity) : parseFloat(getComputedStyle(el).opacity);
}
