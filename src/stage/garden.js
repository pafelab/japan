/* S02 静寂 · the rock garden as a 2.5D depth model.

   The inline SVG in .s02 .garden__img is rasterized at its CSS box × DPR and drawn exactly where the DOM
   picture sits, so a still frame is the DOM art pixel for pixel. Depth comes from the vertical position:
   the wall (and the trees beyond it) is one far plane, the raked gravel is a ground plane receding from
   the veranda to the wall (1/depth is linear in screen y), and the veranda boards are nearest.
   setOrbit(p) walks the camera along the veranda: every depth shifts by pan × (1/depth), normalized so
   the gravel's mid-depth moves exactly like the DOM pan (xPercent 0 → −6), far things less, near more.
   R8: fast scrolling roughens the raked gravel (a displacement confined to light, unsaturated gravel
   pixels, so stones and moss stay crisp); a critically damped follower lets it settle when you stop. */
import { Mesh } from 'three';
import { unitQuad, rawMaterial, NOISE_GLSL, untransformedRect, clipToView, intersects } from './gl.js';
import { rasterSVG, rasterSize, viewBoxMapper } from './raster.js';
import { canvasTexture } from './textures.js';

const PAN = 0.06;                                          // the DOM walk: xPercent 0 → −6 of the image width

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uTex;
uniform vec4 uBox;        // unpanned SVG box, viewport CSS px
uniform float uPan;       // CSS px the gravel's mid-depth has moved (DOM pan)
uniform vec4 uDepth;      // horizon, veranda (box fractions), wall top (<0 = none), near-gravel parallax
uniform float uRelMax;    // parallax cap: never sample past the picture's right edge
uniform float uGround;    // ground-plane depth scale (px per unit depth)
uniform float uRipple;    // smoothed scroll speed, 0 = still
uniform float uTime;
uniform float uLight;     // tier 3: normal-mapped ripple lighting
uniform vec2 uGravel;     // gravel key: min luminance, max chroma
in vec2 vPx;
out vec4 fragColor;
${NOISE_GLSL}

float relAt(float v) {                                     // 1/depth, normalized to 1 at mid-gravel
  float h = uDepth.x, e = uDepth.y, wall = uDepth.z, rn = uDepth.w;
  float rf = 2.0 - rn;                                     // far edge of the gravel = the wall's base
  float r = rf + (rn - rf) * (v - h) / max(e - h, 1e-3);
  if (v < h) {
    r = rf;
    if (wall > 0.0) r = mix(rf * 0.6, rf, smoothstep(wall - 0.03, wall + 0.004, v));   // trees beyond the wall
  }
  return clamp(r, 0.0, uRelMax);
}

float gravelKey(vec4 c) {
  vec3 rgb = c.rgb / max(c.a, 1e-3);
  float l = dot(rgb, vec3(0.299, 0.587, 0.114));
  float ch = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
  return smoothstep(uGravel.x - 0.05, uGravel.x + 0.03, l) * (1.0 - smoothstep(uGravel.y, uGravel.y + 0.05, ch)) * c.a;
}

// the disturbed gravel surface, in ground coordinates (lateral px, depth px)
float surface(vec2 g, float t) {
  float w1 = sin(g.y * 0.075 + g.x * 0.006 - t * 1.9 + 1.6 * sin(g.x * 0.0045 + t * 0.35));
  float w2 = sin(g.y * 0.13 - g.x * 0.028 + t * 1.2);
  float n = vnoise(g * vec2(0.022, 0.05) + vec2(t * 0.3, -t * 0.22)) * 2.0 - 1.0;
  return w1 * 0.5 + w2 * 0.25 + n * 0.5;
}

