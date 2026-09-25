/* Ambience · one bed of sound per scene, synthesized in the browser with Web Audio (no audio files).
   Off by default and never autoplays: nothing is created until enable() runs inside a click.

     const a = createAmbience({ velocity: () => scroll.velocity });
     a.enable(); a.setScene('s02');   // beds crossfade over 1.5 s as the scene changes
     a.pause(); a.resume();           // hidden tab
     a.disable();                     // fade out, then every node is stopped and disconnected

   Beds (storyboard §4, R7): s01 sea wash at dawn · s02 cicadas (the haiku's 蝉の声) · field-notes a
   faint room tone · s03 rail rumble with the joint rhythm · s04 rain on the city with the 100 Hz
   buzz of neon on Tokyo's 50 Hz mains · s05 a quiet forge · s06 dawn wind and a bush warbler.
   Each bed is noise and oscillators shaped by filters and envelopes. Discrete events (waves, calls,
   clicks) are scheduled a little ahead on the audio clock, so the same code renders offline for tests.
   Levels: master × trim puts every bed's peaks at or below about −18 dBFS (measured offline). */

const MASTER = 0.5;                  // master gain once faded in
const XFADE = 1.5;                   // scene crossfade, s
const FADE_IN = 1.2, FADE_OUT = 0.8; // enable / disable fades, s
const LOOKAHEAD = 1.2;               // how far ahead events are scheduled, s
const TICK_MS = 200;                 // scheduler period
const SETTLE_MS = 160;               // a scene must hold this long before its bed starts (fast scrolls)

// Per-bed trims (linear), tuned with an OfflineAudioContext render of each bed.
export const TRIM = { s01: 0.46, s02: 0.28, 'field-notes': 0.5, s03: 0.32, s04: 0.58, s05: 0.72, s06: 0.9 };

const rand = (a, b) => a + Math.random() * (b - a);
const poisson = (rate) => -Math.log(1 - Math.random()) / rate;   // gap to the next random event

// ── Noise tables: a seamless 6 s loop per colour, generated once per context ─────────────────
const tables = new WeakMap();
function noiseBuffer(ctx, colour) {
  let t = tables.get(ctx);
  if (!t) tables.set(ctx, (t = {}));
  if (t[colour]) return t[colour];
  const sr = ctx.sampleRate, len = Math.round(sr * 6), X = Math.round(sr * 0.25);
  const raw = new Float32Array(len + X);
  if (colour === 'pink') {                                   // Paul Kellet's refined pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;    b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;    b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (colour === 'brown') {                           // leaky integral of white noise
    let last = 0;
    for (let i = 0; i < raw.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; raw[i] = last * 3.5; }
  } else {
    for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1;
  }
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  d.set(raw.subarray(0, len));
  for (let i = 0; i < X; i++) {                              // equal-power crossfade: the loop has no seam
    const h = (i / X) * Math.PI / 2;
    d[i] = raw[i] * Math.sin(h) + raw[len + i] * Math.cos(h);
  }
  return (t[colour] = buf);
}

// ── Node kit: tracks a bed's long-lived nodes so the bed can be stopped and disconnected whole ──
function kit(ctx) {
  const nodes = new Set(), sources = new Set();
  const own = (n) => (nodes.add(n), n);
  const k = {
    ctx,
    gain(v = 1) { const g = own(ctx.createGain()); g.gain.value = v; return g; },
    filter(type, frequency, Q = 0.7071) {
      const f = own(ctx.createBiquadFilter()); f.type = type; f.frequency.value = frequency; f.Q.value = Q; return f;
    },
    pan(p = 0) {
      if (!ctx.createStereoPanner) return k.gain(1);
      const s = own(ctx.createStereoPanner()); s.pan.value = p; return s;
    },
    delay(time) { const d = own(ctx.createDelay(2)); d.delayTime.value = time; return d; },
    noise(colour, rate = 1) {
      const s = own(ctx.createBufferSource());
      s.buffer = noiseBuffer(ctx, colour); s.loop = true; s.playbackRate.value = rate;
      s.start(0, Math.random() * s.buffer.duration);
      sources.add(s); return s;
    },
    osc(type, frequency) {
      const o = own(ctx.createOscillator()); o.type = type; o.frequency.value = frequency; o.start(0);
      sources.add(o); return o;
    },
    lfo(frequency, depth, param, type = 'sine') {            // adds ±depth to an AudioParam
      const o = k.osc(type, frequency); o.connect(k.gain(depth)).connect(param); return o;
    },
    chain(...ns) { for (let i = 1; i < ns.length; i++) ns[i - 1].connect(ns[i]); return ns[ns.length - 1]; },
    // One-shot voices (clicks, calls): untracked nodes that disconnect themselves when src ends.
    shot(src, when, dur, parts = [], offset) {
      sources.add(src);
      src.onended = () => {
        sources.delete(src);
        for (const n of [src, ...parts]) { try { n.disconnect(); } catch { /* gone */ } }
      };
      if (offset == null) src.start(when); else src.start(when, offset);
      src.stop(when + dur);
      return src;
    },
    burst(when, dur, parts) {                                 // a white-noise one-shot
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 'white');
      return k.shot(s, when, dur, parts, Math.random() * (s.buffer.duration - dur - 0.1));
    },
    stop(when) { for (const s of sources) { try { s.stop(when); } catch { /* already stopped */ } } },
    dispose() {
      for (const s of sources) { try { s.stop(); } catch { /* stopped */ } }
      for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } }
      nodes.clear(); sources.clear();
    },
  };
  return k;
}

