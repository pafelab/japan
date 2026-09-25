#!/usr/bin/env node
/* Run one spec (or all) without an npm script.

   node tests/run.mjs                   every spec, both projects
   node tests/run.mjs s03               tests/s03.spec.js (desktop + phone projects, whichever match)
   node tests/run.mjs s01 phone         only the phone project
   node tests/run.mjs route --dev       against the dev server at http://localhost:5173 (no build)
   node tests/run.mjs s05 --tmp         build into .tmp/build-tests and preview on :4174 (leaves dist/ alone)
   Anything after "--" goes to Playwright unchanged, e.g.  node tests/run.mjs s03 -- -g "portal" --headed

   Equivalent plain commands:  npx playwright test tests/s03.spec.js --project=desktop --reporter=list */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const passthrough = dd >= 0 ? argv.slice(dd + 1) : [];
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const flags = new Set(own.filter(a => a.startsWith('--')));
const [name, project] = own.filter(a => !a.startsWith('--'));

const args = ['playwright', 'test', '--reporter=list'];
if (name) {
  const file = `tests/${name.replace(/^tests\//, '').replace(/\.spec\.js$/, '')}.spec.js`;
  if (!existsSync(file)) { console.error(`No such spec: ${file}`); process.exit(2); }
  args.push(file);
}
if (project) args.push(`--project=${project}`);
args.push(...passthrough);

const env = { ...process.env };
if (flags.has('--dev')) env.KN_BASE_URL = 'http://localhost:5173';
if (flags.has('--tmp')) { env.KN_OUT_DIR = '.tmp/build-tests'; env.KN_PORT = env.KN_PORT || '4174'; }

const r = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
