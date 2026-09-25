/* S02 静寂 Echoes of Stillness · the stones counter (and the haiku's quiet companions).

   Ryōan-ji's fifteen stones are said to be arranged so that all fifteen can never be seen at once from
   any one point on the veranda. The walk along the veranda (p = 0..1, called every frame of the pan)
   therefore shows 14 or 13 stones in view: never 15. The counter is aria-hidden; the fact is in the
   section's text. The DOM is written only when the number changes.

   The core rises the three Japanese lines in during the walk; this module lets the washi veil behind them
   gather first and the English gloss and credit follow the last line, so the gloss never shows before the
   poem. They are tweened in a paused timeline driven by p, created inside the core's gsap.matchMedia
   context, so switching motion off reverts them to the static page (everything visible). */
import { gsap } from 'gsap';

// Stretches of the walk where a second stone slips behind a nearer one (walk progress 0..1).
const THIRTEEN = [[0.19, 0.35], [0.61, 0.79]];
export const stonesInView = (p) => (THIRTEEN.some(([a, b]) => p >= a && p < b) ? 13 : 14);

export function stonesCounter(root) {
  const count = root?.querySelector('.stones__count');
  const veil = root?.querySelector('.poem__veil');
  const later = root ? [...root.querySelectorAll('.gloss, .poem__credit')] : [];

  // Walk p ↔ pin progress: the walk spans pin 0–0.70; the lines rise over pin 0.12–0.40.
  const reveal = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  if (veil) reveal.fromTo(veil, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 0.1);
  if (later.length) reveal.fromTo(later, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.14, stagger: 0.07, ease: 'power2.out' }, 0.54);
  reveal.set({}, {}, 1);                                   // the timeline spans the whole walk: time = p

  let shown = count ? Number(count.textContent) : null, last = -1;
  return (p) => {
    p = gsap.utils.clamp(0, 1, p);
    if (p === last) return;
    last = p;
    reveal.time(p);
    const n = stonesInView(p);
    if (count && n !== shown) { shown = n; count.textContent = String(n); }
  };
}
