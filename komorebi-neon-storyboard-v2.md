# Komorebi & Neon · 木漏れ日とネオン — Storyboard Review and v2 Plan

This document reviews the v1 storyboard and proposes a v2 that keeps its concept and fixes its mechanics. Part 1 is the review. Part 2 is the revised plan, written to be built from.

Everything that could be checked was checked. Library versions and options were read from the npm registry and the packages' own type definitions, and bundle sizes come from actually building them. Colour contrast was computed with the WCAG formula. The scroll choreography in §5.5 was run in Chromium under Playwright at five viewport sizes, on a touch profile and under reduced motion: 34 of 34 checks pass, after fixing two bugs the tests found. Cultural and geographic notes come from general knowledge and are flagged for a native reviewer and a fact-check pass in §9.

**Contents.** Part 1: verdict, what to keep, fixes, recommendations. Part 2: 1 Concept · 2 Design system · 3 Scroll architecture · 4 Scenes · 5 Technical architecture · 6 Accessibility and motion safety · 7 Mobile and input · 8 Performance budget · 9 Production and cultural notes · 10 Open questions.

---

# Part 1 — Review of v1

## 1.1 Verdict

v1 has a strong idea and a weak spec. The idea is a single scroll that walks from a vermilion gate at dawn to Tokyo neon and on to Fuji, with craft as the bridge between old and new. It is clear, filmic and worth building.

The spec underneath it is not buildable as written:

- The same scene is described with different numbers in the prose, the matrix and the code.
- Two of the six transitions cannot produce the picture they describe.
- The craft grid's code runs backwards.
- The route across Japan does not hold together.

None of this touches the concept. v2 keeps every scene's intent and changes the mechanics so that each number exists once, each transition is physically possible, and every effect degrades to a finished static page.

## 1.2 What to keep

v2 keeps these parts of v1 unchanged:

- the tradition-to-neon arc, and the two palettes it implies;
- Shippori Mincho as the display face;
- the torii as the threshold into the piece;
- a horizontal traverse as the "journey" beat, which is the one place on the page where sideways motion means something;
- differential column speeds in the craft grid;
- the Fuji "settle" as a pull-back to scale 1, which is the right direction for sharpness;
- planning the fallbacks from the start rather than bolting them on.

## 1.3 Fixes

These are objective problems: contradictions, things that cannot work as written, code bugs, and accessibility failures. "Measured" means verified in the test harness (§5.5) or computed.

| # | Where | Problem | v2 fix |
|---|---|---|---|
| F1 | S01, S02, S03, S05 | The same parameter has different values in the prose, the matrix and the code. S01's scroll length is "0–15% of the page" in one place and `end: '+=100%'` in another. Its mist scale is 2.0 or 2.2, and its mountain scale 1.2 or 1.15. S03 is budgeted at 3000px, but its own code yields `scrollWidth − innerWidth` ≈ 5760px on a 1920px screen. S05 has three different sets of speeds. | One `BUDGET` object, in viewport heights, is the single source of truth. Every table in this document is derived from it (§3.1). |
| F2 | S01 → S02 | "The camera passes through the torii directly into Scene 02" cannot happen. Scaling up the gate reveals S01's own sky and mountains through the opening, not S02, which sits further down the document. | The dolly ends in a flat fog frame, and S02 emerges from the same fog (§3.2). |
| F3 | S01 | A fixed `scale: 5.5` only clears the pillars at 16:9, and there only by luck (the required target is 5.49). At 21:9 the pillars stay in frame (it needs 7.31); 32:9 needs 10.97. On a portrait phone 2.40 is enough, so 5.5 spends 2.3× the scroll on a zoom that has already finished. **Measured** at five viewports. | Compute the cover scale from the measured gate opening on every refresh (§3.3). |
| F4 | S01 | Depth is inverted. The foreground mist scales 2.0–2.2× while the midground gate scales 5.5×. Nearer layers must grow faster, or the mist reads as sitting behind the gate. | Camera-dolly model: each plane scales by d/(d − Δ). The mist dissolves before it would engulf the frame (§3.3). |
| F5 | S03 | The card list ends with Nagano, but the text describes "the final card (Osaka)". | Route rebuilt as Kyoto → Nara → Osaka (R4). |
| F6 | S03 | `xPercent: -75` hard-codes four equal panels, and `end: 3000px` hard-codes a length unrelated to the distance the track travels. | `x: () => -(track.scrollWidth − root.clientWidth)` with `invalidateOnRefresh`, and the length comes from `BUDGET`. **Measured:** the last card is flush to the pixel, including after a resize. |
| F7 | S03 | The inner media's "x: −15% → +15%" uses `xPercent`, which is relative to the media element's own width. With media the same size as the card, its edges show. | Media is 130% of the card's width and moves ±0.15 × card width in px. **Measured:** 0px gap across the whole ride. |
| F8 | S03, S04, S06 | "Warm stone", "deep navy", "indigo", "peach" and gold are referenced but are not tokens. The modern palette has no text or muted-text colours. | Tokens added and contrast-checked (§2.1). |
| F9 | S02 | The description paragraph gets its own parallax offset (−120px in the prose, `yPercent: -20` in the matrix). Moving body text is harder to read and is a vestibular trigger. | Text stays on the page plane. The haiku lines get a one-time 24px reveal instead. |
| F10 | S04 | 200vh of scrub with no pin, so the scene would scroll away while it animates. | Pinned for 200vh (§4.5). |
| F11 | S04 | 東京 rotated 90° lies on its side. Japanese is set vertically, not rotated. | `writing-mode: vertical-rl; text-orientation: upright` (tategaki). TOKYO may stay rotated, because sideways Latin is the convention inside vertical text. |
| F12 | S05 | The code runs backwards. Kintsugi is described as 0.7× (slower), but `y: -120` makes it faster. Katana is described as 1.3× (faster), but `y: +180` makes it slower. **Measured** apparent speeds of the v1 code: 1.037 / 0.944 / 1.019. The prose values are unusable anyway: 0.7× and 1.3× across a 200vh section mean ±486px offsets at 1080p, which tears the grid apart. | Centred speed model y = (1 − s)·D·(p − ½), with s = 0.92 / 1.10 / 0.96 (±130 / ±162 / ±65px). **Measured:** 0.920 / 1.100 / 0.960, and the resting layout is exact at the centred frame. |
| F13 | S05 | The magnetic hover scales the same element that the parallax translates, so two systems write one `transform`. | Parallax moves the outer `.plate`; hover moves the inner `.plate__img`. |
| F14 | S05 | The 28 / 44 / 28 column split is called asymmetric, but it is symmetric (centre-weighted). | Keep the proportions and correct the name. The column rules at 28% and 72% become the S04 → S05 seam. |
| F15 | S05 → S06 | S06 cannot be `position: sticky` "behind" S05 without an overlapping container. Animating S05 to `y: -100%` on top of the page's own scroll moves it twice as fast. | A `.finale` wrapper is pulled up by −100svh underneath S05 (z-index), and the page's natural scroll is the curtain. **Measured:** the sticky holds from the start of the curtain to the end of the page. |
| F16 | Stack | `@studio-freight/lenis` is deprecated (frozen at 1.0.42 and renamed). | `lenis` 1.3.26 (`import Lenis from 'lenis'` plus `lenis/dist/lenis.css`). |
| F17 | Stack | Two layers of smoothing: Lenis `lerp` and `scrub: 1` each lag behind the other, so layers swim. | `scrub: true` everywhere. Lenis, on wheel input only, is the one source of smoothing. |
| F18 | Stack | `wheelMultiplier: 1.1` silently lengthens or shortens every scene. | Leave the default of 1 and tune `BUDGET` instead. |
| F19 | Stack | There is no refresh after web fonts load, and nothing guarantees that triggers are created in page order. | Scenes are created top to bottom, and `document.fonts.ready` triggers `ScrollTrigger.refresh()`. |
| F20 | Flow | S01–S04 are four pinned scenes in a row. Back-to-back pins make a page feel stuck. | A normal-flow interlude sits between S02 and S03, and each incoming scene emerges while it is still arriving (§3). |
| F21 | Colour | Vermilion `#D9381E` on Washi is 4.17:1. That fails AA for body text, and for Washi text on a vermilion button. | Use `shu` for display type (24px and up) and graphics only. A text-safe `#CC351C` (4.62:1) covers small text and buttons. |
| F22 | Type | Syne and Space Grotesk have no Japanese glyphs, so any Japanese in UI or body text falls back to a system font mid-line. There are also three families where two will do. | Two families, both with Japanese coverage (§2.2). |
| F23 | Fallbacks | `hardwareConcurrency` counts CPU cores; it says nothing about the GPU. A `<768px` width breakpoint misclassifies touch laptops, tablets and small desktop windows. "Lightweight CSS video overlays" are among the heaviest things a page can carry. | GPU tiers (detect-gpu) plus a frame-time guard. Input-based conditions via `(hover: hover) and (pointer: fine)`. T1 uses stills (§5.3). |
| F24 | Access | Reduced motion is specified only as "crossfades". There is no keyboard handling in the horizontal track, the audio toggle has no off default, the rain and neon have no flash limits, and looping video has no pause. | See §6. |
| F25 | S06 | "Begin Exploration" does not say what happens, and the route builder is unscoped. | "Plan this route" opens a route builder seeded with the six stops (§4.7). |
| F26 | Copy | The palette token is named "Vermilion Vermilion" (a typo). | Renamed `shu` 朱 (vermilion). |

