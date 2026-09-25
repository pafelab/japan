/* Rasterizing the DOM pictures the stage replaces.

   The art is inline SVG with literal colours (contract §2), so a clone serialized into an <img> renders
   exactly as it does in the page. rasterSVG() sizes the clone to its CSS box × scale (the viewBox and
   preserveAspectRatio are untouched, so the framing is identical). paintBox() paints a small DOM subtree
   (CSS background colours and linear/radial gradients, opacity, filters, and the inline SVGs inside it)
   into one canvas, for pictures like the lake whose water is a CSS gradient. */

const SVGNS = 'http://www.w3.org/2000/svg';

// How the SVG's user space maps into its CSS box: px = t + s·user (viewBox + preserveAspectRatio).
export function userTransform(svg, W, H) {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = vb.length === 4 && !vb.some(Number.isNaN) && vb[2] && vb[3] ? vb : [0, 0, W, H];
  const par = (svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim().split(/\s+/);
  if (par[0] === 'none') return { sx: W / vw, sy: H / vh, tx: -vx * W / vw, ty: -vy * H / vh };
  const sc = par[1] === 'slice' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
  const ax = /xMin/.test(par[0]) ? 0 : /xMax/.test(par[0]) ? 1 : 0.5;
  const ay = /YMin/.test(par[0]) ? 0 : /YMax/.test(par[0]) ? 1 : 0.5;
  return { sx: sc, sy: sc, tx: (W - vw * sc) * ax - vx * sc, ty: (H - vh * sc) * ay - vy * sc };
}

// crop (optional): { box: {w, h} the SVG's CSS box, sub: {x, y, w, h} the part of it to rasterize }.
export function serializeSVG(svg, width, height, mutate, crop) {
  const clone = svg.cloneNode(true);
  if (crop) {                                              // rasterize only the part we need
    const t = userTransform(svg, crop.box.w, crop.box.h);
    const { x, y, w, h } = crop.sub;
    clone.setAttribute('viewBox', `${(x - t.tx) / t.sx} ${(y - t.ty) / t.sy} ${w / t.sx} ${h / t.sy}`);
    clone.setAttribute('preserveAspectRatio', 'none');
  } else if (!clone.getAttribute('viewBox')) {             // keep the framing when the size changes
    const r = svg.getBoundingClientRect();
    clone.setAttribute('viewBox', `0 0 ${r.width || width} ${r.height || height}`);
  }
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  for (const a of ['style', 'class', 'aria-hidden', 'role', 'focusable']) clone.removeAttribute(a);
  mutate?.(clone);
  let str = new XMLSerializer().serializeToString(clone);
  if (!/^<svg[^>]*\sxmlns=/.test(str)) str = str.replace(/^<svg/, `<svg xmlns="${SVGNS}"`);
  return str;
}

export async function svgImage(svg, width, height, mutate, crop) {
  const url = URL.createObjectURL(new Blob([serializeSVG(svg, width, height, mutate, crop)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

// Target raster size for a CSS box: box × scale, capped by the GPU's texture limit and a pixel budget.
export function rasterSize(w, h, scale, maxDim = 4096, maxPixels = 4096 * 2304) {
  let s = scale;
  s = Math.min(s, maxDim / Math.max(w, 1), maxDim / Math.max(h, 1));
  s = Math.min(s, Math.sqrt(maxPixels / Math.max(w * h, 1)));
  return { pw: Math.max(1, Math.round(w * s)), ph: Math.max(1, Math.round(h * s)), s };
}

export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// One inline SVG → a canvas of exactly pw × ph.
export async function rasterSVG(svg, pw, ph, mutate) {
  const img = await svgImage(svg, pw, ph, mutate);
  const c = newCanvas(pw, ph);
  c.getContext('2d').drawImage(img, 0, 0, pw, ph);
  return c;
}

/* ── viewBox mapping: where a fraction of the viewBox height lands inside the element's box ─────────── */
export function viewBoxMapper(svg, boxW, boxH) {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(Number.isNaN) || !vb[2] || !vb[3]) return (f) => f;
  const [, , vw, vh] = vb;
  const par = (svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim().split(/\s+/);
  if (par[0] === 'none') return (f) => f;
  const slice = par[1] === 'slice';
  const s = slice ? Math.max(boxW / vw, boxH / vh) : Math.min(boxW / vw, boxH / vh);
  const align = /YMin/.test(par[0]) ? 0 : /YMax/.test(par[0]) ? 1 : 0.5;
  const oy = (boxH - vh * s) * align;
  return (f) => (oy + f * vh * s) / boxH;                  // → fraction of the element's box height
}

/* ── CSS backgrounds → canvas ──────────────────────────────────────────────────────────────────── */
function splitTop(str, sep = ',') {                        // split on sep outside parentheses
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const splitSpaces = (s) => splitTop(s, ' ').filter(Boolean);

function toPx(tok, len) {
  if (tok.endsWith('%')) return parseFloat(tok) / 100 * len;
  if (tok.endsWith('px')) return parseFloat(tok);
  return NaN;
}

function parseStops(parts, len) {
  const stops = [];
  for (const p of parts) {
    const toks = splitSpaces(p);
    if (!toks.length) continue;
    const isPos = (t) => /^-?[\d.]+(%|px)$/.test(t);
    if (toks.length === 1 && isPos(toks[0])) continue;      // colour hint: ignored
    const color = toks[0];
    const pos = toks.slice(1).map(t => toPx(t, len) / len);
    if (!pos.length) stops.push({ color, at: null });
    else pos.forEach(at => stops.push({ color, at }));
  }
  if (!stops.length) return stops;
  if (stops[0].at == null) stops[0].at = 0;
  if (stops[stops.length - 1].at == null) stops[stops.length - 1].at = 1;
  for (let i = 1; i < stops.length; i++) {                  // spread unpositioned stops evenly, keep order
    if (stops[i].at == null) {
      let j = i; while (stops[j].at == null) j++;
      const a = stops[i - 1].at, b = stops[j].at;
      for (let k = i; k < j; k++) stops[k].at = a + (b - a) * (k - i + 1) / (j - i + 1);
    }
    stops[i].at = Math.max(stops[i].at, stops[i - 1].at);
  }
  return stops;
}

function addStops(g, stops) {
  for (const s of stops) { try { g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color); } catch { /* unknown colour syntax */ } }
}

function linearGradient(ctx, args, w, h) {
  const parts = splitTop(args);
  let angle = Math.PI;                                     // default: to bottom
  const first = parts[0];
  if (/^-?[\d.]+(deg|rad|turn|grad)$/.test(first)) {
    const v = parseFloat(first);
    angle = first.endsWith('rad') ? v : first.endsWith('turn') ? v * 2 * Math.PI
          : first.endsWith('grad') ? v * Math.PI / 200 : v * Math.PI / 180;
    parts.shift();
  } else if (first.startsWith('to ')) {
    const t = first.slice(3);
    const dx = /right/.test(t) ? 1 : /left/.test(t) ? -1 : 0, dy = /bottom/.test(t) ? 1 : /top/.test(t) ? -1 : 0;
    angle = Math.atan2(dx * h, -dy * w);                   // corners: pointing at the corner is close enough
    if (dy === 0) angle = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (dx === 0) angle = dy > 0 ? Math.PI : 0;
    parts.shift();
  }
  const dx = Math.sin(angle), dy = -Math.cos(angle);
  const L = Math.abs(w * dx) + Math.abs(h * dy);
  const g = ctx.createLinearGradient(w / 2 - dx * L / 2, h / 2 - dy * L / 2, w / 2 + dx * L / 2, h / 2 + dy * L / 2);
  addStops(g, parseStops(parts, L));
  return g;
}

function radialGradient(ctx, args, w, h) {
  const parts = splitTop(args);
  let cx = w / 2, cy = h / 2, rx = null, ry = null, circle = false, extent = 'farthest-corner';
  if (!/^(rgb|rgba|hsl|hsla|#|color|oklab|oklch|lab|lch|transparent)/.test(parts[0])) {
    const shape = parts.shift();
    const [pre, at] = shape.split(/\bat\b/).map(s => s?.trim());
    if (at) {
      const t = splitSpaces(at);
      const kw = { left: 0, center: 0.5, right: 1, top: 0, bottom: 1 };
      const px = (tok, len) => (tok in kw ? kw[tok] * len : toPx(tok, len));
      cx = px(t[0], w); cy = px(t[1] ?? 'center', h);
    }
    const toks = splitSpaces(pre || '');
    circle = toks.includes('circle');
    const lens = toks.filter(t => /px|%/.test(t));
    if (lens.length) { rx = toPx(lens[0], w); ry = lens[1] ? toPx(lens[1], h) : rx; }
    const ext = toks.find(t => /(closest|farthest)-(side|corner)/.test(t));
    if (ext) extent = ext;
  }
  if (rx == null) {
    const dxs = [cx, w - cx], dys = [cy, h - cy];
    const side = extent.endsWith('side'), far = extent.startsWith('farthest');
    const pick = far ? Math.max : Math.min;
    rx = pick(...dxs); ry = pick(...dys);
    if (!side) { const k = Math.SQRT2; rx *= k; ry *= k; }
    if (circle) rx = ry = side ? pick(rx, ry) : Math.hypot(pick(...dxs), pick(...dys));
  }
  // canvas radial gradients are circular: draw a circle and squash the context for an ellipse
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, 1e-3));
  addStops(g, parseStops(parts, Math.max(rx, 1e-3)));
  return { g, cx, cy, sy: ry / Math.max(rx, 1e-3) };
}

function paintBackground(ctx, cs, w, h) {
  if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) {
    ctx.fillStyle = cs.backgroundColor;
    ctx.fillRect(0, 0, w, h);
  }
  const bi = cs.backgroundImage;
  if (!bi || bi === 'none') return;
  const layers = splitTop(bi).reverse();                  // CSS lists the top layer first
  for (const layer of layers) {
    const m = /^(repeating-)?(linear|radial)-gradient\((.*)\)$/s.exec(layer);
    if (!m) continue;
    if (m[2] === 'linear') { ctx.fillStyle = linearGradient(ctx, m[3], w, h); ctx.fillRect(0, 0, w, h); }
    else {
      const { g, cx, cy, sy } = radialGradient(ctx, m[3], w, h);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, sy); ctx.fillStyle = g;
      ctx.fillRect(-cx, -cy / sy, w, h / sy); ctx.restore();
    }
  }
}

const scaleFilter = (f, s) => f.replace(/(-?[\d.]+)px/g, (_, v) => (parseFloat(v) * s) + 'px');

/* Paint root's subtree into a canvas covering `crop` (default: root's whole layout box), in root-box CSS px.
   Transforms are ignored: descendants are placed by their rects relative to root, divided by root's scale.
   opts.skip(el)  → true to leave el (and its subtree) out
   opts.force(el) → true to paint el at full opacity even if GSAP has faded it (e.g. .akafuji)
   opts.mutateSVG(svg, clone) → edit an SVG clone before it is rasterized
   opts.rootBackground: false → don't paint root's own background
   Returns { canvas, painted } (painted = anything drawn at all). */
export async function paintBox(root, box, pw, ph, opts = {}) {
  const crop = opts.crop ?? { x: 0, y: 0, w: box.w, h: box.h };
  const canvas = newCanvas(pw, ph);
  const ctx = canvas.getContext('2d');
  const k = pw / crop.w;                                   // raster px per CSS px
  const R = root.getBoundingClientRect();
  const sx = R.width / Math.max(box.w, 1e-3), sy = R.height / Math.max(box.h, 1e-3);
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return { x: (r.left - R.left) / sx, y: (r.top - R.top) / sy, w: r.width / sx, h: r.height / sy };
  };
  const ops = [];                                          // painted in DOM order once every SVG has decoded
  const walk = (el, alpha, filter) => {
    if (opts.skip?.(el)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const a = alpha * (opts.force?.(el) ? 1 : parseFloat(cs.opacity || '1'));
    if (a <= 0.001) return;
    const f = cs.filter && cs.filter !== 'none' ? (filter ? filter + ' ' : '') + scaleFilter(cs.filter, k) : filter;
    const b = el === root ? { x: 0, y: 0, w: box.w, h: box.h } : rel(el);
    if (el instanceof SVGSVGElement) {
      const x0 = Math.max(b.x, crop.x), y0 = Math.max(b.y, crop.y);
      const x1 = Math.min(b.x + b.w, crop.x + crop.w), y1 = Math.min(b.y + b.h, crop.y + crop.h);
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return;
      const sub = { x: x0 - b.x, y: y0 - b.y, w: x1 - x0, h: y1 - y0 };
      const w = Math.max(1, Math.round(sub.w * k)), h = Math.max(1, Math.round(sub.h * k));
      ops.push({ b: { x: x0, y: y0, w: sub.w, h: sub.h }, a, f,
                 img: svgImage(el, w, h, (clone) => opts.mutateSVG?.(el, clone), { box: b, sub }) });
      return;
    }
    if (el instanceof SVGElement) return;
    if (el !== root || opts.rootBackground !== false) ops.push({ b, a, f, cs });
    for (const c of el.children) walk(c, a, f);
  };
  walk(root, 1, '');
  const imgs = await Promise.all(ops.map(o => o.img ?? null));
  let painted = false;
  ops.forEach((o, i) => {
    const hasBg = o.cs && (o.cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || o.cs.backgroundImage !== 'none');
    if (!imgs[i] && !hasBg) return;
    ctx.save();
    ctx.globalAlpha = o.a;
    if (o.f) ctx.filter = o.f;
    ctx.translate((o.b.x - crop.x) * k, (o.b.y - crop.y) * k);
    if (imgs[i]) ctx.drawImage(imgs[i], 0, 0, o.b.w * k, o.b.h * k);
    else { ctx.scale(k, k); paintBackground(ctx, o.cs, o.b.w, o.b.h); }
    painted = true;
    ctx.restore();
  });
  return { canvas, painted };
}
