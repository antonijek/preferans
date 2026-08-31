import { io } from 'socket.io-client';

const HTTP = 'http://localhost:3001';
let failed = false;

function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function registerAndLogin(email) {
  const res = await fetch(`${HTTP}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234' }),
  });
  const { token } = await res.json();
  return token;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(HTTP, { auth: { token }, reconnection: false });
    const states = [];
    const events = [];
    socket.on('game:state', (s) => states.push(s));
    socket.on('kibic:incoming-request', (p) => events.push({ type: 'kibic:incoming-request', ...p }));
    socket.on('connect_error', reject);
    socket.on('connect', () => resolve({ socket, states, events }));
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  const stamp = Date.now();
  const [tokenA, tokenB, tokenC, tokenSpec] = await Promise.all(
    ['a', 'b', 'c', 'spec'].map((n) => registerAndLogin(`${n}-${stamp}@test.com`))
  );

  const A = await connect(tokenA);
  const B = await connect(tokenB);
  const C = await connect(tokenC);
  const Spec = await connect(tokenSpec);

  const { code } = await emitAck(A.socket, 'room:create', {});
  await emitAck(B.socket, 'room:join', { code });
  await emitAck(C.socket, 'room:join', { code });
  await emitAck(Spec.socket, 'room:join-as-spectator', { code });
  await new Promise((r) => setTimeout(r, 300));

  const bHandBefore = B.states.at(-1).players[1].hand.map((c) => c.id).sort();
  check('B has a real 10-card hand before disconnect', bHandBefore.length === 10);

  // grant Spec a kibic view on seat 1 (B) before disconnecting Spec too
  Spec.socket.emit('kibic:request', { targetSeat: 1 });
  await new Promise((r) => setTimeout(r, 200));
  const incoming = B.events.find((e) => e.type === 'kibic:incoming-request');
  check('B received the kibic request before reconnect test', !!incoming);
  B.socket.emit('kibic:respond', { spectatorUserId: incoming.spectatorUserId, approve: true });
  await new Promise((r) => setTimeout(r, 200));
  check('Spec sees B real hand BEFORE disconnect (kibic granted)', Spec.states.at(-1).players[1].hand.length === 10);

  console.log('\n=== simulating refresh (disconnect + reconnect with same token) ===');

  B.socket.disconnect();
  await new Promise((r) => setTimeout(r, 200));

  const B2 = await connect(tokenB);
  await new Promise((r) => setTimeout(r, 400));

  check('B2 (reconnected) immediately received a game:state push with no request', B2.states.length > 0);
  const b2Last = B2.states.at(-1);
  check('B2 landed back in the same room (seat 1)', b2Last.players[1].hand.length === 10);
  const b2HandAfter = b2Last.players[1].hand.map((c) => c.id).sort();
  check('B2 has the SAME hand as before disconnect (not reshuffled)', JSON.stringify(b2HandAfter) === JSON.stringify(bHandBefore));
  check('B2 still cannot see seat 0/2 real hands after reconnect', b2Last.players[0].hand.length === 0 && b2Last.players[2].hand.length === 0);

  console.log('\n=== spectator reconnect keeps kibic grants ===');
  Spec.socket.disconnect();
  await new Promise((r) => setTimeout(r, 200));
  const Spec2 = await connect(tokenSpec);
  await new Promise((r) => setTimeout(r, 400));
  const spec2Last = Spec2.states.at(-1);
  check('reconnected spectator auto-rejoined the room', spec2Last !== undefined);
  check('reconnected spectator KEEPS earlier kibic grant on seat 1 (B)', spec2Last.players[1].hand.length === 10);
  check('reconnected spectator still cannot see seat 0/2 (grant is per-seat, not global)', spec2Last.players[0].hand.length === 0 && spec2Last.players[2].hand.length === 0);

  [A, B2, C, Spec2].forEach((c) => c.socket.disconnect());
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
