/* Route builder · "Plan this route" (spec §4.7). Lazy chunk, loaded by ./index.js on first use.

   A modal <dialog> (dialog#route-builder in src/partials/route-dialog.html) seeded with the six stops of the
   piece. Reorder (buttons; drag with a fine pointer), remove and restore stops; every leg shows its mode and
   an approximate time from a symmetric table; a schematic equirectangular map follows the order; the route
   is shared as ?route=miyajima,kyoto,… (Web Share when available, else the clipboard). Focus returns to the
   CTA on close; moves and removals are announced politely. */
import { STOPS, SEED, byId, FUJI, leg, fmt, spoken, parseRoute } from './route-data.js';
import { getLenis } from '../choreography.js';

const $ = (s, r = document) => r.querySelector(s);
const motionOK = () => document.documentElement.dataset.motion === 'on'
  && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';                   // --ease-expressive

const ICON = {
  up: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5.5 12.5 10 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  remove: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10 5v10M5 10h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  grip: '<svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="3.5" cy="5" r="1.3"/><circle cx="8.5" cy="5" r="1.3"/><circle cx="3.5" cy="10" r="1.3"/><circle cx="8.5" cy="10" r="1.3"/><circle cx="3.5" cy="15" r="1.3"/><circle cx="8.5" cy="15" r="1.3"/></g></svg>',
  check: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4.5 10.5 8.3 14 15.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const state = { order: [...SEED], removed: [] };            // removed: [{ id, at }] (at = index to restore to)
let ui = null, opener = null, lenisHeld = false, drag = null;
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ── Derived values ─────────────────────────────────────────────────────────────────────────── */
const legsOf = (order) => order.slice(1).map((id, i) => ({ from: order[i], to: id, ...leg(order[i], id) }));
const totalOf = (order) => legsOf(order).reduce((sum, l) => sum + l.min, 0);
const shareURL = () => `${location.origin}${location.pathname}?route=${state.order.join(',')}`;
const names = (ids) => ids.map(id => byId[id].en);

/* ── Open / close ───────────────────────────────────────────────────────────────────────────── */
export function openRouteBuilder({ opener: from = null, route } = {}) {
  if (!ui) bind();
  opener = from;
  let note = '';
  if (route != null) {                                       // a shared link: restore its route
    const ids = parseRoute(route);
    if (ids.length >= 2) {
      state.order = ids;
      state.removed = SEED.filter(id => !ids.includes(id))
        .map(id => ({ id, at: seedSlot(id, ids) }));
      note = `Opened a shared route: ${names(ids).join(', ')}.`;
    } else {
      state.order = [...SEED]; state.removed = [];
      note = 'That link didn’t hold a route we recognise, so here are the six stops.';
    }
  }
  render();
  if (!ui.d.open) {
    ui.d.showModal();
    const lenis = getLenis();                                // the wheel belongs to the dialog while open
    if (lenis && !lenis.isStopped) { lenis.stop(); lenisHeld = true; }
  }
  ui.title.focus({ preventScroll: true });
  if (note) setStatus(note);
}

function onClose() {
  if (lenisHeld) { getLenis()?.start(); lenisHeld = false; }
  drag = null;
  const back = opener; opener = null;
  if (back?.isConnected) back.focus({ preventScroll: true });
  const params = new URLSearchParams(location.search);       // a reload shouldn't reopen a shared route
  if (params.has('route')) {
    params.delete('route');
    const q = params.toString();
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
}

/* ── Wiring (once) ──────────────────────────────────────────────────────────────────────────── */
function bind() {
  const d = document.getElementById('route-builder');
  ui = {
    d, title: $('#route-title', d), list: $('[data-route-list]', d), tray: $('[data-route-tray]', d),
    removed: $('[data-route-removed]', d), count: $('[data-route-count]', d), map: $('[data-route-map]', d),
    total: $('[data-route-total]', d), legs: $('[data-route-legs]', d), url: $('[data-route-url]', d),
    copy: $('[data-route-copy]', d), share: $('[data-route-share]', d), reset: $('[data-route-reset]', d),
    status: $('[data-route-status]', d), live: $('[data-route-live]', d),
  };
  ui.map.setAttribute('role', 'img');
  if (typeof navigator.share === 'function') ui.share.hidden = false;

  $('[data-route-close]', d).addEventListener('click', () => d.close());
  d.addEventListener('close', onClose);
  let downOnBackdrop = false;                                // light dismiss: press and release outside the panel
  d.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === d; });
  d.addEventListener('click', (e) => { if (e.target === d && downOnBackdrop) d.close(); downOnBackdrop = false; });

  ui.list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    act(b.dataset.act, b.closest('.stop').dataset.id);
  });
  ui.tray.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-restore]');
    if (b) restore(b.dataset.restore);
  });
  ui.reset.addEventListener('click', () => {
    change(() => { state.order = [...SEED]; state.removed = []; });
    announce(`Route reset to the six stops. Travel time about ${spoken(totalOf(state.order))}.`);
  });
  ui.copy.addEventListener('click', copyLink);
  ui.share.addEventListener('click', shareLink);
  ui.url.addEventListener('focus', () => ui.url.select());
  bindDrag();
}

