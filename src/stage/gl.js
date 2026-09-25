/* Stage helpers shared by the three WebGL scenes: a screen-space quad (drawn in CSS pixels, so every
   scene lines up with the DOM box it replaces), a critically damped follower, and layout measuring that
   ignores the transforms GSAP owns. */
import { BufferGeometry, BufferAttribute, RawShaderMaterial, GLSL3, DoubleSide, NoBlending } from 'three';

// One unit square, (0,0) top-left → (1,1) bottom-right. Shared by every rect mesh; never disposed per scene.
let quad = null;
export function unitQuad() {
  if (quad) return quad;
  quad = new BufferGeometry();
  quad.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  return quad;
}
export function disposeQuad() { quad?.dispose(); quad = null; }

// Vertex stage for a rect in viewport CSS pixels (y down). vPx carries the CSS-pixel position.
export const RECT_VERT = /* glsl */`
precision highp float;
in vec2 position;
uniform vec2 uView;
uniform vec4 uRect;
out vec2 vPx;
void main() {
  vPx = uRect.xy + position * uRect.zw;
  gl_Position = vec4(vPx.x / uView.x * 2.0 - 1.0, 1.0 - vPx.y / uView.y * 2.0, 0.0, 1.0);
}`;

// Small value noise, shared by the ripple shaders.
export const NOISE_GLSL = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}`;

export function rawMaterial({ vertex = RECT_VERT, fragment, uniforms, blending = NoBlending, defines }) {
  const m = new RawShaderMaterial({
    glslVersion: GLSL3, vertexShader: vertex, fragmentShader: fragment, uniforms,
    depthTest: false, depthWrite: false, side: DoubleSide, blending, transparent: blending !== NoBlending,
  });
  if (defines) m.defines = defines;
  return m;
}

// Critically damped follower (SmoothDamp form: stable for any frame time). Rises fast, settles slowly:
// fast scrolling roughens the water/gravel at once, and stopping lets it settle (R8).
export function follower({ rise = 0.16, fall = 0.7 } = {}) {
  const s = { x: 0, v: 0 };
  s.step = (target, dt) => {
    const smooth = target > s.x ? rise : fall;
    const omega = 2 / smooth, k = omega * dt;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = s.x - target, temp = (s.v + omega * change) * dt;
    s.v = (s.v - omega * temp) * e;
    s.x = target + (change + temp) * e;
    if (s.x < 1e-4 && target === 0) { s.x = 0; s.v = 0; }
    return s.x;
  };
  s.reset = () => { s.x = 0; s.v = 0; };
  return s;
}

// The border box of el in viewport pixels as if el's own transform were none (translate/scale only).
// Ancestors' transforms stay in (the pinned sections are positioned, not transformed).
export function untransformedRect(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (!cs.transform || cs.transform === 'none') return { x: r.left, y: r.top, w: r.width, h: r.height, sx: 1, sy: 1 };
  const m = new DOMMatrixReadOnly(cs.transform);
  const [ox = 0, oy = 0] = cs.transformOrigin.split(' ').map(parseFloat);
  const sx = m.a || 1, sy = m.d || 1;
  // x_screen = x0 + ox + sx·(u − ox) + e  for u in [0, w]  →  left = x0 + ox·(1 − sx) + e
  const w = r.width / Math.abs(sx), h = r.height / Math.abs(sy);
  return { x: r.left - m.e - ox * (1 - sx), y: r.top - m.f - oy * (1 - sy), w, h, sx, sy,
           ox, oy };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const intersects = (r, W, H) => r.x < W && r.x + r.w > 0 && r.y < H && r.y + r.h > 0;

// Intersection of a box with the viewport (the quad we actually draw).
export function clipToView(r, W, H) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
