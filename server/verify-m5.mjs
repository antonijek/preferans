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
    socket.on('room:lock-changed', (p) => events.push({ type: 'room:lock-changed', ...p }));
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

  console.log('\n=== room:create + room:join ===');
  const createRes = await emitAck(A.socket, 'room:create', {});
  check('room:create returns a code and seat 0', typeof createRes.code === 'string' && createRes.seat === 0);
  const code = createRes.code;

  const joinB = await emitAck(B.socket, 'room:join', { code });
  check('B joins and gets seat 1', joinB.seat === 1);
  const joinC = await emitAck(C.socket, 'room:join', { code });
  check('C joins and gets seat 2', joinC.seat === 2);

  await new Promise((r) => setTimeout(r, 300));
  const aState = A.states.at(-1);
  check('game auto-started on 3rd join (phase != WAITING)', aState.phase !== 'WAITING');
  check('B sees the same phase as A (shared room state)', B.states.at(-1).phase === aState.phase);

  console.log('\n=== 4th player rejected (room full) ===');
  const tokenD = await registerAndLogin(`d-${stamp}@test.com`);
  const D = await connect(tokenD);
  const joinD = await emitAck(D.socket, 'room:join', { code });
  check('4th player join is rejected', typeof joinD.error === 'string');

  console.log('\n=== spectator join (room unlocked by default) ===');
  const specJoin = await emitAck(Spec.socket, 'room:join-as-spectator', { code });
  check('spectator joins successfully', specJoin.code === code);
  await new Promise((r) => setTimeout(r, 300));
  const specState = Spec.states.at(-1);
  check('spectator sees no hands by default', specState.players.every((p) => p.hand.length === 0));

  console.log('\n=== lock toggle blocks NEW spectators ===');
  const lockRes = await emitAck(A.socket, 'room:toggle-lock', {});
  check('seated player can toggle lock', lockRes.locked === true);
  const tokenSpec2 = await registerAndLogin(`spec2-${stamp}@test.com`);
  const Spec2 = await connect(tokenSpec2);
  const spec2Join = await emitAck(Spec2.socket, 'room:join-as-spectator', { code });
  check('new spectator rejected while locked', typeof spec2Join.error === 'string');

  console.log('\n=== kibic request/approve flow ===');
  Spec.socket.emit('kibic:request', { targetSeat: 0 });
  await new Promise((r) => setTimeout(r, 300));
  const incoming = A.events.find((e) => e.type === 'kibic:incoming-request');
  check('seat 0 (A) received the kibic request', !!incoming);

  A.socket.emit('kibic:respond', { spectatorUserId: incoming.spectatorUserId, approve: true });
  await new Promise((r) => setTimeout(r, 300));
  const specStateAfterKibic = Spec.states.at(-1);
  check('spectator now sees seat 0 real hand', specStateAfterKibic.players[0].hand.length > 0);
  check('spectator still does NOT see seat 1/2 hands', specStateAfterKibic.players[1].hand.length === 0 && specStateAfterKibic.players[2].hand.length === 0);

  [A, B, C, D, Spec, Spec2].forEach((c) => c.socket.disconnect());
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
