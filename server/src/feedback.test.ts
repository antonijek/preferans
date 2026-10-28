import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedback, MAX_MESSAGE } from './feedback.js';

test('feedback: vrsta i tekst su obavezni', () => {
  assert.deepEqual(parseFeedback({ message: 'Lepa igra' }), { error: 'Izaberi vrstu poruke.' });
  assert.deepEqual(parseFeedback({ kind: 'bug', message: '  a ' }), { error: 'Napiši bar par reči.' });
  assert.deepEqual(parseFeedback({ kind: 'hack', message: 'Lepa igra' }), { error: 'Izaberi vrstu poruke.' });
  assert.deepEqual(parseFeedback(null), { error: 'Izaberi vrstu poruke.' });
});

test('feedback: predugacka poruka se odbija, kontakt se skracuje', () => {
  assert.ok('error' in parseFeedback({ kind: 'idea', message: 'x'.repeat(MAX_MESSAGE + 1) }));
  const ok = parseFeedback({ kind: 'idea', message: ' Dodajte turnire ', contact: 'y'.repeat(300) });
  assert.ok(!('error' in ok));
  assert.equal(ok.message, 'Dodajte turnire');
  assert.equal(ok.contact?.length, 100);
  assert.equal(ok.context, null);
});

test('feedback: ruka iz partije se cuva kao JSON, prevelika se izostavlja', () => {
  const ok = parseFeedback({ kind: 'bug', message: 'Bot je pogresio', contact: '  ', context: { mode: 'local', round: 3 } });
  assert.ok(!('error' in ok));
  assert.equal(ok.contact, null);
  assert.equal(ok.context, '{"mode":"local","round":3}');
  const big = parseFeedback({ kind: 'bug', message: 'Bot je pogresio', context: { s: 'z'.repeat(30_000) } });
  assert.ok(!('error' in big));
  assert.equal(big.context, null);
});
