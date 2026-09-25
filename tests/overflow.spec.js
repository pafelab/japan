/* No sideways page overflow (spec §5.5): desktop here, phone in phone.spec.js, reduced motion in reduced.spec.js. */
import { test, open, checkNoOverflow } from './kn.js';

test('No sideways page overflow: desktop 1920×1080', async ({ page }) => {
  await open(page);
  await checkNoOverflow(page);
});
