import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sw.js SHELL_FILES ide u cache.addAll — dupla adresa ili fajl koji ne
// postoji obara instalaciju service workera (igra tad nema offline kes).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('sw.js: lista keša bez duplikata, svi fajlovi postoje', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = sw.match(/SHELL_FILES = \[([\s\S]*?)\];/)?.[1] ?? '';
  const files = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  assert.ok(files.length > 10);
  assert.deepEqual(files.filter((f, i) => files.indexOf(f) !== i), []);
  const missing = files.filter((f) => f !== '/' && !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, []);
});