## 1.4 Recommendations

These are creative, cultural and structural improvements beyond fixing errors. Part 2 adopts all of them unless a row is marked optional.

| # | Topic | v1 | Recommendation | Why |
|---|---|---|---|---|
| R1 | Miyajima setting | Torii "framed against a misty cedar forest" | The Ōtorii stands in the sea, on the tidal flats in front of Itsukushima Shrine, with Mt. Misen behind it. Use water, sea mist and the gate's reflection; the shore is lined with pines, not cedars. | Accuracy. The cedar-avenue look belongs to mountain shrines such as Togakushi. The reflection also rhymes with Fuji's reflection in S06. |
| R2 | Dawn sky | "Rising sun gradient" | A soft dawn gradient and a sun disc, with no radiating rays. | Rising-sun ray motifs (旭日) carry wartime associations and offend many viewers in Korea and China. |
| R3 | Approach (optional) | Camera dead centre | Aim slightly off-axis (EYE.x 0.46), a nod to seichū (正中): the centre of a shrine path is said to be reserved for the kami, so visitors walk to one side. | A detail Japanese viewers notice, and it costs one number. |
| R4 | Route | Kyoto, Nara, Osaka and Nagano "by Shinkansen" | Kyoto (Arashiyama) → Nara → Osaka by local rail. Then the Shinkansen from Osaka to Tokyo *is* the portal, with a 285 km/h readout. Cut Nagano. | Nara and Nagano are not on the Tōkaidō Shinkansen, the order zig-zagged, and Nagano's mountains duplicate the Fuji finale. The line's 285 km/h top speed gives the portal a real number. |
| R5 | The title | Komorebi appears only in the name | Give it a literal moment: the Arashiyama bamboo card, where dappled light drifts across the frame (a gobo shader, or a light-pattern still in T1). | The piece is named after it. |
| R6 | Ryōan-ji | "Interactive 3D boulder" | A slow walk along the veranda (a scroll-driven orbit) with a "14 / 15" counter. The garden is traditionally said to be arranged so that the fifteen stones can never all be seen from one point on the veranda. | This uses scroll for what the garden is about, instead of a generic 3D object. |
| R7 | Haiku | Unspecified | Bashō's 閑さや岩にしみ入る蝉の声 (from *Oku no Hosomichi*, written at Yamadera in 1689), which is public domain in Japanese. Use your own English gloss or license a translation (§9). Cicadas become the audio bed. | The right mood and era, with rights that can be cleared. |
| R8 | Ripple shader | Driven by scroll velocity | Keep it, with a meaning: fast scrolling roughens the raked gravel, and stopping lets it settle. Restlessness settles when you stop. | Gives the velocity effect a reason to exist. |
| R9 | S02 exit | "Rolls over it like a clean horizontal curtain" | A shoji slides closed from the right. | A curtain native to the setting. It lands on flat washi, which is the seam into the interlude. |
| R10 | Osaka | "Neon canal" | Dōtonbori at dusk, with *original* signage and characters. | The famous signs there (the Glico runner, the giant crab) are trademarks. |
| R11 | Nara (optional) | Deer | Easter egg: a deer bows back if the visitor bows (a hover dwell or a key press). Nara's deer are known for bowing. | Delight at almost no cost. |
| R12 | S04 → S05 | Hard cut | The rain slows and freezes into the craft grid's hairlines. | Turns a cut into a match cut. |
| R13 | S05 | Neutral grid | A dark studio where each craft is lit by its own light. Kintsugi gets gold (urushi lacquer and gold dust). The katana gets forge glow, since smiths quench blades in near-darkness to read the steel's colour. Washi gets backlit paper. | Chiaroscuro makes the crafts the light source, which bridges neon night and first light. |
| R14 | S05 → S06 | S05 animated upward | S05's bottom edge is a washi deckle, the untrimmed edge of handmade paper (耳, *mimi*). The page lifts it like a sheet. | A material curtain taken from the scene itself. |
| R15 | S06 time of day | Twilight | First light: dawn the next day closes a one-day arc. Akafuji (赤富士), the red Fuji of late-summer and early-autumn sunrises, brings back the vermilion of the opening gate. | Bookends the piece: a vermilion gate at dawn, then a red Fuji at dawn. |
| R16 | S06 sun | "Pulsating solar halo" behind the mountain | From Kawaguchiko's north shore the sun rises to the left (east) of the mountain, so put the halo frame-left, with a slow 8–10 s breathing rather than a pulse. The lake reuses S02's ripple shader and shows Sakasa-Fuji (逆さ富士, the inverted reflection) when the scroll is still. | Accuracy, less nausea, and shader reuse. |
| R17 | Light | Implicit | Make light the throughline: dawn → stillness → komorebi → dusk → neon → forge → first light (§1). | One idea binds all six scenes. |
| R18 | Palette | One tinted black; stock cyan + magenta | Use sumi's five tones (墨に五彩) instead of one black. Optional: "pigment by day, emission by night", deriving the night neons from the day pigments (a vermilion neon echoing the torii). | Grounds the palette in materials. Cyan and magenta on near-black is the stock cyberpunk look. |
| R19 | Structure | Six scenes back to back | One normal-flow interlude ("Field Notes") between S02 and S03, with the route map, practical notes and readable text. | Breathing room, content search engines can index, and the break that the chain of pins needs. |

---

# Part 2 — v2 Plan

## 1. Concept: one day of light

v2 covers one day, from dawn at Miyajima to first light at Fuji the next morning.

Every scene has its own light source, so the piece is also a study of Japanese light. Every transition passes through a flat, full-bleed frame (a seam, §3.2), which makes the handoffs between sections invisible.

| Scene | Place | Time | Light | Seam out |
|---|---|---|---|---|
| 01 鳥居 Threshold | Itsukushima, Miyajima | Dawn | Low sun through sea mist | Fog |
| 02 静寂 Echoes of Stillness | Ryōan-ji, Kyoto | Morning | Even, overcast | Shoji (washi) |
| Interlude 記 Field Notes | — | — | Paper | Washi |
| 03 旅 Traverse | Arashiyama → Nara → Dōtonbori | Midday → dusk | Komorebi → afternoon sun → first neon | Magenta-black bloom |
| 04 東京 Hyper-Density | Shinjuku | Night | Emission: signs, screens, rain | Sumi + hairlines |
| 05 匠 Takumi | Three workshops | Late night | Each craft's own light | Washi deckle |
| 06 富士 First Light | Lake Kawaguchi | Next dawn | Akafuji, sun frame-left | — |

## 2. Design system

### 2.1 Colour

There are two families of tokens: day pigments on washi, and night emission on `yoru`.

The ratios below are WCAG 2.x contrast, computed. "Display" means 24px regular or 18.66px bold and up, or a non-text use (graphics, UI components need 3:1).