// Raw one-shot nodes (not tracked by the kit; cleaned up by kit.shot's onended).
const G = (ctx, v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const F = (ctx, type, f, Q = 0.7071) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
const P = (ctx, p) => { if (!ctx.createStereoPanner) return G(ctx, 1); const s = ctx.createStereoPanner(); s.pan.value = p; return s; };

// An envelope that swells to `peak` over `rise` seconds and settles back to `floor` over `fall`.
function swell(param, t, floor, peak, rise, fall) {
  param.setTargetAtTime(peak, t, rise / 3);
  param.setTargetAtTime(floor, t + rise, fall / 3);
}
// A percussive envelope: near-instant attack, exponential decay (tau seconds).
function hit(param, t, peak, tau, attack = 0.002) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0, t + attack, tau);
}
// An event stream: fire(t) schedules one event and returns the gap to the next one.
function stream(first, fire) {
  let next = null;
  return (t0, t1) => {
    if (next === null) next = t0 + first;
    if (next < t0) next = t0 + 0.02;                          // fell behind (stalled tab): no burst of events
    while (next < t1) next += Math.max(0.01, fire(next));
  };
}
const all = (...streams) => (t0, t1) => streams.forEach(s => s(t0, t1));

// ── The beds ──────────────────────────────────────────────────────────────────────────────
const BEDS = {
  // 鳥居 · the Inland Sea at dawn: a low body of water and waves that wash in and fizz back out.
  s01(k, out) {
    const bodyF = k.filter('lowpass', 340, 0.5);
    k.chain(k.noise('brown'), bodyF, k.gain(0.22), out);
    k.lfo(0.045, 80, bodyF.frequency);
    const washes = [-0.55, 0.55].map(p => {
      const f = k.filter('bandpass', 650, 0.55), g = k.gain(0.12);
      k.chain(k.noise('pink'), f, g, k.pan(p), out);
      return { f, g };
    });
    const fizz = k.gain(0);
    k.chain(k.noise('white'), k.filter('highpass', 2600, 0.7), k.filter('lowpass', 6500, 0.7), fizz, out);
    return {
      schedule: stream(rand(0.3, 1.5), (t) => {
        const i = Math.random() < 0.5 ? 0 : 1, a = washes[i], b = washes[1 - i];
        const peak = rand(1.0, 1.6), rise = rand(2.2, 3.2), fall = rand(4.2, 5.6);
        swell(a.g.gain, t, 0.12, peak, rise, fall);
        swell(a.f.frequency, t, 650, rand(1500, 2000), rise, fall);
        swell(b.g.gain, t + rand(0.3, 0.9), 0.12, peak * 0.55, rise, fall);
        swell(fizz.gain, t + rise * 0.85, 0, peak * 0.06, 0.7, 2.6);
        return rand(6.5, 10.5);
      }),
    };
  },

  // 静寂 · cicadas in the garden trees: band-passed noise buzzing at ~50 Hz, in phrases that swell and
  // fade, three voices at different distances, and now and then a higurashi's falling "kana-kana".
  s02(k, out) {
    const { ctx } = k;
    k.chain(k.noise('pink'), k.filter('lowpass', 900, 0.5), k.gain(0.05), out);   // garden air
    const soft = k.filter('lowpass', 6200, 0.5);                                     // never piercing
    soft.connect(out);
    // a distant chorus that never stops, so the garden is never quite silent between phrases
    const far = k.gain(0.6); k.lfo(47, 0.4, far.gain);
    k.chain(k.noise('white'), k.filter('bandpass', 4300, 3), k.filter('bandpass', 4300, 2), far, k.gain(0.55), soft);
    const voices = [
      { f: 4100, pan: -0.45, lvl: 1.0, am: 52 },
      { f: 4750, pan: 0.5, lvl: 0.6, am: 61 },
      { f: 3500, pan: 0.1, lvl: 0.42, am: 44 },
    ].map(v => {
      const bp1 = k.filter('bandpass', v.f, 9), bp2 = k.filter('bandpass', v.f * 1.012, 6);
      const am = k.gain(0.6); k.lfo(v.am, 0.4, am.gain);                  // the buzz: 0.2‥1 at ~50 Hz
      const throb = k.gain(0.78); k.lfo(rand(5, 7.5), 0.22, throb.gain);  // the slow "mi-mi-mi"
      const env = k.gain(0);
      k.chain(k.noise('white'), bp1, bp2, am, throb, env, k.pan(v.pan), soft);
      return {
        ...v, bp1,
        phrase: stream(rand(0, 2.5), (t) => {
          const a = rand(1.2, 2.6), hold = rand(2.5, 7), r = rand(1.8, 3);
          env.gain.setTargetAtTime(v.lvl * 3.2 * rand(0.8, 1), t, a / 3);
          env.gain.setTargetAtTime(0, t + a + hold, r / 3);
          bp1.frequency.setTargetAtTime(v.f * 1.035, t, 0.8);            // pitch lifts into the phrase
          bp1.frequency.setTargetAtTime(v.f, t + a + hold, 1);
          return a + hold + r + rand(1.2, 4.5);
        }),
      };
    });
    const kana = (t) => {                                     // higurashi: pulses falling in pitch
      const o = ctx.createOscillator(), g = G(ctx), p = P(ctx, rand(-0.6, 0.6));
      o.type = 'sine'; o.connect(g).connect(p).connect(soft);
      const n = Math.round(rand(12, 17)), L = 0.05;
      let s = t, f = rand(4300, 4650), ioi = 0.115;
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1), a = L * Math.min(1, x / 0.25) * Math.min(1, (1 - x) / 0.55 + 0.1);
        o.frequency.setValueAtTime(f, s);
        o.frequency.exponentialRampToValueAtTime(f * 0.92, s + 0.075);
        hit(g.gain, s, a, 0.022, 0.012);
        s += ioi; ioi *= 1.03; f *= 0.986;
      }
      k.shot(o, t, s - t + 0.3, [g, p]);
    };
    return { schedule: all(...voices.map(v => v.phrase), stream(rand(8, 16), (t) => { kana(t); return rand(26, 48); })) };
  },

  // 記 · field notes: a faint room tone, close to silence.
  'field-notes'(k, out) {
    k.chain(k.noise('brown'), k.filter('lowpass', 220, 0.5), k.gain(0.1), out);
    k.chain(k.noise('pink'), k.filter('bandpass', 420, 0.5), k.gain(0.012), out);
    return {};
  },

  // 旅 · the train: a low rumble, air on the body, and the ta-tan of the rail joints. Scrolling faster
  // brightens the rumble and quickens the joints a little.
  s03(k, out) {
    const { ctx } = k;
    const rumbleF = k.filter('lowpass', 150, 0.8), rumble = k.gain(0.9);
    k.chain(k.noise('brown'), rumbleF, rumble, out);
    k.lfo(0.21, 0.1, rumble.gain);                           // the carriage sways
    const hull = k.gain(0.1);
    k.chain(k.noise('pink'), k.filter('bandpass', 480, 0.9), hull, out);
    k.chain(k.osc('sine', 43), k.gain(0.05), out);           // felt more than heard
    const joints = k.gain(1); joints.connect(out);
    let period = 1.3, side = 1;
    const click = (t, a) => {
      const bp = F(ctx, 'bandpass', rand(1100, 1500), 1.4), g = G(ctx), p = P(ctx, 0.15 * side);
      k.burst(t, 0.06, [bp, g]).connect(bp).connect(g).connect(p).connect(joints);
      hit(g.gain, t, a * 0.35, 0.012);
      const o = ctx.createOscillator(), g2 = G(ctx);
      o.frequency.value = rand(88, 100); o.connect(g2).connect(p);
      hit(g2.gain, t, a * 0.4, 0.035, 0.004);
      k.shot(o, t, 0.3, [g2, p]);
    };
    return {
      schedule: stream(0.4, (t) => {
        side = -side;
        click(t, rand(0.7, 0.85)); click(t + 0.13, 1);
        return period * rand(0.97, 1.03);
      }),
      speed(v, now) {
        const s = Math.min(1, v / 2500);
        rumbleF.frequency.setTargetAtTime(150 + 120 * s, now, 0.5);
        hull.gain.setTargetAtTime(0.1 + 0.1 * s, now, 0.5);
        period = 1.3 - 0.45 * s;
      },
    };
  },

  // 東京 · rain on Shinjuku: a wide pink-noise shower, drips on awnings, the murmur of distant traffic
  // and the 100 Hz buzz of neon ballasts (Tokyo's mains run at 50 Hz).
  s04(k, out) {
    const { ctx } = k;
    [-0.6, 0.6].forEach(p => k.chain(k.noise('pink'), k.filter('highpass', 450, 0.6), k.filter('lowpass', 6000, 0.5), k.gain(0.3), k.pan(p), out));
    k.chain(k.noise('white'), k.filter('highpass', 5200, 0.7), k.gain(0.022), out);
    const city = k.gain(0.5);
    k.chain(k.noise('brown'), k.filter('bandpass', 120, 0.8), city, out);
    k.lfo(0.05, 0.15, city.gain);
    k.chain(k.osc('sawtooth', 100), k.filter('lowpass', 320, 3), k.gain(0.012), k.pan(0.3), out);
    const drip = (t) => {
      const bp = F(ctx, 'bandpass', rand(1800, 4200), 4), g = G(ctx), p = P(ctx, rand(-0.8, 0.8));
      k.burst(t, 0.05, [bp, g, p]).connect(bp).connect(g).connect(p).connect(out);
      hit(g.gain, t, rand(0.1, 0.3), 0.01, 0.001);
    };
    return { schedule: stream(0.1, (t) => { drip(t); return poisson(5); }) };
  },

  // 匠 · the workshop late at night: room tone, the forge breathing with the bellows, charcoal
  // crackle and, far off, a smith's hammer on the anvil.
  s05(k, out) {
    const { ctx } = k;
    k.chain(k.noise('brown'), k.filter('lowpass', 280, 0.6), k.gain(0.16), out);
    const bellows = k.gain(0.06);
    k.chain(k.noise('pink'), k.filter('bandpass', 240, 1), bellows, out);
    k.lfo(0.2, 0.045, bellows.gain);
    // a small room for the hammer: feedback delay, darkened each pass
    const room = k.gain(1), d = k.delay(0.11), fb = k.gain(0.3), dark = k.filter('lowpass', 2400, 0.5), wet = k.gain(0.4);
    room.connect(out); k.chain(room, d, dark, fb, d); dark.connect(wet).connect(out);
    const crackle = (t) => {
      const hp = F(ctx, 'highpass', rand(2000, 3200), 0.8), g = G(ctx), p = P(ctx, rand(-0.45, 0.1));
      k.burst(t, 0.012, [hp, g, p]).connect(hp).connect(g).connect(p).connect(out);
      hit(g.gain, t, rand(0.08, 0.3), rand(0.002, 0.005), 0.0005);
    };
    const hammer = (t, a) => {                                // inharmonic partials of struck steel
      const f0 = rand(620, 700), lp = F(ctx, 'lowpass', 3000, 0.5), g = G(ctx, a * 0.09), p = P(ctx, 0.35);
      lp.connect(g).connect(p).connect(room);
      [[1, 1, 0.9], [2.76, 0.5, 0.45], [5.4, 0.25, 0.25], [8.93, 0.12, 0.12]].forEach(([r, amp, tau], i) => {
        const o = ctx.createOscillator(), e = G(ctx);
        o.frequency.value = f0 * r; o.connect(e).connect(lp);
        hit(e.gain, t, amp, tau / 3, 0.001);
        k.shot(o, t, tau * 2.5 + 0.1, i === 0 ? [e, lp, g, p] : [e]);   // the fundamental rings longest
      });
    };
    return {
      schedule: all(
        stream(0.2, (t) => { crackle(t); if (Math.random() < 0.18) { crackle(t + rand(0.02, 0.06)); crackle(t + rand(0.07, 0.12)); } return poisson(3.2); }),
        stream(rand(2, 4), (t) => { hammer(t, 1); if (Math.random() < 0.4) hammer(t + rand(0.42, 0.55), 0.7); return rand(6.5, 12); }),
      ),
    };
  },

  // 富士 · first light at the lake: soft wind, the air over the water, and a bush warbler (uguisu)
  // singing its "hō-hokekyo" across the lake, with the odd small chirp.
  s06(k, out) {
    const { ctx } = k;
    const windF = k.filter('bandpass', 650, 0.45), wind = k.gain(0.08);
    k.chain(k.noise('pink'), windF, wind, k.pan(-0.2), out);
    k.lfo(0.055, 0.045, wind.gain); k.lfo(0.13, 0.02, wind.gain); k.lfo(0.04, 180, windF.frequency);
    k.chain(k.noise('brown'), k.filter('lowpass', 200, 0.5), k.gain(0.12), out);
    const birds = k.filter('lowpass', 6000, 0.5), d = k.delay(0.23), fb = k.gain(0.22), wet = k.gain(0.3);
    birds.connect(out); k.chain(birds, d, fb, d); d.connect(wet).connect(out);
    const voice = (t, dur) => {
      const o = ctx.createOscillator(), g = G(ctx), p = P(ctx, rand(-0.55, 0.55));
      o.type = 'sine'; o.connect(g).connect(p).connect(birds);
      k.shot(o, t, dur, [g, p]);
      return { f: o.frequency, g: g.gain };
    };
    const note = (v, s, d, f1, f2, a) => {                  // one gated glide; pitch jumps happen in silence
      v.f.setValueAtTime(f1, s); v.f.exponentialRampToValueAtTime(f2, s + d);
      v.g.setValueAtTime(0, s); v.g.linearRampToValueAtTime(a, s + 0.015);
      v.g.setValueAtTime(a, s + d - 0.025); v.g.linearRampToValueAtTime(0, s + d);
    };
    const uguisu = (t) => {
      const L = rand(0.15, 0.19), m = rand(0.95, 1.07), v = voice(t, 2.4);
      v.f.setValueAtTime(1060 * m, t); v.f.linearRampToValueAtTime(1180 * m, t + 0.95);    // hōoo…
      v.g.setValueAtTime(0, t); v.g.linearRampToValueAtTime(L * 0.75, t + 0.35);
      v.g.linearRampToValueAtTime(L, t + 0.85); v.g.linearRampToValueAtTime(0, t + 1.0);
      let s = t + 1.14;
      note(v, s, 0.1, 2500 * m, 2350 * m, L * 0.9);                                          // ho
      s += 0.16; note(v, s, 0.08, 3300 * m, 2950 * m, L * 0.75);                              // ke
      s += 0.14;                                                                             // kyo
      v.f.setValueAtTime(2300 * m, s); v.f.exponentialRampToValueAtTime(3400 * m, s + 0.05);
      v.f.exponentialRampToValueAtTime(2000 * m, s + 0.42);
      v.g.setValueAtTime(0, s); v.g.linearRampToValueAtTime(L, s + 0.02);
      v.g.setValueAtTime(L, s + 0.3); v.g.linearRampToValueAtTime(0, s + 0.45);
    };
    const chirp = (t) => {
      const n = Math.random() < 0.5 ? 2 : 3, L = rand(0.08, 0.11), v = voice(t, n * 0.16 + 0.2);
      for (let i = 0; i < n; i++) note(v, t + i * 0.15, 0.075, rand(5000, 5400), rand(4000, 4300), L);
    };
    return { schedule: stream(rand(2.5, 4.5), (t) => { (Math.random() < 0.6 ? uguisu : chirp)(t); return rand(9, 17); }) };
  },
};
export const SCENE_BEDS = Object.keys(BEDS);

