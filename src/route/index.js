/* Route CTA · progressive enhancement (spec §4.7).
   Without JavaScript every [data-route-cta] is a plain link to #field-notes. initRouteCTA() (called once
   at boot) turns each one into a button that opens dialog#route-builder; the builder itself, its data and
   its map are a separate chunk, fetched on first hover, focus or click. A shared ?route=… link opens the
   builder with that route as soon as the page loads. */

let chunk = null;
const load = () => (chunk ??= import('./route-builder.js'));

export function initRouteCTA() {
  const dialog = document.getElementById('route-builder');
  if (!dialog || typeof dialog.showModal !== 'function') return;          // no <dialog>: keep the links

  for (const a of document.querySelectorAll('[data-route-cta]')) {
    if (a.dataset.routeReady) continue;
    a.dataset.routeReady = '';
    a.setAttribute('role', 'button');                                    // it no longer navigates
    a.setAttribute('aria-haspopup', 'dialog');
    a.setAttribute('aria-controls', 'route-builder');
    // Our listener runs before the core's document-level anchor router, which skips prevented clicks.
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // new tab etc.: the link
      e.preventDefault();
      open(a);
    });
    a.addEventListener('keydown', (e) => {                               // buttons also activate on Space
      if (e.key === ' ' && !e.repeat) { e.preventDefault(); open(a); }
    });
    a.addEventListener('pointerenter', () => { load().catch(() => {}); }, { once: true });
    a.addEventListener('focus', () => { load().catch(() => {}); }, { once: true });
  }

  const shared = new URLSearchParams(location.search).get('route');
  if (shared != null) open(null, shared);
}

async function open(opener, route) {
  try {
    const { openRouteBuilder } = await load();
    openRouteBuilder({ opener, route });
  } catch (err) {                                                       // chunk failed: fall back to the link
    chunk = null;
    console.error('[route] the route builder could not load', err);
    if (opener) location.assign(opener.getAttribute('href'));
  }
}
