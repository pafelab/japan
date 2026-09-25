/* Komorebi & Neon · Playwright harness (storyboard §5.5, extended).

   Every test loads "/?harness", which exposes window.__kn (gsap, ScrollTrigger, BUDGET, scroll, VH,
   sceneTarget, navigate, setMotionPref, lenis, stage) and measures the real page.

   Run everything (builds with `npm run build`, serves with `npm run preview` on :4173):
     npx playwright test --reporter=list
   Run one spec, or one test, without any npm script:
     npx playwright test tests/s03.spec.js
     npx playwright test tests/s01.spec.js --project=phone
     npx playwright test -g "S03 portal"
     node tests/run.mjs s03                 # shorthand; see the header of tests/run.mjs
   Environment switches (all optional):
     KN_BASE_URL=http://localhost:5173      test a server that is already running (no build, no webServer)
     KN_OUT_DIR=.tmp/build-tests            build + preview from this folder instead of dist/
     KN_PORT=4174                           preview port (default 4173)
     KN_WORKERS=2                           parallel workers (default 4)
     KN_TRACE=1                             keep a Playwright trace for failed tests (slower)

   Projects: "desktop" (1920×1080, fine pointer) runs every test not tagged @phone; "phone"
   (390×844, touch, coarse pointer) runs only the @phone tests. Reduced motion is set per describe
   block with test.use({ reducedMotion: 'reduce' }). */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.KN_PORT || 4173);
const OUT = process.env.KN_OUT_DIR;
const BASE = process.env.KN_BASE_URL || `http://localhost:${PORT}`;

const command = OUT
  ? `npx vite build --outDir ${OUT} --emptyOutDir && npx vite preview --outDir ${OUT} --port ${PORT} --strictPort`
  : (PORT === 4173 ? 'npm run build && npm run preview'
                   : `npm run build && npx vite preview --port ${PORT} --strictPort`);

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js$/,
  outputDir: '.tmp/test-results',
  fullyParallel: true,
  workers: Number(process.env.KN_WORKERS || 4),
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,                 // generous: ten builders share this machine's CPU
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.tmp/playwright-report' }]],
  use: {
    baseURL: BASE,
    browserName: 'chromium',
    trace: process.env.KN_TRACE ? 'retain-on-failure' : 'off',   // tracing snapshots the DOM on every evaluate: opt in
    screenshot: 'only-on-failure',
    deviceScaleFactor: 1,
  },
  webServer: process.env.KN_BASE_URL ? undefined : {
    command,
    url: BASE,
    reuseExistingServer: true,
    timeout: 600_000,               // the build alone took 190 s on a loaded machine
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@phone/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
    },
    {
      name: 'phone',
      grep: /@phone/,
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
             hasTouch: true, isMobile: true },
    },
  ],
});
