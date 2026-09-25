/* Shared state for the whole piece. Nothing here touches the DOM, so every module can import it.

   bus events (CustomEvent, read e.detail):
     'scene'  { id }     the scene at mid-screen changed: 's01' 's02' 'field-notes' 's03' 's04' 's05' 's06'
     'motion' { on }     effective motion changed (system setting or the HUD toggle); fired after the rebuild
     'tier'   { tier }   quality tier changed (0 static · 1 DOM · 2 WebGL · 3 full)
*/
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

// Read every frame by the WebGL stage and the audio; written only by choreography.js.
export const scroll = { y: 0, velocity: 0, progress: 0, scene: 's01', motion: false, tier: 0 };

export const SCENES = ['s01', 's02', 'field-notes', 's03', 's04', 's05', 's06'];

// Remembered motion choice (§6): 'on' | 'off' | null (null = follow prefers-reduced-motion).
const KEY = 'kn:motion';
export const prefs = {
  get motion() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set motion(v) { try { v == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* private mode */ } },
};
