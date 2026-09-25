/* Komorebi & Neon · entry. Fonts are self-hosted glyph subsets (tools/fonts.mjs; SIL OFL): each face
   carries only the Latin range and the Japanese glyphs this page actually uses. */
import './styles/fonts.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/s01.css';
import './styles/s02.css';
import './styles/interlude.css';
import './styles/s03.css';
import './styles/s04.css';
import './styles/s05.css';
import './styles/s06.css';
import './styles/route.css';

import { init } from './choreography.js';
import { initHudUI } from './hud/hud-ui.js';
import { initRouteCTA } from './route/index.js';

init();
initHudUI();
initRouteCTA();
