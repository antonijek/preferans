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

// sve sto app.js uvozi (i ono sto uvoze oni) mora da bude u kesu, inace
// igra bez interneta puca na prvom nedostajucem modulu
test('sw.js: lista keša sadrži sve module koje app.js uvozi', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = sw.match(/SHELL_FILES = \[([\s\S]*?)\];/)?.[1] ?? '';
  const list = new Set([...shell.matchAll(/'([^']+)'/g)].map((m) => m[1]!));
  const seen = new Set<string>();
  const walk = (rel: string) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*['"](\.\.?\/[^'"]+)['"]/g)) {
      walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]!)));
    }
  };
  walk('app.js');
  assert.deepEqual([...seen].map((r) => '/' + r).filter((r) => !list.has(r)), []);
});
