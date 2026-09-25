/* Accessibility smoke (spec §6, contract §0): axe on the static (reduced-motion) page, and an
   accessible name on everything image-like. */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, open, note } from './kn.js';

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Accessibility: axe finds no serious or critical violations on the reduced-motion page', async ({ page }) => {
    await open(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const fmt = (v) => `${v.impact} ${v.id} ×${v.nodes.length}: ${v.help} [${v.nodes.slice(0, 4).map(n => n.target.join(' ')).join(' | ')}]`;
    const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    const rest = violations.filter(v => !severe.includes(v));
    note('serious/critical', severe.length ? severe.map(fmt).join('\n') : 'none');
    note('moderate/minor', rest.length ? rest.map(fmt).join('\n') : 'none');
    expect(severe.map(fmt)).toEqual([]);
  });

  test('Accessibility: every image-like element has an accessible name (role=img has aria-label)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const path = (el) => {
        const parts = [];
        for (let n = el; n && n !== document.body && parts.length < 4; n = n.parentElement)
          parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : ''));
        return parts.join(' > ');
      };
      const hidden = (el) => !!el.closest('[aria-hidden="true"], [hidden]');
      const name = (el) => {
        const l = el.getAttribute('aria-label')?.trim();
        if (l) return l;
        const ids = el.getAttribute('aria-labelledby');
        if (ids) { const t = ids.split(/\s+/).map(id => document.getElementById(id)?.textContent.trim() ?? '').join(' ').trim(); if (t) return t; }
        if (el.tagName === 'IMG') return el.getAttribute('alt');
        const title = el.querySelector(':scope > title')?.textContent.trim();
        return title || null;
      };
      const problems = [], named = [];
      for (const el of document.querySelectorAll('[role="img"]')) {
        if (hidden(el)) continue;
        const n = name(el);
        if (!n) problems.push(`role=img without a name: ${path(el)}`);
        else if (/^placeholder$/i.test(n)) problems.push(`role=img still named "Placeholder": ${path(el)}`);
        else named.push(n);
      }
      for (const el of document.querySelectorAll('img')) {
        if (hidden(el)) continue;
        if (!el.hasAttribute('alt')) problems.push(`img without alt: ${path(el)}`);
      }
      const advisory = [];
      for (const el of document.querySelectorAll('svg, canvas, video')) {
        if (hidden(el) || el.closest('[role="img"]')) continue;      // role=img itself was checked above
        const role = el.getAttribute('role');
        if (role === 'presentation' || role === 'none' || name(el)) continue;
        const control = el.closest('button, a, [role="button"], label');
        if (control && (control.getAttribute('aria-label') || control.textContent.trim())) {
          advisory.push(`unnamed ${el.tagName.toLowerCase()} inside a labelled control (aria-hidden="true" recommended): ${path(el)}`);
          continue;
        }
        problems.push(`exposed ${el.tagName.toLowerCase()} without a name (aria-hidden it if decorative, or role=img + aria-label): ${path(el)}`);
      }
      return { problems, named, advisory };
    });
    note('named pictures', r.named.length ? r.named.map(n => `"${n.slice(0, 70)}"`).join(' · ') : 'none');
    if (r.advisory.length) note('advisory', r.advisory.join(' · '));
    expect(r.named.length, 'the page has labelled pictures').toBeGreaterThan(0);
    expect(r.problems).toEqual([]);
  });
});