/* ── Actions ────────────────────────────────────────────────────────────────────────────────── */
function act(kind, id) {
  const i = state.order.indexOf(id), n = state.order.length;
  if (kind === 'up' || kind === 'down') {
    const j = i + (kind === 'up' ? -1 : 1);
    if (j < 0 || j >= n) return;
    change(() => { state.order.splice(i, 1); state.order.splice(j, 0, id); });
    focusStop(id, kind);
    announce(`${byId[id].en} is ${position(id)}. Travel time about ${spoken(totalOf(state.order))}.`);
  } else if (kind === 'remove') {
    if (n <= 2) return;
    change(() => { state.order.splice(i, 1); state.removed.push({ id, at: i }); });
    focusStop(state.order[Math.min(i, state.order.length - 1)], 'up');
    announce(`${byId[id].en} removed. ${state.order.length} stops, travel time about ${spoken(totalOf(state.order))}. You can add it back from the removed list.`);
  }
}

function restore(id) {
  const r = state.removed.find(x => x.id === id);
  if (!r) return;
  change(() => {
    state.removed = state.removed.filter(x => x.id !== id);
    state.order.splice(Math.min(r.at, state.order.length), 0, id);
  });
  focusStop(id, 'up');
  announce(`${byId[id].en} added back, ${position(id)}. Travel time about ${spoken(totalOf(state.order))}.`);
}

function moveTo(id, to) {                                     // drag and drop
  const from = state.order.indexOf(id);
  if (from < 0 || to === from) return;
  change(() => { state.order.splice(from, 1); state.order.splice(to, 0, id); });
  announce(`${byId[id].en} is ${position(id)}.`);
}

// "now stop 3 of 6, between Nara and Osaka"
function position(id) {
  const o = state.order, i = o.indexOf(id), n = o.length;
  const prev = o[i - 1] && byId[o[i - 1]].en, next = o[i + 1] && byId[o[i + 1]].en;
  if (i === 0) return `now the first stop, before ${next}`;
  if (i === n - 1) return `now the last stop, after ${prev}`;
  return `now stop ${i + 1} of ${n}, between ${prev} and ${next}`;
}
// where a stop missing from a shared route goes back: before the first later stop in the seed order
function seedSlot(id, order) {
  const s = SEED.indexOf(id);
  const k = order.findIndex(x => SEED.indexOf(x) > s);
  return k < 0 ? order.length : k;
}

// Apply a state change and re-render, animating rows to their new places (FLIP) when motion is on.
function change(mutate) {
  const before = new Map([...ui.list.children].map(li => [li.dataset.id, li.getBoundingClientRect().top]));
  mutate();
  render();
  setStatus('');                                              // the old link no longer matches
  if (!motionOK()) return;
  for (const li of ui.list.children) {
    const top = before.get(li.dataset.id);
    if (top == null) {
      li.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
      continue;
    }
    const dy = top - li.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 360, easing: EASE });
  }
  ui.map.querySelector('.map__route')?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 300, easing: EASE });
}

function focusStop(id, pref) {
  const li = ui.list.querySelector(`.stop[data-id="${id}"]`);
  if (!li) return;
  const order = { up: ['up', 'down', 'remove'], down: ['down', 'up', 'remove'], remove: ['remove', 'up', 'down'] }[pref];
  const b = order.map(a => li.querySelector(`[data-act="${a}"]`)).find(x => x && x.getAttribute('aria-disabled') !== 'true');
  (b ?? li.querySelector('[data-act]'))?.focus();
}