| Token | Hex | Role | Checked pair | Ratio | Use |
|---|---|---|---|---|---|
| `washi` 和紙 | `#F5F3ED` | Day paper surface | — | — | Backgrounds, shoji, interlude |
| `sumi-1` 焦 | `#141312` | Darkest ink, day text | on washi | 16.72:1 | Body text |
| `sumi-2` 濃 | `#2B2926` | Dark ink | on washi | 13.07:1 | Headings |
| `sumi-3` 重 | `#4A463F` | Muted text | on washi | 8.45:1 | Captions, meta |
| `sumi-4` 淡 | `#8C877E` | Non-text ink | on washi | 3.22:1 | Rules, icons, disabled (UI only) |
| `sumi-5` 清 | `#CFCAC0` | Pale ink | — | — | Fog shadows, faint rules |
| `shu` 朱 | `#D9381E` | Vermilion, display | on washi | 4.17:1 | Torii, display type, graphics |
| `shu-ink` | `#CC351C` | Vermilion, text-safe | on washi, and washi on it | 4.62:1 | Links, small text, CTA fill |
| `matcha` | `#3E4E42` | Secondary | on washi | 7.97:1 | Secondary text, UI |
| `ishi` 石 | `#B8B1A3` | Stone | — | — | Kyoto and Nara surfaces (non-text) |
| `ai` 藍 | `#1E3354` | Indigo | on washi | 11.42:1 | Dusk sky, links on paper |
| `kon` 紺 | `#0F1A2B` | Deep navy | neon-white on it | 15.85:1 | Night sky before the neon |
| `shinonome` 東雲 | `#F19072` | Dawn | on yoru | 8.51:1 | S01 and S06 skies, accents |
| `kin` 金 | `#C8A15A` | Gold | on sumi-1 | 7.69:1 | Kintsugi, S05 highlights |
| `yoru` 夜 | `#08090C` | Night surface | — | — | S04 background |
| `neon-white` | `#F2F4F8` | Night text | on yoru | 18.08:1 | Body text at night |
| `neon-grey` | `#8D95A3` | Night muted text | on yoru | 6.60:1 | Meta, captions at night |
| `cyan` | `#00F0FF` | Neon | on yoru | 14.13:1 | Signage, accents |
| `magenta` | `#FF0055` | Neon | on yoru | 5.10:1 | Signage, accents |
| `bloom` | `#1A0710` | Seam S03 → S04 | neon-white on it | 17.63:1 | Flat seam frame |
| `fog` | `#E6E9EA` | Seam S01 → S02 | sumi-1 on it | 15.21:1 | Flat seam frame |

**Sumi.** The five sumi tones come from the ink-painting saying that sumi has five colours (墨に五彩). They are warm, like oil-soot (*yuen*) ink; pine-soot (*shōen*) ink leans cool. So the day blacks are warm and the night surface `yoru` is cool, and the two halves of the piece never share a black.

**Neon.** v2 keeps v1's cyan and magenta as signage colours. As an optional art-direction test, try deriving the night neons from the day pigments: a vermilion neon that echoes the torii, and an indigo-blue in place of the cyan.

**Texture.** Paper surfaces get a washi fibre texture: one tiling 512px AVIF at 5–8% multiply. Never put it under running text.

### 2.2 Typography

| Role | Face | Coverage | Notes |
|---|---|---|---|
| Display: titles, scene kanji, haiku | Shippori Mincho | Japanese + Latin | Kept from v1. Subset the hero kanji with the Google Fonts `text=` parameter so the first paint doesn't wait for a large font file |
| UI, body, data | Zen Kaku Gothic New | Japanese + Latin | Replaces Syne and Space Grotesk. Use tabular figures for the GPS readout (check `tnum` support, or set the digits in fixed-width boxes) |
| Signage artwork (S04 only, optional) | Dela Gothic One | Japanese + Latin | Baked into the sign artwork, not live text |
| Rail LED readout (optional) | DotGothic16 | Japanese + Latin | S03 speed and GPS display only |

Rules for setting the type:

- Mark Japanese with `lang="ja"`, so browsers pick the right glyph shapes and screen readers the right voice.
- Set vertical text with `writing-mode: vertical-rl`, and digits inside it with `text-combine-upright: all` (tate-chū-yoko).
- Use `word-break: auto-phrase` for Japanese line breaks where supported (Chromium; elsewhere it degrades gracefully).
- Load fonts with `font-display: swap`, then refresh ScrollTrigger after `document.fonts.ready`.

Scene titles pair kanji with English, as in "鳥居 Threshold". Avoid letter-spaced all-caps eyebrows and decorative monospace labels; they date a piece instantly.

### 2.3 Modes and the HUD

The HUD holds the scene navigation, a progress indicator, and the motion and sound toggles. It has two modes:

- **paper:** `sumi-1` on `washi`;
- **night:** `neon-white` on `yoru`.

It flips once. On the pinned rail that happens at 80% of the S03 ride, as Osaka's neon arrives. On touch devices and under reduced motion it happens when S04 reaches mid-screen.

The breakpoint is a scroll position that is computed on refresh and compared on every update. That makes it direction-proof: scrolling back up flips it back, and jumps land in the right mode.

The HUD sits on a small translucent pill, so its contrast never depends on the photograph behind it.

### 2.4 Motion tokens

| Token | Value | Use |
|---|---|---|
| `ease-expressive` | `cubic-bezier(0.16, 1, 0.3, 1)` | UI entrances and reveals |
| `dur-micro` | 150 ms | Hover, focus, toggles |
| `dur-reveal` | 600–800 ms | UI reveals |
| Scrubbed motion | `ease: 'none'` | Anything that tracks the scroll 1:1; eases belong only on segments inside a pinned timeline |

Motion is built from entrances, not loops. Anything that loops for more than 5 seconds is paused by the motion toggle (§6).

## 3. Scroll architecture

### 3.1 Budget

The single source of truth is `BUDGET` in the code (§5.5); this table is derived from it.

| Scene | Section | Pinned | Total | At 1920×1080 | Beats |
|---|---|---|---|---|---|
| 01 Threshold | 100vh | 120vh | 220vh | 2,376px | dolly · title out · fog |
| 02 Stillness | 100vh | 200vh | 300vh | 3,240px | fog lifts · veranda walk and haiku · shoji |
| Interlude | 150vh | — | 150vh | 1,620px | normal reading |
| 03 Traverse | 100vh | 300 + 120vh | 520vh | 5,616px | three card moves (100vh each) · portal |
| 04 Tokyo | 100vh | 200vh | 300vh | 3,240px | columns · rain freeze · signs down · seam |
| 05 Takumi | 200vh | — | 200vh | 2,160px | natural scroll |
| 06 First Light | 250vh − 100vh overlap | CSS sticky | 150vh | 1,620px | curtain · settle |
| **Total** | | **940vh (51%)** | **1,840vh** | **19,872px** | |

The test harness measured the same numbers: pins at 0–1,296, 2,376–4,536, 7,236–11,772 and 12,852–15,012px at 1080p, and a 19,872px document (18.4 screens). Under reduced motion the same page is 8.9 screens long, with no pins.

That is long for a web page, though typical for scroll-told pieces. Tune it by playtesting, not by guessing. If it drags, cut S02 and S04 to 1.6 first (−80vh), then S03's per-card budget to 0.9.

### 3.2 Seams

The handoff between two pinned scenes is where scroll pieces usually show their joins. One section scrolls away while the next slides in, and for a moment both are half on screen with a hard edge between them.

v2 hides every handoff behind a flat, full-bleed frame. The outgoing scene ends on the frame. The incoming scene starts on the same frame and emerges from it while it is still arriving, so there is no dead scroll.

Where the incoming scene emerges during its entry, the frame is a **seam sheet**:

- It is one viewport plus 35svh tall, flat at the top and feathered at the bottom.
- It is translated, never faded, so its flat part always covers the moving section edge. The new scene clears from the foreground up.

The harness checks that the edge stays covered at five points of the entry (90, 70, 50, 30 and 15% of a viewport from the top). It also checks that the sheet is gone 0.2 viewport heights into the pin.

| Handoff | Frame | Mechanism |
|---|---|---|
| S01 → S02 | Sea fog (`fog`) | S01's pin ends on a full fog layer. S02's fog sheet lifts while S02 enters |
| S02 → Interlude | Washi | The shoji closes into flat paper, and the interlude is washi |
| Interlude → S03 | Washi | S03's first card is a washi title card |
| S03 → S04 | Magenta-black (`bloom`) | The sign zoom ends in flat bloom. S04's bloom sheet lifts while S04 enters |
| S04 → S05 | Sumi with hairlines at 28% and 72% | S04 ends on flat sumi with the column rules, and S05's grid starts with the same rules |
| S05 → S06 | Washi deckle curtain | S05 lies above the sticky S06, and its torn bottom edge lifts away with the page |

### 3.3 The camera model (S01)

The dolly is a camera moving forward, not a picture getting bigger. Put each layer at a distance d from the camera, with the gate at d = 1. When the camera advances by Δ, each layer's scale is:

```text
scale(d) = d / (d − Δ)
```

All layers scale about one shared vanishing point, the "eye" inside the gate's opening, so they stay aligned. The camera travels just far enough for the gate to clear the frame:

```text
cover = max( ox / (ox − l),  (W − ox) / (r − ox),  oy / (oy − t) )   // opening edges l, r, t; eye (ox, oy); frame width W
Δmax  = 1 − 1 / (cover × 1.08)                                        // 8% margin so the pillars are gone, not grazing
```

The bottom edge is ignored: a torii has no sill, so the water may stay in view.

At 16:9 this gives the sky (d = 8) a scale of 1.11× and Mt. Misen (d = 6) 1.16×; the v1 code's 1.15 for the mountain was close. The near mist (d = 0.55) would reach infinity before the gate clears, so it fades out between 1.6× and 3×.