// Build one scene's bed into `dest`. Its `out` gain is the crossfade handle (starts silent).
export function buildBed(ctx, dest, id) {
  const make = BEDS[id];
  if (!make) return null;
  const k = kit(ctx);
  const out = k.gain(0), trim = k.gain(TRIM[id] ?? 1);
  trim.connect(out); out.connect(dest);
  const spec = make(k, trim) || {};
  return {
    id, out,
    schedule: spec.schedule || (() => {}),
    speed: spec.speed || null,
    stop: (when) => k.stop(when),
    dispose: () => k.dispose(),
  };
}

// Master chain: every bed → master (fades) → a 28 Hz high-pass (keeps brown-noise drift out) → out.
export function buildMaster(ctx, dest = ctx.destination) {
  const sum = ctx.createGain(), master = ctx.createGain(), hp = ctx.createBiquadFilter();
  master.gain.value = 0; hp.type = 'highpass'; hp.frequency.value = 28;
  sum.connect(master).connect(hp).connect(dest);
  return { sum, master, level: MASTER };
}

function rampTo(param, value, now, dur) {
  const v = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(v, now);
  param.linearRampToValueAtTime(value, now + dur);
}

export function createAmbience({ velocity } = {}) {
  let ctx = null, chain = null, enabled = false, paused = false;
  let want = null, current = null;
  const leaving = new Set();
  let ticker = 0, settle = 0, teardown = 0, unlock = null;

  const tick = () => {
    if (!ctx || ctx.state !== 'running' || !current) return;
    const now = ctx.currentTime;
    if (current.speed && velocity) current.speed(Math.abs(+velocity() || 0), now);
    current.schedule(now, now + LOOKAHEAD);
  };
  const startTicking = () => { if (!ticker) ticker = setInterval(tick, TICK_MS); };
  const stopTicking = () => { clearInterval(ticker); ticker = 0; };

  const armUnlock = () => {                                  // a browser that kept the context asleep
    if (unlock || !ctx) return;
    unlock = () => { if (enabled && !paused) ctx.resume().catch(() => {}); disarmUnlock(); };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  };
  const disarmUnlock = () => {
    if (!unlock) return;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    unlock = null;
  };

  function retire(bed, now) {
    rampTo(bed.out.gain, 0, now, XFADE);
    bed.stop(now + XFADE + 0.05);
    leaving.add(bed);
    setTimeout(() => { bed.dispose(); leaving.delete(bed); }, (XFADE + 0.3) * 1000);
  }
  function switchTo(id) {
    if (!enabled || !ctx || current?.id === id) return;
    const now = ctx.currentTime;
    if (current) retire(current, now);
    current = buildBed(ctx, chain.sum, id);
    if (!current) return;
    current.out.gain.setValueAtTime(0, now);
    current.out.gain.linearRampToValueAtTime(1, now + XFADE);
    current.schedule(now, now + LOOKAHEAD);
  }

  function enable() {
    if (enabled) return Promise.resolve();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('Web Audio is not available'));
    enabled = true; paused = false;
    clearTimeout(teardown);
    if (!ctx) {
      try { ctx = new AC({ latencyHint: 'playback' }); } catch { ctx = new AC(); }
      chain = buildMaster(ctx);
    }
    const running = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
    rampTo(chain.master.gain, chain.level, ctx.currentTime, FADE_IN);
    if (want) switchTo(want);
    startTicking();
    return Promise.resolve(running).then(() => { if (enabled && ctx.state !== 'running') armUnlock(); });
  }

  function disable() {
    if (!enabled) return;
    enabled = false; paused = false;
    clearTimeout(settle); stopTicking(); disarmUnlock();
    if (!ctx) return;
    rampTo(chain.master.gain, 0, ctx.currentTime, FADE_OUT);
    clearTimeout(teardown);
    teardown = setTimeout(() => {                            // after the fade: stop and disconnect everything
      for (const bed of [current, ...leaving]) if (bed) { bed.stop(); bed.dispose(); }
      current = null; leaving.clear();
      if (!enabled) ctx.suspend().catch(() => {});
    }, (FADE_OUT + 0.15) * 1000);
  }

  function setScene(id) {
    if (!id) return;
    want = id;
    if (!enabled || !ctx) return;
    clearTimeout(settle);
    if (!current) switchTo(id);
    else if (current.id !== id) settle = setTimeout(() => switchTo(want), SETTLE_MS);
  }

  function pause() {
    if (!enabled || paused || !ctx) return;
    paused = true; stopTicking();
    rampTo(chain.master.gain, 0, ctx.currentTime, 0.08);
    setTimeout(() => { if (paused) ctx.suspend().catch(() => {}); }, 120);
  }
  function resume() {
    if (!enabled || !paused || !ctx) return;
    paused = false;
    ctx.resume().then(() => {
      if (!enabled || paused) return;
      rampTo(chain.master.gain, chain.level, ctx.currentTime, 0.6);
      startTicking();
    }, armUnlock);
  }

  return {
    get enabled() { return enabled; },
    get scene() { return current?.id ?? null; },
    get context() { return ctx; },
    enable, disable, setScene, pause, resume,
  };
}
