import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicPath } from './publicPaths.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('sve sto igra ucitava je javno', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = [...(sw.match(/SHELL_FILES = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  // lokalni src/href iz svih stranica (bez upita ?v=)
  const refs = pages.flatMap((p) => [...fs.readFileSync(path.join(ROOT, p), 'utf8')
    .matchAll(/(?:src|href)="(\.?\/[^"?#]+)/g)].map((m) => m[1]!.replace(/^\.\//, '/')));
  const icons = fs.readdirSync(path.join(ROOT, 'icons'), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.endsWith('.txt'))
    .map((d) => '/' + path.relative(ROOT, path.join(d.parentPath, d.name)).replaceAll('\\', '/'));
  const all = [...shell, ...pages.map((p) => '/' + p), ...refs, ...icons, '/push-sw.js', '/sw.js'];
  assert.ok(all.length > 50);
  assert.deepEqual(all.filter((p) => !isPublicPath(p)), []);
});

test('baza, server, alati i beleske nisu javni', () => {
  for (const p of [
    '/server/data.db', '/server/.env', '/server/package.json', '/server/src/db.ts', '/server/dist/index.js',
    '/tools/deploy.sh', '/docs/x.md', '/node_modules/playwright/package.json', '/engine/src/game.ts',
    '/engine/dist/game.d.ts', '/TODO.md', '/package.json', '/desktop.png', '/result.txt',
    '/icons/../server/data.db', '/icons/%2e%2e/server/data.db', '/.git/config', '/notify-indexnow.mjs',
  ]) assert.equal(isPublicPath(p), false, p);
});
