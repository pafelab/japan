/* S03 旅 Traverse · the Nara deer bows back (spec R11).
   Nara's sika deer are known for bowing. Bow to this one — rest the pointer on it for a moment, or press
   the button — and it bows in return: the head and neck dip and come back up (a still, bowed pose when
   motion is off), and a polite live region says so. Called by the core on every build, motion on or off. */

const DWELL_MS = 1200;          // hover this long to count as a bow
const BOW_MS = 1500;            // one bow, down and back up
const SAY_MS = 4200;            // how long the line stays on screen
const LINE = '<span lang="ja">お辞儀</span> — the deer bows back';

// head angle over the bow: dip, hold, rise, a small second nod, rest
const BOW_FRAMES = [
  { transform: 'rotate(0deg)', offset: 0 },
  { transform: 'rotate(-34deg)', offset: 0.34, easing: 'ease-in-out' },
  { transform: 'rotate(-34deg)', offset: 0.52, easing: 'ease-in-out' },
  { transform: 'rotate(-3deg)', offset: 0.78, easing: 'ease-in-out' },
  { transform: 'rotate(-9deg)', offset: 0.88, easing: 'ease-in-out' },
  { transform: 'rotate(0deg)', offset: 1 },
];

export function initDeer(root, { signal, motion = true } = {}) {
  const deer = root?.querySelector('.deer');
  if (!deer) return () => {};
  const head = deer.querySelector('.deer__head');
  const said = root.querySelector('.deer__said');
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const cancel = (id) => { if (id) { clearTimeout(id); timers.delete(id); } };
  let dwell = 0, hush = 0, bowing = false, anim = null;

  function say() {
    if (!said) return;
    cancel(hush);
    said.classList.remove('is-shown');
    said.textContent = '';                               // clear first, so a repeat bow is announced again
    later(() => {
      said.innerHTML = LINE;
      said.classList.add('is-shown');
      hush = later(() => { said.classList.remove('is-shown'); hush = later(() => { said.textContent = ''; }, 800); }, SAY_MS);
    }, 80);
  }

  function bow() {
    cancel(dwell); dwell = 0;
    if (bowing) return;
    bowing = true;
    say();
    if (motion && head && typeof head.animate === 'function') {
      anim = head.animate(BOW_FRAMES, { duration: BOW_MS, easing: 'linear' });
      anim.finished.catch(() => {}).finally(() => { anim = null; bowing = false; });
    } else {                                               // motion off: swap poses, no animation
      deer.classList.add('is-bowed');
      later(() => { deer.classList.remove('is-bowed'); bowing = false; }, BOW_MS);
    }
  }

  const opts = signal ? { signal } : undefined;
  deer.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;               // touch and pen: a tap is the bow
    cancel(dwell);
    dwell = later(bow, DWELL_MS);
  }, opts);
  deer.addEventListener('pointerleave', () => { cancel(dwell); dwell = 0; }, opts);
  deer.addEventListener('click', bow, opts);               // Enter / Space / tap

  return () => {
    timers.forEach(clearTimeout); timers.clear();
    anim?.cancel(); anim = null; bowing = false;
    deer.classList.remove('is-bowed');
    if (said) { said.classList.remove('is-shown'); said.textContent = ''; }
  };
}