The table below is computed. The browser measurements in §5.5 match it: 5.08, 6.77, 3.81 and 2.22.

| Screen | Cover needed | Target (×1.08) | v1's fixed 5.5 | 5.5 ÷ target |
|---|---|---|---|---|
| Phone portrait (390×844) | 2.22 | 2.40 | clears | 2.29× (wasted scroll) |
| Tablet portrait (3:4) | 2.22 | 2.40 | clears | 2.29× |
| 4:3 | 3.81 | 4.11 | clears | 1.34× |
| 16:10 | 4.57 | 4.94 | clears | 1.11× |
| 16:9 | 5.08 | 5.49 | clears | 1.00× |
| 21:9 (2560×1080) | 6.77 | 7.31 | pillars stay in frame | 0.75× |
| 32:9 | 10.16 | 10.97 | pillars stay in frame | 0.50× |

The geometry here is illustrative: an opening 35vh wide, the underside of the tie-beam at 36vh, the ground at 85vh, and the eye at 50% across and 60% down the opening. The code measures the real artwork.

### 3.4 Trigger rules

| Rule | Why |
|---|---|
| Create triggers in page order | Each pin shifts the start of everything after it |
| One source of smoothing: Lenis on the wheel, `scrub: true` everywhere | Two smoothers lag each other and layers swim |
| Use function-based values plus `invalidateOnRefresh` for anything measured | Resizes and late font loads re-measure correctly (tested with a resize from 1920×1080 to 1280×800) |
| Use `fromTo` for anything that may be invalidated mid-scroll | A plain `to` re-reads its start value from wherever the element currently is |
| Inside a pinned range, derive start positions numerically from the pin (`pin.start + rideLen()`) | **Measured:** `'top+=N top'` on the pinned element had the pin's own spacing added, so the portal started at 15,012px instead of 10,476px, which is inside S04 |
| Don't give `gsap.quickSetter` the `scale` alias; set `scaleX` and `scaleY` | **Measured:** the alias throws "'scaleX,scaleY' is not a valid attribute name" |
| Viewport height = `documentElement.clientHeight`, plus `ignoreMobileResize: true` | It equals `svh` on mobile, so pins don't jump when the URL bar moves |
| Pin with GSAP *or* with CSS sticky, never both on one element | S01–S04 use GSAP pins; S06 uses CSS sticky |

## 4. Scenes

Each scene lists its resting ("static") state: that is what reduced-motion and no-JavaScript visitors see, and it's the CSS default the motion is layered over.

### 4.1 S01 鳥居 Threshold — Itsukushima, dawn

The piece opens on the Ōtorii standing in the water at Itsukushima, sea mist low on the tidal flats, Mt. Misen behind, the sky in `shinonome`. The title sits to one side. Scrolling moves the camera through the gate: every layer grows at its own rate, the title fades early, and as the pillars leave the frame the mist thickens into a flat fog frame.

| Parameter | Value |
|---|---|
| Layers (distance d) | sky 8 · Mt. Misen 6 · gate 1 · near mist 0.55 (fades between 1.6× and 3×) |
| Pin | 120vh, `scrub: true` |
| Timeline (pin progress) | 0.05–0.85 dolly (`power1.inOut` on Δ; the scale accelerates on its own) · 0.05–0.25 title out · 0.60–0.90 fog in · 0.90–1 hold |
| Eye | 50% across, 60% down the opening (x 0.46 for the seichū variant, R3) |
| Gate artwork | SVG: flat vermilion and sumi stay sharp at 7× on ultrawide screens; a raster would need to be enormous |
| WebGL (T2+) | Water plane with the gate's reflection; the mist as soft particles |
| Static state | Gate at rest, title visible, no fog |

### 4.2 S02 静寂 Echoes of Stillness — Ryōan-ji

The fog lifts from the foreground up and the rock garden is there. Scrolling walks along the veranda: the photograph pans in T1, or the camera orbits a depth or photogrammetry model in T2 and up. A small counter tracks the stones in view and never reaches 15 / 15. Bashō's haiku sets in vertically, line by line, with an English gloss beneath. In T2 and up the raked gravel carries the velocity ripple. Then a shoji slides closed from the right.

| Parameter | Value |
|---|---|
| Entry | Fog seam sheet, from `top bottom` to 0.2vh into the pin |
| Pin | 200vh |
| Timeline (pin progress) | 0–0.70 veranda walk (DOM: pan −6%; WebGL: `stage.garden.setOrbit(p)`) · 0.12–0.44 haiku lines (fade + 24px rise, staggered) · 0.72–0.92 shoji closes · 0.92–1 hold |
| Layout | Garden full-bleed; haiku in `writing-mode: vertical-rl`, right third |
| Haiku | 閑さや / 岩にしみ入る / 蝉の声 — Matsuo Bashō, 1689. Working gloss: "Stillness— / seeping into the rocks, / the cicadas' cry" (to be reviewed, §9) |
| Audio | Cicadas: off by default, one global toggle |
| Static state | Garden photograph, haiku visible, shoji hidden |

### 4.3 Interlude 記 Field Notes

A normal-flow page on washi, about 150vh: the route map with the six stops, a short passage on komorebi (sunlight filtering through leaves), and practical notes. It gives readers text they can read at their own pace, gives search engines indexable content, gives keyboard users an easy stretch, and breaks the chain of pins.

### 4.4 S03 旅 Traverse — Arashiyama → Nara → Dōtonbori

A pinned rail of four full-bleed cards. A washi title card comes first. Then Arashiyama's bamboo grove at midday, the piece's literal komorebi, with dappled light drifting across the frame. Then Nara in the afternoon. Then Dōtonbori at dusk as the first neon comes on.

Each card's photograph moves like a view through a window. The GPS digits decode per card rather than counting between cities.

When the ride ends on Osaka, the portal begins. The frame tightens to 0.96, then plunges into an original neon sign while the speed readout climbs to 285 km/h, the Tōkaidō Shinkansen's top speed on the Osaka–Tokyo leg the portal stands for. The frame floods to bloom.

| Parameter | Value |
|---|---|
| Cards | Title (washi) · Kyoto, Arashiyama 35.02N 135.67E · Nara 34.69N 135.84E · Osaka, Dōtonbori 34.67N 135.50E |
| Ride | 3 transitions × 100vh = 300vh; track `x = −(scrollWidth − clientWidth)`; cards are `100cqw` so the scrollbar never offsets the last card |
| Inner media | 130% of the card's width, moving ±0.15 × card width via `containerAnimation` (the photo lags its card, so it reads as farther away) |
| Portal (120vh) | 0.05–0.20 tighten 1 → 0.96 · 0.20–0.80 zoom to the sign's cover × 1.05 (`expo.in`) · 0.15–0.85 speed 0 → 285 · 0.55–0.85 bloom in · 0.90–1 hold |
| Sign | About 14% × 22% of the card at (58%, 30%), which gives a cover of ≈ 9.3× at 16:9. Build it as SVG or CSS type so it stays sharp; the bloom hides the photograph's magnification |
| HUD | Flips to night at 80% of the ride |
| Keyboard | Focus inside any card scrolls the page to that card's position on the rail (tested) |
| Touch and small windows | Native scroll-snap row (86vw cards, so the next one peeks in); no portal; S04's bloom sheet provides the seam |
| Static state | The same native row |

### 4.5 S04 東京 Hyper-Density — Shinjuku, night

Tokyo arrives out of the bloom. Two display columns slide in opposite directions around a billboard of original footage: 東京, set vertically, on the left, and TOKYO on the right. Rain streaks carry the scroll-velocity effects, with a chromatic split in T3.

In the last third the scene resolves:

- the rain slows and freezes into two hairlines at 28% and 72% of the width;
- the signs power down, as a dim rather than a flicker;
- the frame settles to sumi, and the hairlines become the column rules of S05's grid.

| Parameter | Value |
|---|---|
| Entry | Bloom seam sheet lifts while S04 enters |
| Pin | 200vh |
| Timeline (pin progress) | 0–1 columns: 東京 +20vh → −20vh, TOKYO −20vh → +20vh · 0.62–0.87 `--freeze` 0 → 1 · 0.68–0.88 signs dim to 0.12 · 0.80–0.95 sumi + rules seam · 0.95–1 hold |
| Billboard | Original footage or generated plates, with no identifiable trademarks. Paused when off screen and by the motion toggle |
| Photosensitivity | No more than 3 flashes per second; no large saturated-red flashes; chromatic split capped, and off below T3 |
| Static state | Night still, signs lit, no rain loop |

### 4.6 S05 匠 Takumi — the workshops