let liveTimer = 0;
function announce(msg) {                                      // re-set so repeated messages are read again
  clearTimeout(liveTimer);
  ui.live.textContent = '';
  liveTimer = setTimeout(() => { ui.live.textContent = msg; }, 60);
}
function setStatus(msg, ok = false) {
  ui.status.innerHTML = msg ? `${ok ? ICON.check : ''}<span>${msg}</span>` : '';
  ui.status.classList.toggle('is-ok', ok);
}

/* ── Share ──────────────────────────────────────────────────────────────────────────────────── */
async function copyLink() {
  const url = shareURL();
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch { /* permission or insecure context */ }
  if (!ok) {
    ui.url.focus(); ui.url.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ui.copy.focus();
  }
  setStatus(ok ? 'Link copied. Paste it anywhere to share this route.' : 'Your browser blocked copying: select the link above and copy it.', ok);
}

async function shareLink() {
  const url = shareURL();
  const text = `My route through Japan’s light: ${names(state.order).join(' → ')} (approx. ${fmt(totalOf(state.order))} of travel).`;
  try {
    await navigator.share({ title: 'Komorebi & Neon · a route', text, url });
    setStatus('Shared.', true);
  } catch (err) {
    if (err?.name === 'AbortError') return;                  // the reader closed the share sheet
    copyLink();
  }
}

/* ── Drag to reorder (fine pointers; the buttons do the same for everyone) ─────────────────────── */
function bindDrag() {
  const list = ui.list;
  const clearMarks = () => list.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging')
    .forEach(el => el.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging'));
  const slot = (y) => {                                       // insertion index among the rows
    const rows = [...list.children];
    const k = rows.findIndex(li => { const r = li.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return k < 0 ? rows.length : k;
  };
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.stop__grip')?.closest('.stop');
    if (li) li.draggable = true;
  });
  list.addEventListener('pointerup', () => list.querySelectorAll('.stop[draggable="true"]').forEach(li => { li.draggable = false; }));
  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest?.('.stop');
    if (!li?.draggable) { e.preventDefault(); return; }
    drag = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', byId[drag].en);
    requestAnimationFrame(() => li.classList.add('is-dragging'));
  });
  list.addEventListener('dragover', (e) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const k = slot(e.clientY), rows = [...list.children];
    list.querySelectorAll('.is-drop-before, .is-drop-after').forEach(el => el.classList.remove('is-drop-before', 'is-drop-after'));
    if (k < rows.length) rows[k].classList.add('is-drop-before'); else rows.at(-1)?.classList.add('is-drop-after');
  });
  list.addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault();
    const k = slot(e.clientY), from = state.order.indexOf(drag), id = drag;
    drag = null; clearMarks();
    moveTo(id, k > from ? k - 1 : k);
  });
  list.addEventListener('dragend', () => {
    drag = null; clearMarks();
    list.querySelectorAll('.stop[draggable="true"]').forEach(li => { li.draggable = false; });
  });
}

/* ── Rendering ──────────────────────────────────────────────────────────────────────────────── */
function render() {
  const o = state.order, n = o.length, legs = legsOf(o), total = totalOf(o), grip = fine();
  const tool = (a, label, off) =>
    `<button type="button" class="stop__btn stop__btn--${a}" data-act="${a}" aria-label="${label}"${off ? ' aria-disabled="true"' : ''}>${ICON[a]}</button>`;

  ui.list.classList.toggle('has-grip', grip);
  ui.list.innerHTML = o.map((id, i) => {
    const s = byId[id], L = legs[i];
    return `<li class="stop${L ? ` stop--${L.kind}` : ' stop--last'}" data-id="${id}">
      ${grip ? `<span class="stop__grip" aria-hidden="true" title="Drag to reorder">${ICON.grip}</span>` : ''}
      <span class="stop__rail" aria-hidden="true"><span class="stop__num">${i + 1}</span></span>
      <div class="stop__text">
        <p class="stop__name"><span class="visually-hidden">Stop ${i + 1}: </span><span class="stop__ja" lang="ja">${s.ja}</span> <span class="stop__en">${s.en}</span></p>
        <p class="stop__note">${s.note}</p>
      </div>
      <div class="stop__tools">
        ${tool('up', `Move ${s.en} earlier`, i === 0)}${tool('down', `Move ${s.en} later`, i === n - 1)}${tool('remove', `Remove ${s.en}`, n <= 2)}
      </div>
      ${L ? `<p class="leg"><span class="visually-hidden">Then to ${byId[L.to].en}: </span><span class="leg__mode">${L.mode}</span> <span class="leg__time"><span aria-hidden="true">approx. ${fmt(L.min)}</span><span class="visually-hidden">, about ${spoken(L.min)}</span></span></p>` : ''}
    </li>`;
  }).join('');

  ui.removed.hidden = state.removed.length === 0;
  ui.tray.innerHTML = state.removed.map(({ id }) => {
    const s = byId[id];
    return `<li><button type="button" class="chip" data-restore="${id}" aria-label="Add ${s.en} back">${ICON.plus}<span class="chip__ja" lang="ja">${s.ja}</span> ${s.en}</button></li>`;
  }).join('');

  ui.count.textContent = `${n} of ${STOPS.length}`;
  ui.total.innerHTML = `<span class="route__approx">approx.</span> <span aria-hidden="true">${fmt(total)}</span><span class="visually-hidden">about ${spoken(total)}</span>`;
  ui.legs.textContent = `${legs.length} ${legs.length === 1 ? 'leg' : 'legs'}, not counting your stays`;
  ui.url.value = shareURL();
  renderMap();
}