void main() {
  vec2 uv = (vPx - uBox.xy) / uBox.zw;
  float v = uv.y;
  float rel = relAt(v);
  vec2 suv = vec2(uv.x + uPan * rel / uBox.z, v);
  vec4 col = texture(uTex, suv);

  float h = uDepth.x, e = uDepth.y;
  float band = smoothstep(h + 0.004, h + 0.03, v) * (1.0 - smoothstep(e - 0.02, e - 0.002, v));
  float z = 1.0 / max(rel, 0.08);
  vec2 g = vec2((suv.x - 0.5) * uBox.z * z, z * uGround);
  float s = surface(g, uTime);
  float amp = uRipple * 2.4 * rel;                         // CSS px, larger near the veranda
  vec2 d = vec2(0.3 * surface(g.yx * 0.7 + 31.0, uTime * 1.13), s) * amp;
  vec4 moved = texture(uTex, suv + d / uBox.zw);
  float m = band * gravelKey(col) * gravelKey(moved) * step(0.002, uRipple);
  vec4 outc = mix(col, moved, m);

  float hs = s * amp;                                      // lit relief of the disturbed gravel (tier 3)
  float lit = (0.5 * dFdx(hs) - 0.6 * dFdy(hs)) * 0.17 * uLight * m;
  outc.rgb *= 1.0 + clamp(lit, -0.08, 0.08);
  fragColor = outc;
}`;

export function createGarden(ctx) {
  const section = document.querySelector('.s02');
  const holder = section?.querySelector('.garden__img');
  let tex = null, depth = null, gen = 0, loading = null, drawnOnce = false;
  let orbit = null, rasterFor = null;

  const uniforms = {
    uView: { value: [1, 1] }, uRect: { value: [0, 0, 0, 0] },
    uTex: { value: null }, uBox: { value: [0, 0, 1, 1] }, uPan: { value: 0 },
    uDepth: { value: [0.45, 0.86, -1, 1.5] }, uRelMax: { value: 1.5 }, uGround: { value: 1200 },
    uRipple: { value: 0 }, uTime: { value: 0 }, uLight: { value: 0 }, uGravel: { value: [0.66, 0.11] },
  };
  const mesh = new Mesh(unitQuad(), rawMaterial({ fragment: FRAG, uniforms }));
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 1;
  ctx.scene.add(mesh);

  const svgEl = () => holder?.querySelector('svg');

  // Layout box of the SVG with the DOM pan removed (the pan is a pure translation on .garden__img).
  function measure() {
    const svg = svgEl();
    if (!svg) return null;
    const img = untransformedRect(holder);
    const hr = holder.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    return { box: { x: img.x + (sr.left - hr.left), y: img.y + (sr.top - hr.top), w: sr.width, h: sr.height },
             img, shift: hr.left - img.x };
  }

  // Rasterize (or re-rasterize after a resize: the old texture keeps drawing until the new one swaps in).
  async function load(force = false) {
    if ((tex && !force) || loading || !svgEl()) return loading;
    const my = ++gen;
    loading = (async () => {
      const svg = svgEl(), mm = measure();
      if (!mm || mm.box.w < 2 || mm.box.h < 2) return;
      const { pw, ph } = rasterSize(mm.box.w, mm.box.h, ctx.texScale(), ctx.maxDim());
      const canvas = await rasterSVG(svg, pw, ph);
      if (my !== gen) return;
      const map = viewBoxMapper(svg, mm.box.w, mm.box.h);
      const num = (k, d) => { const v = parseFloat(svg.dataset[k] ?? holder.dataset[k]); return Number.isFinite(v) ? v : d; };
      const hz = map(num('horizon', 0.45)), ve = map(num('veranda', 0.86));
      const wall = svg.dataset.wall ?? holder.dataset.wall;
      depth = { h: hz, e: Math.max(ve, hz + 0.05), wall: wall != null ? map(parseFloat(wall)) : -1 };
      const old = tex;
      tex = canvasTexture(canvas, ctx.renderer);
      uniforms.uTex.value = tex;
      old?.dispose();
      rasterFor = { w: Math.round(mm.box.w), h: Math.round(mm.box.h), s: ctx.texScale() };
    })().catch((e) => console.warn('[stage] garden raster failed', e)).finally(() => { loading = null; });
    return loading;
  }

  function unload() {
    gen++;
    tex?.dispose(); tex = null; uniforms.uTex.value = null;
    mesh.visible = false; drawnOnce = false;
    section?.classList.remove('gl-ready');
  }

  // Called every tick while the section is near. Returns null (nothing to draw) or { key, animating }.
  function frame(F) {
    mesh.visible = false;
    if (!tex || !section) return null;
    const sr = section.getBoundingClientRect();
    const sect = { x: sr.left, y: sr.top, w: sr.width, h: sr.height };
    if (!intersects(sect, F.w, F.h)) return null;
    const mm = measure();
    if (!mm) return null;
    const { box, img } = mm;
    // re-rasterize when the box size or DPR cap changed (resize): keep drawing the old texture meanwhile
    if (rasterFor && (Math.abs(rasterFor.w - box.w) > 1 || Math.abs(rasterFor.h - box.h) > 1 || rasterFor.s !== ctx.texScale())) ctx.reraster(api);
    const p = orbit ?? Math.min(1, Math.max(0, -mm.shift / (PAN * img.w)));
    const pan = p * PAN * img.w;
    const spare = box.x + box.w - (sect.x + sect.w);          // picture beyond the frame's right edge at p = 0
    const relMax = Math.max(1, (spare - 1) / Math.max(PAN * img.w, 1));
    const rn = Math.min(1.5, relMax);
    const q = clipToView({ x: Math.max(sect.x, box.x), y: Math.max(sect.y, box.y),
      w: Math.min(sect.x + sect.w, box.x + box.w) - Math.max(sect.x, box.x),
      h: Math.min(sect.y + sect.h, box.y + box.h) - Math.max(sect.y, box.y) }, F.w, F.h);
    if (q.w <= 0 || q.h <= 0) return null;
    const u = uniforms;
    u.uView.value = [F.w, F.h];
    u.uRect.value = [q.x, q.y, q.w, q.h];
    u.uBox.value = [box.x, box.y, box.w, box.h];
    u.uPan.value = pan;
    u.uDepth.value = [depth.h, depth.e, depth.wall, rn];
    u.uRelMax.value = relMax;
    // ground depth scale: a ground square at mid-depth looks ~4× wider than deep from the veranda
    u.uGround.value = box.h * (depth.e - depth.h) / Math.max(2 * rn - 2, 0.2) / 0.25;
    u.uRipple.value = F.ripple;
    u.uTime.value = F.time;
    u.uLight.value = F.tier >= 3 ? 1 : 0;
    mesh.visible = true;
    return { key: `${q.x}|${q.y}|${q.w}|${q.h}|${box.x}|${box.y}|${pan.toFixed(2)}|${F.w}|${F.h}`, animating: F.ripple > 0 };
  }

  function afterDraw() {
    if (!drawnOnce) { drawnOnce = true; section.classList.add('gl-ready'); }
  }

  function dispose() {
    unload();
    ctx.scene.remove(mesh);
    mesh.material.dispose();
  }

  const api = {
    name: 'garden', section, load, unload, frame, afterDraw, dispose,
    hide() { mesh.visible = false; },
    get ready() { return !!tex; },
    get raster() { return rasterFor; },
    get rasterSource() { return holder; },
    setOrbit(p) { orbit = Math.min(1, Math.max(0, +p || 0)); },
    refresh() { return load(true); },
  };
  return api;
}