Three crafts in a dark studio, each lit by its own light. The page scrolls normally here, with no pin. The columns move at slightly different speeds: kintsugi slower (so it reads as farther away), the katana faster (nearer), washi in between. Captions stay on the page plane.

On devices with a fine pointer, each image leans toward the cursor. The section's bottom edge is a washi deckle, which becomes the curtain over the finale.

| Column | Craft | Speed | Offset at 1080p | Light |
|---|---|---|---|---|
| 28% | Kintsugi 金継ぎ | 0.92 | ±130px | Gold: urushi lacquer and gold dust |
| 44% | Katana 刀 (tamahagane steel) | 1.10 | ±162px | Forge glow; the quench in darkness |
| 28% | Washi 和紙 (kōzo fibre; UNESCO Intangible Cultural Heritage, 2014) | 0.96 | ±65px | Backlit paper |

| Parameter | Value |
|---|---|
| Section | 200svh in normal flow, `z-index: 1` above the finale |
| Parallax | `.plate`: y = (1 − s)·D·(p − ½), with D = 100vh + section height and the trigger running `top bottom` → `bottom top` |
| Hover (fine pointers) | Inner `.plate__img` moves up to 12px toward the cursor and scales to 1.04, via `gsap.quickTo` (0.6 s, `power3.out`) |
| Assets | Cut-outs as AVIF or WebP with alpha, sized for column width × DPR (capped at 2) |
| Static state | The grid at rest; by construction the centred frame is the resting layout |

### 4.7 S06 富士 First Light — Lake Kawaguchi, dawn

As the washi lifts, Fuji is already there at first light; the page's own scroll is the curtain. Once the curtain has fully cleared, three things happen in sequence:

1. Fuji settles from 1.08 to 1 over 3.2 seconds.
2. The red of Akafuji warms up.
3. The closing UI resolves out of a light blur.

The sun sits frame-left. When the scroll is still, the lake holds the inverted reflection, using S02's ripple shader.

| Parameter | Value |
|---|---|
| Structure | `.finale` wrapper, 250svh tall, `margin-top: −100svh`, `z-index: 0`; S06 is `position: sticky; top: 0; height: 100svh` |
| Reveal | S05's last 100svh scrolls away over it (native scrolling, no JavaScript) |
| Settle | Starts when S05's bottom reaches the top: Fuji 1.08 → 1 (3.2 s, `power2.out`) · Akafuji 0 → 1 (2.4 s) · UI of five elements or fewer, blur 8px → 0, rise 12px, 0.12 s stagger |
| Hold | Half a viewport of scroll after the reveal, so the page ends on the finale |
| Halo | Frame-left (east); 8–10 s breathing, amplitude of 5% or less |
| CTA | "Plan this route" opens the route builder in a dialog, seeded with the six stops. Minimum scope: reorder or remove stops, see the rail legs and times, share a link. Lazy-loaded; no map tiles until opened |
| Footer | Credits: photographers, translator, type licences |
| Static state | Settled, Akafuji on, UI visible |

## 5. Technical architecture

### 5.1 Stack

Versions were verified on the npm registry in September 2026.

| Package | Version | Notes |
|---|---|---|
| `gsap` (ScrollTrigger, SplitText, CustomEase) | 3.15.0 | Standard "no charge" licence; every plugin ships in the public package |
| `lenis` | 1.3.26 | Replaces the deprecated `@studio-freight/lenis` (frozen at 1.0.42). Defaults: `lerp` 0.1, `smoothWheel` true, `syncTouch` false, `autoRaf` false |
| `three` | 0.186.1 | Loaded lazily, T2 and up only |
| `detect-gpu` | 5.0.70 | GPU tier detection. Self-host its benchmark data via `benchmarksURL` (the default fetches from unpkg) |
| `@gsap/react` | 2.1.2 | Only if the build is React (`useGSAP`) |

### 5.2 One clock, one canvas

GSAP's ticker is the only clock. It advances Lenis (`lenis.raf`), ScrollTrigger and the WebGL render in the same frame, so the DOM and the canvas never disagree.

There is one fixed, full-viewport `<canvas>` behind the DOM, not one per scene. A scene manager gives each WebGL scene the same lifecycle:

- `load`, `enter`, `update(progress)`, `leave` and `dispose`;
- it preloads the next scene (N+1) and disposes the one two back (N−2), so at most three scenes' textures are resident at once.

The DOM is always present and semantic; WebGL only replaces pictures. A DOM image is hidden once the canvas has drawn its replacement.

### 5.3 Quality tiers

| Tier | When | What renders |
|---|---|---|
| T0 Static | `prefers-reduced-motion: reduce` | The finished static page: no pins, no Lenis, no loops, and S03 as a native row |
| T1 DOM | Save-Data, GPU tier 1 or lower, WebGL unavailable, or after a downgrade | All the choreography with DOM layers and stills; no video overlays |
| T2 WebGL | GPU tier 2 | Canvas scenes (water, garden orbit, rain) without post-processing; DPR capped at 1.5 |
| T3 Full | GPU tier 3 | Adds post-processing (chromatic split, bloom, ripple normals); DPR capped at 2 |

A frame-time guard averages frame times over 2-second windows:

- If the average is above 20 ms, it steps down one tier, once. It never steps up during a session.
- Frames longer than 250 ms (a tab switch, say) are ignored.

WebGL loads in idle time after first paint (`requestIdleCallback`), never before the largest contentful paint.

### 5.4 DOM and CSS contract

The static page is the design; motion is layered on top. These rules are what make the no-JavaScript and reduced-motion page complete, and the motion page correct. All of them were exercised by the harness.

```html
<header class="hud" data-mode="paper"><!-- scene nav · progress · motion + sound toggles --></header>
<canvas id="gl" aria-hidden="true"></canvas>
<main class="page">
  <section class="s01">  <!-- .layer.sky .layer.misen .layer.torii > .opening  .layer.mist  h1.title  .seam.fog -->
  <section class="s02">  <!-- .garden > .garden__img  .haiku[lang=ja] > p.line ×3  .seam.fog  .seam.shoji -->
  <section class="interlude">  <!-- normal flow on washi -->
  <section class="s03">  <!-- .track > article.card ×4 (.card--osaka > .card__stage > .card__media + .card__sign)  .seam.bloom  p.speed -->
  <section class="s04">  <!-- .col--jp[lang=ja] .col--en .billboard .rain .signs  .seam.bloom  .seam.rules -->
  <section class="s05">  <!-- .grid > figure.craft[data-craft][data-speed] > .plate > .plate__img + figcaption -->
  <div class="finale"><section class="s06"><!-- .fuji .akafuji .ui --></section></div>
</main>
```

```css
main.page { overflow-x: clip; }           /* clip, not hidden: hidden breaks sticky and pins */
.seam { position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none; }
.s01, .s02, .s04 { height: 100vh; height: 100svh; overflow: clip; }

/* seam sheets: one viewport + 35svh, flat top, feathered bottom (translated by JS, never faded) */
.s02 .fog, .s04 .bloom { bottom: auto; height: calc(100% + 35svh);
  background: linear-gradient(var(--c) 0 calc(100% - 35svh), transparent 100%); }
.s02 .fog { --c: var(--fog); }  .s04 .bloom { --c: var(--bloom); }

/* S03: the default is a native swipe row; JS adds .is-rail for the pinned track */
.s03 { overflow: clip; container-type: inline-size; }
.s03 .track { display: flex; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; }
.s03 .card { flex: 0 0 min(86vw, 28rem); scroll-snap-align: center; position: relative; overflow: clip; }
.s03.is-rail { height: 100vh; height: 100svh; }
.s03.is-rail .track { overflow: visible; scroll-snap-type: none; gap: 0; width: max-content; height: 100%; }
.s03.is-rail .card { flex: 0 0 100cqw; height: 100%; }   /* cqw = section width, scrollbar excluded */
.card__stage { position: absolute; inset: 0; }             /* scaled by the portal */
.card__media { position: absolute; top: 0; bottom: 0; left: -15%; width: 130%; }  /* translated by parallax */

/* S05 lies over S06; S06 sticks underneath and is revealed by the page's own scroll */
.s05 { position: relative; z-index: 1; min-height: 200svh; }
.finale { position: relative; z-index: 0; height: 250svh; margin-top: -100svh; }
.s06 { position: sticky; top: 0; height: 100svh; overflow: clip; }
```

In the finished build, the final states are the CSS defaults: Fuji at scale 1, Akafuji visible, UI visible, haiku visible. The JavaScript sets the "from" states only when motion is allowed.

### 5.5 The choreography blueprint (tested)

The file below is the v2 choreography for the DOM layer. It ran as written in Chromium, driven by Playwright, against a harness page using the DOM and CSS above. The results follow the code.

The WebGL stage (`stage.js`) appears here only as an interface; the test used a stub.

