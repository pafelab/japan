/* HUD controls (storyboard §2.3, §6): the motion and sound toggles.
   The core (choreography.js) owns the HUD's mode, progress and aria-current; this module only wires
   the two buttons. Sound is off by default and nothing audio-related exists until the first click:
   that click is the user gesture that lets the AudioContext start. */
import { setMotionPref, motionState } from '../choreography.js';
import { bus, scroll } from '../app.js';
import { createAmbience } from '../audio/ambience.js';

const hasWebAudio = () => typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);

function reflect(btn, on) {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  const state = btn.querySelector('.hud__toggle-state');
  if (state) state.textContent = on ? 'on' : 'off';
}

let started = false;
export function initHudUI() {
  if (started) return;
  const hud = document.querySelector('.hud');
  if (!hud) return;
  started = true;
  hud.classList.add('is-live');                          // the toggles work now: show them

  // ── Motion: mirrors the effective motion state; a click stores the opposite choice ──
  const motionBtn = hud.querySelector('[data-toggle="motion"]');
  if (motionBtn) {
    reflect(motionBtn, !!motionState().on);
    bus.addEventListener('motion', (e) => reflect(motionBtn, !!e.detail?.on));
    motionBtn.addEventListener('click', () => {
      const next = !motionState().on;
      reflect(motionBtn, next);                          // instant feedback; the 'motion' event confirms
      setMotionPref(next);
    });
  }

  // ── Sound: created on the first click, then follows the scene the reader is in ──
  const soundBtn = hud.querySelector('[data-toggle="sound"]');
  if (!soundBtn) return;
  if (!hasWebAudio()) { soundBtn.hidden = true; return; }
  reflect(soundBtn, false);
  let ambience = null;
  if (window.__kn) window.__kn.ambience = () => ambience;   // test hook, only with ?harness

  soundBtn.addEventListener('click', () => {
    ambience ??= createAmbience({ velocity: () => scroll.velocity });
    if (ambience.enabled) {
      ambience.disable();
      reflect(soundBtn, false);
      return;
    }
    const running = ambience.enable();                   // inside the gesture: the context may start
    ambience.setScene(scroll.scene);
    reflect(soundBtn, true);
    Promise.resolve(running).catch(() => { ambience.disable(); reflect(soundBtn, false); });
  });

  bus.addEventListener('scene', (e) => { if (ambience?.enabled) ambience.setScene(e.detail?.id); });

  // A hidden tab goes quiet, and picks up where it was when the reader comes back.
  const onVisibility = () => {
    if (!ambience?.enabled) return;
    if (document.hidden) ambience.pause(); else ambience.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => ambience?.enabled && ambience.pause());
  window.addEventListener('pageshow', (e) => { if (e.persisted && ambience?.enabled && !document.hidden) ambience.resume(); });
}
