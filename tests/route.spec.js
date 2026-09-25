/* Route builder (spec §4.7, contract §4 S06): the CTA opens dialog#route-builder seeded with the six
   stops; stops can be moved and removed; Esc closes and returns focus; ?route= restores a shared route.
   The markup is the route builder's choice, so stops are found by content: the list (ol/ul, or
   [data-stop] items) in the dialog whose items name the most stops. */
import { test, expect, open, note, scrollToY, mustTrig } from './kn.js';

const NAMES = ['Miyajima', 'Kyoto', 'Nara', 'Osaka', 'Tokyo', 'Kawaguchi'];

const stops = (page) => page.evaluate((NAMES) => {
  const d = document.getElementById('route-builder');
  if (!d) return null;
  const nameOf = (el) => {
    const text = el.textContent;
    let best = null, at = Infinity;
    for (const n of NAMES) { const i = text.indexOf(n); if (i >= 0 && i < at) { at = i; best = n; } }
    return best;
  };
  const tagged = [...d.querySelectorAll('[data-stop]')].filter(el => !el.closest('[hidden]'));
  let items = tagged.length ? tagged : [];
  if (!items.length) {
    let bestN = 0;
    for (const list of d.querySelectorAll('ol, ul')) {
      if (list.closest('[hidden]')) continue;
      const lis = [...list.children].filter(li => li.tagName === 'LI');
      const n = lis.filter(nameOf).length;
      if (n > bestN) { bestN = n; items = lis; }
    }
  }
  items.forEach((el, i) => el.setAttribute('data-kn-stop', String(i)));
  return items.map(nameOf).filter(Boolean);
}, NAMES);

async function openBuilder(page) {
  const t = await mustTrig(page, 's06');
  await scrollToY(page, t.start + 2);
  const cta = page.locator('.s06 [data-route-cta]').first();
  await expect(cta, 'the S06 CTA is visible after the settle').toBeVisible({ timeout: 10_000 });
  try {
    await cta.click({ timeout: 5000 });
  } catch (e) {
    // Keep this test about the route builder: if something covers the CTA (an S06 layout problem,
    // reported by s06.spec.js), activate it from the keyboard instead, as a keyboard user would.
    const why = String(e.message).split(/\r?\n/).find(l => /intercepts|not visible|outside/.test(l));
    note('pointer click blocked', why?.trim() ?? 'timeout');
    await cta.focus();
    await page.keyboard.press('Enter');
  }
  await expect.poll(() => page.evaluate(() => document.getElementById('route-builder')?.open ?? false),
    { message: 'dialog#route-builder opens', timeout: 8000 }).toBe(true);
  return cta;
}

/** Click the first button inside `scope` whose accessible text matches `re`. */
async function clickButton(page, scope, re) {
  const btns = page.locator(`${scope} button`);
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const b = btns.nth(i);
    const label = ((await b.getAttribute('aria-label')) || (await b.getAttribute('title')) || (await b.innerText())).trim();
    if (re.test(label) && await b.isVisible() && await b.isEnabled()) { await b.click(); return label; }
  }
  return null;
}

test('Route builder: the CTA opens the dialog with six stops; move and remove work; Esc closes and returns focus', async ({ page }) => {
  await open(page);
  await openBuilder(page);
  const seed = await stops(page);
  note('seed', seed.join(' → '));
  expect(seed, 'six stops in order').toEqual(NAMES);
  const modal = await page.evaluate(() => document.getElementById('route-builder').matches(':modal'));
  expect.soft(modal, 'opened as a modal dialog (showModal)').toBe(true);

  // Move: the first stop later (a "down"/"later" control on it), or the second one earlier.
  let moved = await clickButton(page, '#route-builder [data-kn-stop="0"]', /down|later|after|move.*(↓|down)|↓/i);
  if (!moved) moved = await clickButton(page, '#route-builder [data-kn-stop="1"]', /up|earlier|before|↑/i);
  expect(moved, 'a move-down / move-up button on a stop').not.toBeNull();
  const afterMove = await stops(page);
  note('after move', `"${moved}": ${afterMove.join(' → ')}`);
  expect(afterMove.slice(0, 2), 'the first two stops swapped').toEqual([NAMES[1], NAMES[0]]);

  // Remove: a remove control on the (new) third stop.
  const victim = afterMove[2];
  const removed = await clickButton(page, '#route-builder [data-kn-stop="2"]', /remove|delete|drop|skip|×|✕/i);
  expect(removed, 'a remove button on a stop').not.toBeNull();
  await expect.poll(async () => (await stops(page)).length, { message: 'five stops after a remove' }).toBe(5);
  const afterRemove = await stops(page);
  note('after remove', `"${removed}" ${victim}: ${afterRemove.join(' → ')}`);
  expect(afterRemove).not.toContain(victim);

  // Restore (contract minimum scope): any restore / add-back control in the dialog.
  const restored = await clickButton(page, '#route-builder', /restore|undo|add back|re-?add|reset|put back/i);
  expect.soft(restored, 'a restore control exists').not.toBeNull();
  if (restored) await expect.configure({ soft: true }).poll(async () => (await stops(page)).length, { message: 'six stops after restore' }).toBe(6);

  // Esc closes and focus returns to the CTA.
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.getElementById('route-builder').open)).toBe(false);
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return { cta: !!a?.matches('[data-route-cta]'), what: a ? `${a.tagName}.${a.className}` : 'none' };
  });
  note('focus after Esc', focused.what);
  expect(focused.cta, 'focus returns to the CTA').toBe(true);
});

test('Route builder: ?route=kyoto,nara,osaka restores a shared route with three stops', async ({ page }) => {
  await open(page, { query: 'route=kyoto,nara,osaka' });
  await page.waitForTimeout(1500);
  const autoOpen = await page.evaluate(() => document.getElementById('route-builder')?.open ?? false);
  note('dialog opened by the link', String(autoOpen));
  if (!autoOpen) await openBuilder(page);
  await expect.poll(async () => (await stops(page))?.join(','), { message: 'three stops from the link' }).toBe('Kyoto,Nara,Osaka');
});