```js
/* choreography.js — Komorebi & Neon v2 · scroll choreography (DOM layer)
   gsap 3.15 + ScrollTrigger · lenis 1.3 — exercised in Chromium via Playwright (see §5.5). */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const VH = () => document.documentElement.clientHeight;   // = svh on mobile; stable while the URL bar moves

// Scroll budgets in viewport heights: the single source of truth for §3.1.
export const BUDGET = { s01: 1.2, s02: 2.0, s03PerCard: 1.0, s03Portal: 1.2, s04: 2.0 };

// Shared state the WebGL stage reads every frame (the stage never writes it).
export const scroll = { y: 0, velocity: 0, progress: 0 };
let stage = null;                                          // set when the lazy WebGL chunk is ready

// Layout box of el inside ancestor, ignoring transforms (safe to call mid-animation).
function layoutRect(el, ancestor) {
  let l = 0, t = 0;
  for (let n = el; n && n !== ancestor; n = n.offsetParent) { l += n.offsetLeft; t += n.offsetTop; }
  return { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight };
}

// Smallest scale about (ox, oy) that pushes every edge of the rect out of a W×H frame.
// b = Infinity skips the bottom edge (a torii has no sill; the ground may stay in view).
function coverScale({ l, t, r, b }, ox, oy, W, H) {
  return Math.max(1, ox / (ox - l), (W - ox) / (r - ox), oy / (oy - t),
                  Number.isFinite(b) ? (H - oy) / (b - oy) : 0);
}

const pinned = (trigger, len, extra = {}) => ({ trigger, start: 'top top', end: () => '+=' + len(),
  pin: true, scrub: true, anticipatePin: 1, invalidateOnRefresh: true, ...extra });

// ── S01 鳥居 Threshold · a camera dolly through the gate ──────────────────────
function scene01() {
  const root = $('.s01'), opening = $('.s01 .opening');
  const planes = [                                         // d = distance from the camera; the gate is 1
    { el: $('.s01 .sky'), d: 8 }, { el: $('.s01 .misen'), d: 6 }, { el: $('.s01 .torii'), d: 1 },
    { el: $('.s01 .mist'), d: 0.55, fade: [1.6, 3] },      // nearer than the gate: dissolves, never engulfs
  ].map(p => {                                             // quickSetter can't take the 'scale' alias: set both axes
    const sx = gsap.quickSetter(p.el, 'scaleX'), sy = gsap.quickSetter(p.el, 'scaleY');
    return { ...p, scale: (v) => { sx(v); sy(v); }, alpha: gsap.quickSetter(p.el, 'opacity') };
  });
  const EYE = { x: 0.5, y: 0.6 };                          // aim point in the opening (x 0.46 = slightly off-axis)
  const cam = { delta: 0 };

  function aim() {                                         // vanishing point + travel that clears the gate
    const o = layoutRect(opening, root);
    const ox = o.l + EYE.x * (o.r - o.l), oy = o.t + EYE.y * (o.b - o.t);
    planes.forEach(p => gsap.set(p.el, { transformOrigin: `${ox}px ${oy}px` }));
    const cover = coverScale({ ...o, b: Infinity }, ox, oy, root.offsetWidth, root.offsetHeight);
    return 1 - 1 / (cover * 1.08);                         // Δ at which the gate reaches cover × 1.08
  }
  function render() {
    for (const p of planes) {
      const s = p.d / Math.max(p.d - cam.delta, 1e-3);     // perspective: nearer planes grow faster
      if (!p.fade) { p.scale(s); continue; }
      p.alpha(gsap.utils.clamp(0, 1, gsap.utils.mapRange(p.fade[0], p.fade[1], 1, 0, s)));
      p.scale(Math.min(s, p.fade[1]));
    }
  }
  gsap.timeline({ defaults: { ease: 'none' },
      scrollTrigger: pinned(root, () => BUDGET.s01 * VH(), { id: 's01', onRefresh: render }) })
    .fromTo(cam, { delta: 0 }, { delta: aim, duration: 0.8, ease: 'power1.inOut', onUpdate: render }, 0.05)
    .fromTo('.s01 .title', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2 }, 0.05)
    .fromTo('.s01 .fog', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.6)
    .to({}, { duration: 0.1 }, 0.9);                       // hold the flat fog frame: the seam into S02
  render();
}

// Seam sheet: a tall layer (flat top, 35svh feathered bottom) that is translated, never faded, so its
// flat part always covers the section's top edge while the new scene clears from the foreground up.
function seamSheet(root, sheet) {
  gsap.fromTo(sheet, { autoAlpha: 1, y: 0 }, { y: () => -sheet.offsetHeight, ease: 'none',
    scrollTrigger: { trigger: root, start: 'top bottom', end: () => 'top top-=' + 0.2 * VH(),
                     scrub: true, invalidateOnRefresh: true } });
}

// ── S02 静寂 Echoes of Stillness ──────────────────────────────────────────────
function scene02() {
  const root = $('.s02');
  seamSheet(root, $('.s02 .fog'));
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: pinned(root, () => BUDGET.s02 * VH(), { id: 's02' }) })
    .fromTo('.s02 .garden__img', { xPercent: 0 }, { xPercent: -6, duration: 0.7,        // a walk along the veranda
       onUpdate() { stage?.garden?.setOrbit(this.progress()); } }, 0)
    .from('.s02 .haiku .line', { autoAlpha: 0, y: 24, duration: 0.12, stagger: 0.08, ease: 'power2.out' }, 0.12)
    .fromTo('.s02 .shoji', { autoAlpha: 1, xPercent: 100 }, { xPercent: 0, duration: 0.2, ease: 'power2.inOut' }, 0.72)
    .to({}, { duration: 0.08 }, 0.92);                     // closed shoji = flat washi = seam into the interlude
}

// ── S03 旅 Traverse · pinned rail → sign portal (fine pointer + room only) ─────
function scene03({ lenis, signal }) {
  const root = $('.s03'), track = $('.s03 .track'), cards = $$('.s03 .card'), n = cards.length;
  const rideLen = () => (n - 1) * BUDGET.s03PerCard * VH();
  const portalLen = () => BUDGET.s03Portal * VH();
  root.classList.add('is-rail');                           // CSS default is the native swipe row

  const pin = ScrollTrigger.create({ trigger: root, start: 'top top', end: () => '+=' + (rideLen() + portalLen()),
                                     pin: true, anticipatePin: 1, invalidateOnRefresh: true, id: 's03' });
  const ride = gsap.to(track, { x: () => -(track.scrollWidth - root.clientWidth), ease: 'none',
    scrollTrigger: { trigger: root, start: 'top top', end: () => '+=' + rideLen(), scrub: true, invalidateOnRefresh: true } });

  cards.forEach(card => {                                  // window parallax: media is 130% wide, moves ±15%
    const media = $('.card__media', card);
    if (media) gsap.fromTo(media, { x: () => -0.15 * card.offsetWidth }, { x: () => 0.15 * card.offsetWidth, ease: 'none',
      scrollTrigger: { trigger: card, containerAnimation: ride, start: 'left right', end: 'right left',
                       scrub: true, invalidateOnRefresh: true } });
  });

  const stageEl = $('.card--osaka .card__stage'), sign = $('.card--osaka .card__sign');
  const kmh = { v: 0 }, readout = $('.s03 .speed__value');
  const geom = () => {                                     // zoom about the sign's centre until it fills the frame
    const s = layoutRect(sign, stageEl), ox = (s.l + s.r) / 2, oy = (s.t + s.b) / 2;
    return { origin: `${ox}px ${oy}px`, cover: 1.05 * coverScale(s, ox, oy, stageEl.offsetWidth, stageEl.offsetHeight) };
  };
  gsap.timeline({ defaults: { ease: 'none' },
      // numeric start: a 'top+=… top' string inside the pinned range gets the pin's own spacing added (measured)
      scrollTrigger: { trigger: root, start: () => pin.start + rideLen(), end: () => '+=' + portalLen(),
                       scrub: true, invalidateOnRefresh: true, id: 's03-portal' } })
    .fromTo(stageEl, { scale: 1, transformOrigin: () => geom().origin }, { scale: 0.96, duration: 0.15, ease: 'power1.out' }, 0.05)
    .fromTo(stageEl, { scale: 0.96 }, { scale: () => geom().cover, duration: 0.6, ease: 'expo.in', immediateRender: false }, 0.2)
    .fromTo(kmh, { v: 0 }, { v: 285, duration: 0.7, ease: 'power2.in',
       onUpdate: () => { readout.textContent = Math.round(kmh.v); } }, 0.15)
    .fromTo('.s03 .bloom', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.55)
    .to({}, { duration: 0.1 }, 0.9);                       // flat bloom = seam into S04

  track.addEventListener('focusin', (e) => {               // keyboard: bring the focused card into the frame
    const i = cards.indexOf(e.target.closest('.card'));
    if (i < 0) return;
    const y = pin.start + rideLen() * (i / (n - 1));
    lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
  }, { signal });
  return { flipAt: () => pin.start + 0.8 * rideLen(), cleanup: () => root.classList.remove('is-rail') };
}

// ── S04 東京 Hyper-Density ─────────────────────────────────────────────────────
function scene04() {
  const root = $('.s04');
  seamSheet(root, $('.s04 .bloom'));
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: pinned(root, () => BUDGET.s04 * VH(), { id: 's04' }) })
    .fromTo('.s04 .col--jp', { y: () => 0.2 * VH() }, { y: () => -0.2 * VH(), duration: 1 }, 0)
    .fromTo('.s04 .col--en', { y: () => -0.2 * VH() }, { y: () => 0.2 * VH(), duration: 1 }, 0)
    .fromTo('.s04 .rain', { '--freeze': 0 }, { '--freeze': 1, duration: 0.25 }, 0.62)     // streaks slow into hairlines
    .fromTo('.s04 .signs', { autoAlpha: 1 }, { autoAlpha: 0.12, duration: 0.2 }, 0.68)    // power down: a dim, never a flicker
    .fromTo('.s04 .rules', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, 0.8);    // seam: sumi + rules at 28 | 44 | 28
}

// ── S05 匠 Takumi · natural scroll, depth by speed ─────────────────────────────
function scene05({ fine, signal }) {
  const root = $('.s05');
  const D = () => VH() + root.offsetHeight;                // length of the 'top bottom' → 'bottom top' trip
  $$('.s05 .craft').forEach(craft => {
    const s = parseFloat(craft.dataset.speed), plate = $('.plate', craft);
    // speed model: y = (1 − s)·D·(p − ½)  → resting layout when the section is centred
    gsap.fromTo(plate, { y: () => -(1 - s) * D() / 2 }, { y: () => (1 - s) * D() / 2, ease: 'none',
      scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true,
                       invalidateOnRefresh: true, id: 's05-' + craft.dataset.craft } });
    if (fine) magnet(craft, $('.plate__img', craft), signal);
  });
}

// Magnetic hover moves the INNER image; the parallax owns the outer plate (one system per transform).
function magnet(zone, img, signal) {
  const to = (prop) => gsap.quickTo(img, prop, { duration: 0.6, ease: 'power3.out' });
  const x = to('x'), y = to('y'), s = to('scale');
  zone.addEventListener('pointermove', (e) => {
    const r = zone.getBoundingClientRect();
    x(((e.clientX - r.left) / r.width - 0.5) * 24);       // ±12 px
    y(((e.clientY - r.top) / r.height - 0.5) * 24);
    s(1.04);
  }, { signal });
  zone.addEventListener('pointerleave', () => { x(0); y(0); s(1); }, { signal });
}

// ── S06 富士 First Light · CSS sticky reveal + a timed settle ────────────────────
function scene06() {
  const settle = gsap.timeline({ paused: true })
    .fromTo('.s06 .fuji', { scale: 1.08 }, { scale: 1, duration: 3.2, ease: 'power2.out' })
    .fromTo('.s06 .akafuji', { autoAlpha: 0 }, { autoAlpha: 1, duration: 2.4, ease: 'sine.inOut' }, 0.4)
    .from('.s06 .ui > *', { autoAlpha: 0, y: 12, filter: 'blur(8px)', duration: 0.8, stagger: 0.12,
                            ease: 'expo.out', clearProps: 'filter' }, 1.2);
  ScrollTrigger.create({ trigger: '.s05', start: 'bottom top', id: 's06',   // the washi curtain has fully lifted
    onEnter: () => settle.play(), onLeaveBack: () => settle.reverse() });
}

// ── HUD · two modes, one direction-proof breakpoint; also feeds the shaders ─────
function hud(flipAt) {
  const el = $('.hud');
  const update = (self) => {
    scroll.y = self.scroll(); scroll.velocity = self.getVelocity(); scroll.progress = self.progress;
    const mode = scroll.y >= flipAt() ? 'night' : 'paper';
    if (el.dataset.mode !== mode) el.dataset.mode = mode;
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
}

function startLenis() {
  const lenis = new Lenis({ lerp: 0.1, anchors: true });  // wheel only (syncTouch stays false)
  const tick = (t) => lenis.raf(t * 1000);                 // one clock: GSAP's ticker drives Lenis
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return { lenis, stop: () => { gsap.ticker.remove(tick); lenis.destroy(); gsap.ticker.lagSmoothing(500, 33); } };
}

// ── Quality tiers + the lazy WebGL stage ─────────────────────────────────────────
export async function pickTier() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;   // T0 static
  if (navigator.connection?.saveData) return 1;                           // T1 DOM only
  try {
    const { getGPUTier } = await import('detect-gpu');
    const { tier } = await getGPUTier({ benchmarksURL: '/gpu-benchmarks' }); // self-hosted data
    return tier >= 3 ? 3 : tier === 2 ? 2 : 1;
  } catch { return 1; }
}

function loadStage(tier) {
  if (tier < 2) return;
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
  idle(async () => {
    const { createStage } = await import('./stage.js');    // three.js lives only in this chunk
    stage = await createStage({ canvas: $('#gl'), tier, scroll });
    gsap.ticker.add(stage.render);                         // same tick as Lenis and ScrollTrigger
    watchFrames(() => stage.setTier(stage.tier - 1));      // step down once; never step up mid-session
  });
}

function watchFrames(degrade, budgetMs = 20, windowMs = 2000) {
  let sum = 0, frames = 0;
  const tick = (time, dt) => {
    if (dt > 250) return;                                  // tab switch or debugger, not a slow frame
    sum += dt; frames++;
    if (sum < windowMs) return;
    if (sum / frames > budgetMs) { gsap.ticker.remove(tick); degrade(); }
    sum = frames = 0;
  };
  gsap.ticker.add(tick);
}

export function init() {
  const mm = gsap.matchMedia();
  mm.add({ motion: '(prefers-reduced-motion: no-preference)',
           fine: '(hover: hover) and (pointer: fine)',
           roomy: '(min-width: 48em) and (min-height: 30em)' }, (ctx) => {
    const { motion, fine, roomy } = ctx.conditions;
    const ac = new AbortController(), undo = [() => ac.abort()];
    let lenis = null, rail = null;
    if (motion && fine) { const L = startLenis(); lenis = L.lenis; undo.push(L.stop); }
    if (motion) {                                          // create in page order: each pin shifts what follows
      scene01(); scene02();
      if (fine && roomy) { rail = scene03({ lenis, signal: ac.signal }); undo.push(rail.cleanup); }
      scene04(); scene05({ fine, signal: ac.signal }); scene06();
    }
    const s04Top = () => ScrollTrigger.getById('s04')?.start ?? ($('.s04').getBoundingClientRect().top + scrollY);
    hud(rail ? rail.flipAt : () => s04Top() - VH() / 2);
    return () => undo.forEach(fn => fn());
  });
  document.fonts?.ready.then(() => ScrollTrigger.refresh()); // late font metrics move every trigger
  pickTier().then(loadStage);
  return mm;
}
```

