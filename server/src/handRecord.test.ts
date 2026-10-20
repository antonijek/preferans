import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../engine/dist/game.js';
import { autoPlayToHandEnd } from '../../engine/dist/aiSearch.js';
import { initialHands } from './handRecord.js';

const sorted = (cards: { suit: string; rank: string }[]) => cards.map((c) => `${c.rank}${c.suit}`).sort();

test('pocetne ruke sastavljene na kraju ruke = stvarno deljenje (heuristicki AI odigra ruku)', () => {
  let checked = 0;
  let withTalon = 0;
  let unfinishedPlay = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const g = new Game({ seed });
    g.newHand(0);
    const dealt = g.state.players.map((p) => sorted(p.hand));
    // false = ruka ponistena (svi dalje) — tad je deljenje drugo, preskoci
    if (!autoPlayToHandEnd(g, Math.random, 400)) continue;
    const got = initialHands(g.state).map(sorted);
    assert.deepEqual(got, dealt, `seed ${seed}`);
    checked++;
    if (g.state.discard.length > 0) withTalon++;
    if (g.state.tricks.length < 10) unfinishedPlay++;
  }
  assert.ok(checked >= 50, `premalo odigranih ruku: ${checked}`);
  assert.ok(withTalon > 0, 'nijedna ruka sa talonom/skartom');
  assert.ok(unfinishedPlay > 0, 'nijedna ruka zavrsena pre 10. stiha');
});
