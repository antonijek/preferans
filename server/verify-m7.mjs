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
    const messages = [];
    const backlogs = [];
    socket.on('chat:message', (m) => messages.push(m));
    socket.on('chat:backlog', (b) => backlogs.push(b));
    socket.on('connect_error', reject);
    socket.on('connect', () => resolve({ socket, messages, backlogs }));
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  const stamp = Date.now();
  const [tokenA, tokenB, tokenC] = await Promise.all(
    ['a', 'b', 'c'].map((n) => registerAndLogin(`${n}-${stamp}@test.com`))
  );

  const A = await connect(tokenA);
  const B = await connect(tokenB);
  const C = await connect(tokenC);

  const { code } = await emitAck(A.socket, 'room:create', {});
  await emitAck(B.socket, 'room:join', { code });
  await emitAck(C.socket, 'room:join', { code });
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n=== chat broadcast + order ===');
  A.socket.emit('chat:send', { text: 'zdravo od A' });
  await new Promise((r) => setTimeout(r, 150));
  B.socket.emit('chat:send', { text: 'zdravo od B' });
  await new Promise((r) => setTimeout(r, 150));

  check('B received A\'s message', B.messages.some((m) => m.text === 'zdravo od A' && m.seat === 0));
  check('C received both messages', C.messages.length === 2);
  check('order preserved (A then B) on C', C.messages[0].text === 'zdravo od A' && C.messages[1].text === 'zdravo od B');
  check('A does NOT receive its own message twice as an echo issue', A.messages.filter((m) => m.text === 'zdravo od A').length === 1);

  console.log('\n=== reconnect gets scrollback ===');
  B.socket.disconnect();
  await new Promise((r) => setTimeout(r, 150));
  const B2 = await connect(tokenB);
  await new Promise((r) => setTimeout(r, 300));

  check('reconnected B2 received a chat:backlog event', B2.backlogs.length > 0);
  const backlog = B2.backlogs.at(-1);
  check('backlog contains both earlier messages in order', backlog.length === 2 && backlog[0].text === 'zdravo od A' && backlog[1].text === 'zdravo od B');

  [A, B2, C].forEach((c) => c.socket.disconnect());
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