**Test results** (Playwright + Chromium, 34 of 34 checks passing):

| Check | Result |
|---|---|
| Desktop 1920×1080: fine pointer detected, Lenis on, pinned rail on | pass |
| S01 gate clears the frame at the end of the pin: 16:9, 21:9, 4:3, 3:4, phone | pass at all five (cover 5.08 / 6.77 / 3.81 / 2.22 / 2.22) |
| v1's fixed 5.5 at 2560×1080 | fails: the pillars stay in frame |
| Seam sheets cover the section edge during entry (S01 → S02, S03 → S04) | pass at 90 / 70 / 50 / 30 / 15% of the entry; gone 0.2vh into the pin |
| S02 shoji fully closed at the end of the pin | pass (left edge at 0.00px) |
| S03 inner media covers its card across the whole ride | pass (worst gap 0.00px) |
| S03 last card flush when the ride ends, including after a resize to 1280×800 | pass (0.00px) |
| S03 portal starts exactly where the ride ends | pass after the fix in §3.4 (it was 15,012px instead of 10,476px) |
| S03 at the end of the pin: sign fills the frame, bloom flat, readout at 285 | pass |
| HUD flips paper → night at 80% of the ride, and back when scrolling up | pass |
| Keyboard focus moved into an off-screen card | pass (card lands at 0.0px) |
| S04 flat sumi + rules frame at the end of the pin | pass |
| S05 apparent speeds (v2) | 0.920 / 1.100 / 0.960; resting layout exact at the centred frame |
| S05 apparent speeds, v1 code on the same DOM | 1.037 / 0.944 / 1.019, confirming the inversion |
| S06 sticky from the start of the curtain to the end of the page; settle lands at 1.000 | pass |
| No sideways page overflow (desktop, phone, reduced motion) | pass |
| Phone 390×844 with touch: no Lenis, native swipe row, HUD flip at S04 | pass |
| Reduced motion: only the HUD trigger, no pins, seams hidden, final states visible | pass (page is 8.9 screens long) |
| JavaScript errors | none |

