import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/* After the build, list every file in dist and stamp it (plus a content hash) into dist/sw.js
   so the whole game is cached on first visit and old caches are replaced on each new deploy. */
function swPrecache() {
  let outDir = 'dist';
  return {
    name: 'ksr-sw-precache',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const walk = (dir, base = '') => readdirSync(dir, { withFileTypes: true })
        .flatMap(d => d.isDirectory() ? walk(join(dir, d.name), base + d.name + '/') : [base + d.name]);
      const files = walk(outDir)
        .filter(f => f !== 'sw.js' && f !== 'admin.html' && !f.endsWith('.map') && !/(^|\/)One$/.test(f))
        .map(f => '/' + f);
      const h = createHash('sha1');
      files.forEach(f => { h.update(f); h.update(readFileSync(join(outDir, f.slice(1)))); });
      const out = readFileSync(sw, 'utf8')
        .replace("'__BUILD__'", JSON.stringify(h.digest('hex').slice(0, 10)))
        .replace('/*__PRECACHE__*/[]', JSON.stringify(files));
      writeFileSync(sw, out);
    }
  };
}

export default defineConfig({ plugins: [swPrecache()] });