// Equirectangular: x = (lon − 131.9°)·cos 35°, y = 36° − lat, both in hundredths of a degree.
const VB = { x: -30, y: -50, w: 780, h: 300 };
const project = ({ lat, lon }) => [(lon - 131.9) * 81.92, (36 - lat) * 100];
const pct = ([x, y]) => [((x - VB.x) / VB.w) * 100, ((y - VB.y) / VB.h) * 100];
const f1 = (v) => Math.round(v * 10) / 10;

function renderMap() {
  const o = state.order;
  let grid = '';
  for (let lon = 132; lon <= 140; lon++) {
    const x = f1((lon - 131.9) * 81.92);
    grid += `<line class="map__grid${lon % 5 ? '' : ' map__grid--major'}" x1="${x}" y1="${VB.y}" x2="${x}" y2="${VB.y + VB.h}"/>`;
  }
  for (let lat = 34; lat <= 36; lat++) {
    const y = (36 - lat) * 100;
    grid += `<line class="map__grid${lat === 35 ? ' map__grid--major' : ''}" x1="${VB.x}" y1="${y}" x2="${VB.x + VB.w}" y2="${y}"/>`;
  }
  const legs = legsOf(o).map(L => {
    const [x1, y1] = project(byId[L.from]), [x2, y2] = project(byId[L.to]);
    const k = 0.14, cx = (x1 + x2) / 2 + (y2 - y1) * k, cy = (y1 + y2) / 2 - (x2 - x1) * k;   // bow to the left of travel
    return `<path class="map__leg map__leg--${L.kind}" d="M${f1(x1)} ${f1(y1)}Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}"/>`;
  }).join('');

  const pin = (s, n) => {
    const [l, t] = pct(project(s));
    return `<span class="pin pin--${s.pin}${n ? '' : ' pin--off'}" style="left:${f1(l)}%;top:${f1(t)}%">
      <span class="pin__dot"></span><span class="pin__label">${n ? `<span class="pin__n">${n}</span>` : ''}<span class="pin__ja" lang="ja">${s.ja}</span> <span class="pin__en">${s.en}</span></span></span>`;
  };
  const [fl, ft] = pct(project(FUJI));
  const tick = (cls, style, text) => `<span class="map__tick ${cls}" style="${style}">${text}</span>`;
  const ticks = tick('map__tick--lat', `top:${f1(pct([0, 100])[1])}%`, '35°N') + tick('map__tick--lat', `top:${f1(pct([0, 200])[1])}%`, '34°N')
    + tick('map__tick--lon', `left:${f1(pct([(135 - 131.9) * 81.92, 0])[0])}%`, '135°E') + tick('map__tick--lon', `left:${f1(pct([(140 - 131.9) * 81.92, 0])[0])}%`, '140°E');

  ui.map.style.aspectRatio = `${VB.w} / ${VB.h}`;
  ui.map.innerHTML = `<svg class="map__svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g class="map__graticule">${grid}</g><g class="map__route">${legs}</g></svg>
    <div class="map__pins" aria-hidden="true">
      ${ticks}
      <span class="map__fuji" style="left:${f1(fl)}%;top:${f1(ft)}%"></span>
      ${state.removed.map(({ id }) => pin(byId[id], null)).join('')}
      ${o.map((id, i) => pin(byId[id], i + 1)).join('')}
    </div>`;
  ui.map.setAttribute('aria-label', `Schematic map of the route: ${o.map((id, i) => `${i + 1}, ${byId[id].en}`).join('; ')}.`);
}