Two bugs were found by testing and fixed, both listed in §3.4:

- `gsap.quickSetter(el, 'scale')` throws;
- a string offset inside a pinned range moved the portal into S04.

The harness does not cover:

- real imagery and fonts;
- the WebGL stage;
- WebKit (Safari) and Firefox — run the same suite on both before launch;
- performance on real devices, especially a mid-range Android phone.

## 6. Accessibility and motion safety

| Requirement | Implementation |
|---|---|
| Reduced motion (WCAG 2.3.3) | `prefers-reduced-motion: reduce` means T0: no pins, no Lenis, no parallax, no loops, and the static page is complete (tested) |
| An in-page motion toggle | The HUD toggle takes the same path as reduced motion (it reverts the `gsap.matchMedia` context) and pauses loops. The choice is remembered |
| Pause, stop, hide (WCAG 2.2.2) | Rain, video and the halo's breathing are paused by the motion toggle; video also pauses when off screen |
| Flashes (WCAG 2.3.1) | No more than 3 flashes per second anywhere. The sign power-down is a fade. There is no full-screen saturated-red flash: the bloom is dark (`#1A0710`), not `#FF0055` |
| Vestibular safety | Only two zooms toward the viewer (S01, and the S03 portal), both eased, both pinned, both skipped in T0. No scroll-driven rotation |
| Keyboard (WCAG 2.1.1, 2.4.7) | Focus inside the horizontal track scrolls to its card (tested). Focus rings are visible in both HUD modes. A skip link jumps to the interlude and to the footer |
| Navigation | Scene links resolve to trigger positions (`ScrollTrigger.getById(id).start`), not to `offsetTop`, because pins move everything below them. Lenis `anchors: true` handles plain anchors |
| Screen readers | Semantic sections with headings, and decorative layers marked `aria-hidden`. The km/h readout is `aria-hidden` because a live number would chatter, with static text beside it. Every photograph has alt text |
| Language | `lang="ja"` on all Japanese. The haiku's English gloss is in the DOM |
| Contrast | The tokens in §2.1. Vermilion text only ever uses `shu-ink`. The HUD sits on a pill |
| Audio | Off by default, one global toggle, never autoplays with sound |

## 7. Mobile and input strategy

Input decides behaviour, not width. Devices matching `(hover: hover) and (pointer: fine)` get Lenis, the pinned rail and hover effects; everything else gets native scrolling. Enough room (`min-width: 48em` and `min-height: 30em`) is a second condition for the rail.

| | Fine pointer with room | Touch / coarse pointer | Reduced motion |
|---|---|---|---|
| Smooth scrolling | Lenis (wheel only) | Native | Native |
| S01 | Pinned dolly | Pinned dolly (cover ≈ 2.4 on portrait, fewer layers) | Static |
| S02 | Pinned, orbit or pan | Pinned, pan (T1) | Static |
| S03 | Pinned rail + portal | Native snap row, no portal | Native snap row |
| S04 | Pinned | Pinned, lighter rain | Static |
| S05 | Parallax + hover | Parallax (halve the amplitude if it jitters) | Static |
| S06 | Sticky reveal + settle | Sticky reveal + settle | Sticky reveal (plain CSS), no settle |

Pinned heights use `svh`, with `ignoreMobileResize: true`. On phones, JavaScript transforms land a frame after the browser's own scroll, so prefer layers that move slower than the page (the lag is invisible on those). Keep to 3–5 full-bleed layers per scene, and test on a mid-range Android phone, not only on a flagship.

## 8. Performance budget

| Item | Budget or measurement |
|---|---|
| Core JavaScript: gsap + ScrollTrigger + Lenis | **49.0 KB** gzip (130.7 KB minified), measured |
| Choreography (the §5.5 file) | **3.2 KB** gzip, measured |
| Three.js (a realistic import set), lazy | **129.7 KB** gzip (519.1 KB minified), measured. Loaded after first paint, T2 and up only |
| detect-gpu | Lazy. Its benchmark data is self-hosted per GPU vendor |
| Largest contentful paint | 2.5 s or less. The hero is the S01 sky, the SVG gate and one AVIF, with `fetchpriority="high"`; no WebGL before LCP |
| Interaction to next paint | 200 ms or less. No work in scroll handlers beyond ScrollTrigger |
| Cumulative layout shift | 0.1 or less. Every image has dimensions or an `aspect-ratio`; fonts swap with metric overrides |
| Images | AVIF or WebP for the DOM, KTX2 (Basis) for WebGL, sized to the largest on-screen size × DPR (capped at 2) |
| GPU memory | ≈ 20 MB per 2880×1800 RGBA layer. At most three scenes resident; at most five full-bleed layers per scene on phones |
| Video | T2 and up only (the billboard); at most one at a time; paused off screen. No video in T1 |

Sizes were measured with gzip level 9; Brotli will be smaller.

## 9. Production and cultural notes

### 9.1 Rights and permissions

| Item | Note |
|---|---|
| Location photography | Commercial photography and filming at shrines and temples generally needs permission, and often a fee, arranged through the shrine or temple office. Itsukushima and Ryōan-ji each have their own rules. The alternative is licensed stock with property releases |
| Signage and footage | Original signage for Dōtonbori and Shinjuku, with no trademarks (for example, the Glico runner). Billboard footage must be original or licensed with releases |
| Haiku | The Japanese original is public domain; published English translations are not. Use an in-house gloss reviewed by a translator, or license a translation and credit it |
| Fonts | Shippori Mincho, Zen Kaku Gothic New, Dela Gothic One and DotGothic16 are under the SIL Open Font License (via Google Fonts): free to embed, keep the licence file |
| Audio | Field recordings (cicadas, rain, rail) must be licensed or recorded for the project |
| Map tiles | The route builder follows its map provider's licence and attribution rules |
| Reference imagery | The Ōtorii was under restoration scaffolding from 2019 to late 2022; use references from after the restoration |

### 9.2 Fact-check list

The S03 readout shows coordinates, so verify them before shipping. The values below are approximate, to two decimals.

| Item | Value | Check |
|---|---|---|
| Itsukushima Shrine, Ōtorii | 34.30N 132.32E | The gate in the sea; tide times if the imagery shows it "floating" |
| Ryōan-ji | 35.03N 135.72E | Wording of the "never all fifteen stones" claim |
| Arashiyama bamboo grove | 35.02N 135.67E | Light direction at midday |
| Nara Park | 34.69N 135.84E | The deer-bowing behaviour (R11) |
| Dōtonbori | 34.67N 135.50E | That the signage is original |
| Shinjuku | 35.69N 139.70E | — |
| Lake Kawaguchi, north shore | 35.52N 138.75E | Sunrise azimuth by season; Akafuji season |
| Tōkaidō Shinkansen top speed | 285 km/h | The readout in the portal |

### 9.3 Native review

Have a native Japanese reviewer check:

- all Japanese text: titles, tategaki, line breaks, and the haiku's presentation;
- the scene names 静寂, 旅, 匠 and 記;
- the cultural details: torii etiquette and seichū, the Akafuji timing, and the tone of the Ryōan-ji copy.

Budget one review pass before the build and one on the staging site.

## 10. Open questions

| Question | Why it matters |
|---|---|
| Vanilla JavaScript (Vite) or React? | The blueprint is vanilla. In React, wrap `init()` in `useGSAP` and run the stage in React Three Fiber with `frameloop="demand"`, driven by `gsap.ticker` |
| Is there a Japanese-language version? | It changes body typography (Japanese line length, vertical options), the haiku's presentation, and the length of the interlude copy |
| How far should the route builder go? | "Plan this route" could be inspiration (a shareable list) or a planner (rail legs, times, bookings). The latter is a product, not a section |
| Which audience and devices? | The mobile/desktop share decides whether T2 and T3 effort goes to desktop spectacle or to phone polish |
| Where does the imagery come from? | A commissioned shoot, stock, or generated plates: this drives rights (§9.1) and whether dawn and dusk light can be matched across scenes |
| Is 18.4 screens right? | Playtest with five people who haven't seen it, and trim the pin budgets (§3.1) until nobody feels stuck |
