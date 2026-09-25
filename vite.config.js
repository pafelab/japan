import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// <!-- @include src/partials/s01.html --> pulls a partial into index.html, so each scene's markup
// lives in its own file. Partials may include further partials (one level is all we use).
function htmlIncludes() {
  const inline = (html, depth = 0) => html.replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (_, p) => {
    if (depth > 3) throw new Error('html-includes: nesting too deep at ' + p);
    return inline(readFileSync(root + p, 'utf8'), depth + 1);
  });
  return {
    name: 'html-includes',
    transformIndexHtml: { order: 'pre', handler: (html) => inline(html) },
    handleHotUpdate({ file, server }) {
      if (/[\\/]partials[\\/].+\.html$/.test(file)) { server.ws.send({ type: 'full-reload' }); return []; }
    },
  };
}

export default defineConfig({
  plugins: [htmlIncludes()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
