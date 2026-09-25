/* Route data for the "Plan this route" builder (spec §4.7). Loaded lazily with the builder.

   Stops use the coordinates of the scenes they come from (spec §9.2; approximate, two decimals).
   LEGS is symmetric: one entry per unordered pair, 6 stops → 15 pairs. Minutes are approximate
   station-to-station travel including the local links and one reasonable change, rounded to 5 min;
   they are for planning a feel for the trip, not for catching trains. Every figure is on the fact-check
   list in the build report. kind: 'rail' | 'shinkansen' (solid on the map) · 'ferry' | 'bus' (dashed). */

export const STOPS = [
  { id: 'miyajima', en: 'Miyajima', ja: '宮島', lat: 34.30, lon: 132.32, note: 'Itsukushima’s Ōtorii at dawn', pin: 'e' },
  { id: 'kyoto', en: 'Kyoto', ja: '京都', lat: 35.03, lon: 135.72, note: 'Ryōan-ji’s stones, Arashiyama’s bamboo', pin: 'n' },
  { id: 'nara', en: 'Nara', ja: '奈良', lat: 34.69, lon: 135.84, note: 'Nara Park and its deer', pin: 'e' },
  { id: 'osaka', en: 'Osaka', ja: '大阪', lat: 34.67, lon: 135.50, note: 'Dōtonbori’s first neon', pin: 'w' },
  { id: 'tokyo', en: 'Tokyo', ja: '東京', lat: 35.69, lon: 139.70, note: 'Shinjuku at night', pin: 'n' },
  { id: 'kawaguchiko', en: 'Lake Kawaguchi', ja: '河口湖', lat: 35.52, lon: 138.75, note: 'Akafuji from the north shore', pin: 'w' },
];
export const SEED = STOPS.map(s => s.id);
export const byId = Object.fromEntries(STOPS.map(s => [s.id, s]));
export const FUJI = { lat: 35.36, lon: 138.73 };            // the summit, for the map's small mountain

// Accepted spellings in a shared ?route= link
export const ALIASES = {
  itsukushima: 'miyajima', hiroshima: 'miyajima',
  kawaguchi: 'kawaguchiko', 'lake-kawaguchi': 'kawaguchiko', 'lakekawaguchi': 'kawaguchiko', fuji: 'kawaguchiko',
  shinjuku: 'tokyo', dotonbori: 'osaka', arashiyama: 'kyoto',
};

const LEG_LIST = [
  ['kyoto', 'miyajima', 150, 'ferry', 'Ferry, JR Sanyō Line, Shinkansen'],
  ['miyajima', 'nara', 195, 'ferry', 'Ferry, JR, Shinkansen to Kyoto, then Kintetsu'],
  ['miyajima', 'osaka', 140, 'ferry', 'Ferry, JR Sanyō Line, Shinkansen'],
  ['miyajima', 'tokyo', 300, 'ferry', 'Ferry, JR Sanyō Line, Shinkansen'],
  ['kawaguchiko', 'miyajima', 390, 'ferry', 'Ferry, JR, Shinkansen to Mishima, highway bus'],
  ['kyoto', 'nara', 45, 'rail', 'Kintetsu or JR Nara Line'],
  ['kyoto', 'osaka', 30, 'rail', 'JR Special Rapid'],
  ['kyoto', 'tokyo', 135, 'shinkansen', 'Tōkaidō Shinkansen'],
  ['kawaguchiko', 'kyoto', 240, 'bus', 'Tōkaidō Shinkansen to Mishima, highway bus'],
  ['nara', 'osaka', 40, 'rail', 'Kintetsu or JR Yamatoji Line'],
  ['nara', 'tokyo', 195, 'shinkansen', 'Kintetsu to Kyoto, Tōkaidō Shinkansen'],
  ['kawaguchiko', 'nara', 300, 'bus', 'Kintetsu, Shinkansen to Mishima, highway bus'],
  ['osaka', 'tokyo', 150, 'shinkansen', 'Tōkaidō Shinkansen'],
  ['kawaguchiko', 'osaka', 255, 'bus', 'Tōkaidō Shinkansen to Mishima, highway bus'],
  ['kawaguchiko', 'tokyo', 120, 'bus', 'Limited express or highway bus from Shinjuku'],
];
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const LEGS = new Map(LEG_LIST.map(([a, b, min, kind, mode]) => [key(a, b), { min, kind, mode }]));

/** The leg between two stops, in either direction. */
export const leg = (a, b) => LEGS.get(key(a, b));

/** 45 → "45 min" · 150 → "2 h 30" · 300 → "5 h" */
export function fmt(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
/** Spoken form for screen readers: "2 hours 30 minutes" */
export function spoken(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const hs = h ? `${h} hour${h > 1 ? 's' : ''}` : '', ms = m ? `${m} minutes` : '';
  return [hs, ms].filter(Boolean).join(' ');
}

/** Parse a ?route= value into known, de-duplicated stop ids (order kept). */
export function parseRoute(value) {
  const ids = String(value ?? '').toLowerCase().split(/[\s,;|>]+/).map(s => s.trim()).filter(Boolean)
    .map(s => ALIASES[s] ?? s).filter(s => byId[s]);
  return [...new Set(ids)];
}
