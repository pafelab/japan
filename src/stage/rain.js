/* S04 東京 · rain over Shinjuku, drawn above the page while S04 is on screen.

   Instanced streaks (one quad each) fall through the section. Scroll speed lengthens and speeds them
   (motion blur that has a reason: the faster you move, the harder it seems to rain). --freeze, tweened
   by the core on .s04 .rain, slows them to a stop (speed × (1 − freeze)) and draws each one, on its own
   schedule, into the nearer of two threads at 28% and 72% of the section width, where two hairlines
   form: the column rules of S05. When the .rules seam fades in, the hairlines hand over to the DOM rules.
   The streaks catch the neon: their tint follows the signs' opacity, so it drains as the signs power down.
   Tier 3 adds a restrained chromatic split (≤ 2 CSS px, scaled by scroll speed). The rain fades in under
   the bloom seam sheet (masked by the sheet's own feathered edge) and through the first 10% of the pin. */
import { Mesh, InstancedBufferGeometry, InstancedBufferAttribute, CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { unitQuad, rawMaterial, RECT_VERT, clamp, smoothstep, intersects } from './gl.js';

const MAX = 2400;
const RULES = [0.28, 0.72];

const VERT = /* glsl */`
precision highp float;
in vec2 position;         // unit quad: x across, y along (0 = tail, 1 = head)
in vec4 aSeed;            // x, phase, speed, depth
in vec4 aLook;            // length, tint amount, freeze threshold, width
in vec3 aColor;
uniform vec2 uView;
uniform vec4 uSect;
uniform float uFall;
uniform float uFreeze;
uniform float uVel;
uniform float uSplit;
uniform vec2 uRules;
out vec2 vLocal;
out vec2 vPx;
out float vAlpha;
out float vHalf;
out vec3 vColor;
out float vTint;
void main() {
  float depth = aSeed.w;
  float c = smoothstep(aLook.z, aLook.z + 0.36, uFreeze);  // this streak's own moment of freezing
  float H = uSect.w, W = uSect.z;
  float len = mix(14.0, 78.0, depth * depth) * aLook.x * (1.0 + 1.9 * uVel);
  len = mix(len, H * mix(0.18, 0.55, depth), c * c);      // slowing streaks stretch into threads
  float slant = 0.14 * (1.0 - c);
  float span = H + len + 80.0;
  float headY = mod(aSeed.y * span + uFall * aSeed.z * mix(0.5, 1.0, depth), span) - 40.0;
  float x = aSeed.x * (W + H * slant) - H * slant + headY * slant;
  float target = (aSeed.x < 0.5 ? uRules.x : uRules.y) * W;
  x = mix(x, target, smoothstep(0.0, 1.0, c));
  vec2 dir = normalize(vec2(slant, 1.0));
  vec2 nrm = vec2(dir.y, -dir.x);
  float halfW = mix(mix(0.34, 0.9, depth) * aLook.w, 0.5, c);
  float quadHalf = halfW + uSplit + 1.5;
  vec2 head = uSect.xy + vec2(x, headY);
  float across = position.x * 2.0 - 1.0;
  vec2 p = head - dir * len * (1.0 - position.y) + nrm * across * quadHalf;
  vLocal = vec2(across * quadHalf, position.y);
  vPx = p;
  vAlpha = mix(0.13, 0.46, depth) * (1.0 - c) * (1.0 - c) * (1.0 + 0.35 * uVel);
  vHalf = halfW;
  vColor = aColor;
  vTint = aLook.y;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
in vec2 vLocal;
in vec2 vPx;
in float vAlpha;
in float vHalf;
in vec3 vColor;
in float vTint;
uniform vec4 uSect;
uniform vec4 uSheet;      // sheet: flat-part end y, bottom y, visible (0/1), global fade
uniform float uSplit;
uniform float uNeon;      // the signs' opacity: how much neon the rain can catch
uniform float uDpr;
out vec4 fragColor;
float cover(float x, float hw) { float aa = 0.55 / uDpr + 0.2; return 1.0 - smoothstep(hw - aa, hw + aa, abs(x)); }
void main() {
  float along = vLocal.y;
  float body = smoothstep(0.0, 0.92, along) * (1.0 - 0.55 * smoothstep(0.94, 1.0, along));
  vec3 cov = vec3(cover(vLocal.x - uSplit, vHalf), cover(vLocal.x, vHalf), cover(vLocal.x + uSplit, vHalf));
  float inside = step(uSect.y, vPx.y) * step(vPx.y, uSect.y + uSect.w) * step(uSect.x, vPx.x) * step(vPx.x, uSect.x + uSect.z);
  float sheet = uSheet.z * (1.0 - clamp((vPx.y - uSheet.x) / max(uSheet.y - uSheet.x, 1.0), 0.0, 1.0));
  float a = vAlpha * body * inside * (1.0 - sheet) * uSheet.w;
  vec3 col = mix(vec3(0.84, 0.89, 0.96), vColor, vTint * uNeon);
  fragColor = vec4(col * cov * a, a * (cov.r + cov.g + cov.b) / 3.0);
}`;

const LINE_FRAG = /* glsl */`
precision highp float;
in vec2 vPx;
uniform vec4 uRect;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTip;       // px of soft fade at the growing end (0 once the line is complete)
out vec4 fragColor;
void main() {
  float toEnd = uRect.y + uRect.w - vPx.y;
  float a = uAlpha * (uTip > 0.0 ? smoothstep(0.0, uTip, toEnd) : 1.0);
  fragColor = vec4(uColor * a, a);
}`;

// Seeded random, so the rain is the same field every visit (and in screenshots).
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const TINTS = [hex('#00F0FF'), hex('#FF0055'), hex('#9FB4FF'), hex('#F19072')];
const WHITE = hex('#D6E3F5');

function opacityOf(el) {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
  return parseFloat(cs.opacity);
}

export function createRain(ctx) {
  const section = document.querySelector('.s04');
  const rainEl = section?.querySelector('.rain');
  const signsEl = section?.querySelector('.signs');
  const sheetEl = section?.querySelector('.bloom');
  const rulesEl = section?.querySelector('.rules');
  const coarse = !matchMedia('(hover: hover) and (pointer: fine)').matches;

  // instance attributes, built once for the maximum count
  const r = rng(0x5eed04);
  const seed = new Float32Array(MAX * 4), look = new Float32Array(MAX * 4), color = new Float32Array(MAX * 3);
  for (let i = 0; i < MAX; i++) {
    const depth = Math.pow(r(), 1.35);                     // mostly far, fine rain; a few near streaks
    seed.set([r(), r(), 0.8 + 0.4 * r(), depth], i * 4);
    const tinted = r() < 0.34;
    look.set([0.7 + 0.6 * r(), tinted ? 0.35 + 0.5 * r() : 0, 0.02 + 0.5 * r(), 0.8 + 0.4 * r()], i * 4);
    color.set(tinted ? TINTS[Math.floor(r() * TINTS.length)] : WHITE, i * 3);
  }
  const geo = new InstancedBufferGeometry();
  geo.setAttribute('position', unitQuad().getAttribute('position').clone());
  geo.setIndex(unitQuad().getIndex().clone());
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
  geo.setAttribute('aLook', new InstancedBufferAttribute(look, 4));
  geo.setAttribute('aColor', new InstancedBufferAttribute(color, 3));
  geo.instanceCount = 0;

  const blend = { blending: CustomBlending };
  const uniforms = {
    uView: { value: [1, 1] }, uSect: { value: [0, 0, 1, 1] }, uFall: { value: 0 }, uFreeze: { value: 0 },
    uVel: { value: 0 }, uSplit: { value: 0 }, uRules: { value: RULES }, uSheet: { value: [0, 0, 0, 1] },
    uNeon: { value: 1 }, uDpr: { value: 1 },
  };
  const mat = rawMaterial({ vertex: VERT, fragment: FRAG, uniforms, ...blend });
  premultiplied(mat);
  const streaks = new Mesh(geo, mat);
  streaks.frustumCulled = false; streaks.visible = false; streaks.renderOrder = 10;
  ctx.scene.add(streaks);

  const lines = RULES.map(() => {
    const u = { uView: { value: [1, 1] }, uRect: { value: [0, 0, 0, 0] }, uColor: { value: [0.55, 0.58, 0.64] }, uAlpha: { value: 0 }, uTip: { value: 0 } };
    const m = rawMaterial({ vertex: RECT_VERT, fragment: LINE_FRAG, uniforms: u, ...blend });
    premultiplied(m);
    const mesh = new Mesh(unitQuad(), m);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 11;
    ctx.scene.add(mesh);
    return mesh;
  });

  let fall = 0, drawnOnce = false;

  function frame(F) {
    streaks.visible = false; lines.forEach(l => { l.visible = false; });
    if (!section) return null;
    const st = ScrollTrigger.getById('s04');
    if (!st) return null;
    const sr = section.getBoundingClientRect();
    const sect = { x: sr.left, y: sr.top, w: sr.width, h: sr.height };
    if (!intersects(sect, F.w, F.h)) return null;
    const y = st.scroll();
    if (y > st.end + 1) return null;                       // past the pin: the rules seam covers S04

    const freeze = clamp(parseFloat(rainEl?.style.getPropertyValue('--freeze')) || 0, 0, 1);
    const neon = signsEl ? opacityOf(signsEl) : 1;
    const rules = opacityOf(rulesEl);
    // fade in under the lifting bloom sheet and through the first 10% of the pin
    const pinLen = Math.max(1, st.end - st.start);
    const fade = smoothstep(st.start - 0.5 * F.h, st.start + 0.1 * pinLen, y);
    let sheet = [0, 0, 0, fade];
    if (sheetEl && opacityOf(sheetEl) > 0.01) {
      const b = sheetEl.getBoundingClientRect();
      const feather = Math.max(1, b.height - sect.h);
      sheet = [b.bottom - feather, b.bottom, 1, fade];
    }
    const vel = Math.min(1.2, F.ripple);
    fall += F.dt * 1500 * (1 - freeze) * (1 + 1.3 * vel);
    if (fall > 1e6) fall -= 1e6;

    const count = Math.round(clamp(1150 * (sect.w * sect.h) / (1920 * 1080), 360, MAX) * (coarse ? 0.55 : 1));
    geo.instanceCount = count;
    const u = uniforms;
    u.uView.value = [F.w, F.h];
    u.uSect.value = [sect.x, sect.y, sect.w, sect.h];
    u.uFall.value = fall;
    u.uFreeze.value = freeze;
    u.uVel.value = vel;
    u.uSplit.value = F.tier >= 3 ? Math.min(2, 2.4 * vel) : 0;
    u.uSheet.value = sheet;
    u.uNeon.value = neon;
    u.uDpr.value = F.dpr;
    const streaking = fade > 0 && freeze < 0.999;
    streaks.visible = streaking;

    // the two hairlines: drawn top → bottom as the rain freezes, then handed to the DOM rules
    const grow = smoothstep(0.3, 0.92, freeze);
    const lineA = smoothstep(0.25, 0.75, freeze) * (1 - rules) * fade;
    if (grow > 0 && lineA > 0.002) {
      // colour settles from rain-light toward the rules' --sumi-3 as the seam arrives
      const t = smoothstep(0.0, 0.6, rules);
      const c = [0.62 + (0.29 - 0.62) * t, 0.66 + (0.275 - 0.66) * t, 0.72 + (0.247 - 0.72) * t];
      RULES.forEach((fx, i) => {
        const m = lines[i];
        m.material.uniforms.uView.value = [F.w, F.h];
        m.material.uniforms.uRect.value = [sect.x + fx * sect.w - 0.5, sect.y, 1, sect.h * grow];
        m.material.uniforms.uColor.value = c;
        m.material.uniforms.uAlpha.value = lineA * 0.85;
        m.material.uniforms.uTip.value = grow < 0.999 ? Math.min(90, 0.12 * sect.h) : 0;
        m.visible = true;
      });
    }
    if (!streaks.visible && !lines[0].visible) return { key: 'rain-empty', animating: false, raise: true };
    return {
      key: `${sect.x}|${sect.y}|${sect.w}|${sect.h}|${freeze}|${neon}|${rules}|${sheet.join(',')}|${vel.toFixed(3)}|${F.w}|${F.h}`,
      animating: streaking, raise: true,
    };
  }

  function afterDraw() {
    if (!drawnOnce) { drawnOnce = true; section.classList.add('gl-ready'); }
  }
  function unload() {
    drawnOnce = false;
    streaks.visible = false; lines.forEach(l => { l.visible = false; });
    section?.classList.remove('gl-ready');
  }
  function dispose() {
    unload();
    ctx.scene.remove(streaks); lines.forEach(l => ctx.scene.remove(l));
    geo.dispose(); mat.dispose(); lines.forEach(l => l.material.dispose());
  }
  const hide = () => { streaks.visible = false; lines.forEach(l => { l.visible = false; }); };
  return { name: 'rain', section, ready: true, load() {}, unload, frame, afterDraw, dispose, hide };
}

function premultiplied(m) {
  m.blendSrc = OneFactor; m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor; m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.transparent = true;
}
