// "Nosim sve štihove" (claimEvents.ts + claim-ui.js): tri igrača — predlog,
// odbijanje, pa predlog koji svi prihvate; zatim sto sa računarom, koji se
// slaže samo kad je tvrdnja sigurna. Server: DB_PATH=<sveza> PORT=3001.

import { chromium } from 'playwright';
import { makeChecker, registerFromHome, phaseOf, TERMINAL, driveUntil } from './verify-helpers.mjs';

const { check, state } = makeChecker();

const seatOf = (page) =>
  page.evaluate(() => window.game.state.players.findIndex((p) => p.handCount > 0 && p.hand.length > 0));

// sledeca ruka koja nije Betl, na pocetku stiha
async function reachClaimablePlaying(pages) {
  for (let tries = 0; tries < 8; tries++) {
    const ok = await driveUntil(pages, async () => {
      const s = await pages[0].evaluate(() => window.game?.state);
      return s?.phase === 'PLAYING' && s.currentTrick.length === 0;
    }, { dealNext: true, maxIters: 1500 });
    if (!ok) return false;
    const game = await pages[0].evaluate(() => window.game.state.declaredGame);
    if (game !== 'Betl' && game !== 'Igra-Betl') return true;
    await driveUntil(pages, async () => TERMINAL.includes(await phaseOf(pages[0])), { maxIters: 1500 });
  }
  return false;
}

async function activePagesBySeat(pages) {
  const out = [];
  for (const p of pages) {
    const seat = await seatOf(p);
    const active = await p.evaluate((s) => window.game.state.followChoices[s] !== 'NE_DODJEM', seat);
    out.push({ page: p, seat, active });
  }
  return out;
}

async function threeHumans(browser) {
  const stamp = Date.now();
  const [A, B, C] = await Promise.all([1, 2, 3].map(() => browser.newContext().then((c) => c.newPage())));
  await registerFromHome(A, 'ClA', `cla-${stamp}@test.com`);
  await registerFromHome(B, 'ClB', `clb-${stamp}@test.com`);
  await registerFromHome(C, 'ClC', `clc-${stamp}@test.com`);
  for (const p of [A, B, C]) await p.click('[onclick="goToRoomScreen()"]');
  await A.click('[onclick="createRoomOnline()"]');
  await A.waitForFunction(() => document.getElementById('roomCodeInput').value.length === 5, { timeout: 5000 });
  const code = await A.inputValue('#roomCodeInput');
  for (const p of [B, C]) {
    await p.fill('#roomCodeInput', code);
    await p.click('#roomJoinBtn');
  }
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 8000 });
  const pages = [A, B, C];

  check('stigli smo do odigravanja (ne Betl)', await reachClaimablePlaying(pages));
  // posle prvog stiha, da bi i rok "izmedju dva stiha" bio proveren
  await driveUntil(pages, async () => {
    const s = await A.evaluate(() => window.game.state);
    return s.phase !== 'PLAYING' || (s.trickCount >= 1 && s.currentTrick.length === 0);
  }, { maxIters: 400 });
  if ((await phaseOf(A)) !== 'PLAYING') {
    console.log('ruka se zavrsila pre provere — preskacem');
    return;
  }
  const seats = await activePagesBySeat(pages);
  const declarer = await A.evaluate(() => window.game.state.winner);
  const claimer = seats.find((x) => x.seat === declarer);
  const voters = seats.filter((x) => x.active && x.seat !== declarer);
  for (const x of seats) {
    const has = (await x.page.locator('#claimBtn').count()) > 0;
    check(`dugme "Nosim sve" ${x.active ? 'vidi' : 'NE vidi'} mesto ${x.seat}`, has === x.active);
  }

  await claimer.page.click('#claimBtn');
  await claimer.page.waitForFunction(() => window.game.state.claim, { timeout: 3000 });
  const handLen = await claimer.page.evaluate(() => window.game.state.players.find((p) => p.hand.length).hand.length);
  for (const v of voters) {
    await v.page.waitForSelector('#claimDeclineBtn', { timeout: 3000 });
    const shown = await v.page.locator('#claimControls .claim-cards .mini-card').count();
    check(`mesto ${v.seat} vidi karte onoga ko tvrdi (${shown}/${handLen})`, shown === handLen);
  }
  check('onaj ko tvrdi nema dugme za glasanje', (await claimer.page.locator('#claimAcceptBtn').count()) === 0);
  if (process.env.SHOT_DIR) {
    await voters[0].page.screenshot({ path: `${process.env.SHOT_DIR}/claim-vote-desk.png` });
    await voters[1].page.setViewportSize({ width: 390, height: 844 });
    await voters[1].page.waitForTimeout(400);
    await voters[1].page.screenshot({ path: `${process.env.SHOT_DIR}/claim-vote-phone.png` });
    await claimer.page.screenshot({ path: `${process.env.SHOT_DIR}/claim-wait-desk.png` });
  }

  await voters[0].page.click('#claimDeclineBtn');
  await claimer.page.waitForFunction(() => !window.game.state.claim, { timeout: 3000 });
  check('posle odbijanja igra se dalje', (await phaseOf(claimer.page)) === 'PLAYING');
  const chat = await claimer.page.textContent('#chatLog');
  check('u chatu piše da se neko ne slaže', chat.includes('ne slaže'));

  await claimer.page.waitForSelector('#claimBtn', { timeout: 3000 });
  await claimer.page.click('#claimBtn');
  for (const v of voters) {
    await v.page.waitForSelector('#claimAcceptBtn', { timeout: 3000 });
    if (process.env.SHOT_DIR) await v.page.screenshot({ path: `${process.env.SHOT_DIR}/claim-accept-${v.seat}.png` });
    await v.page.click('#claimAcceptBtn', { timeout: 5000 });
  }
  await claimer.page.waitForFunction(() => window.game.state.phase !== 'PLAYING', { timeout: 5000 });
  const end = await claimer.page.evaluate(() => {
    const s = window.game.state;
    return { phase: s.phase, claimedBy: s.claimedBy, tricks: s.players.map((p) => p.tricksWon), count: s.trickCount };
  });
  console.log('kraj ruke:', JSON.stringify(end));
  check('svi su se složili — ruka je završena', TERMINAL.includes(end.phase));
  check('zapisano je ko je nosio sve', end.claimedBy === declarer);
  check('svih 10 štihova je podeljeno', end.tricks.reduce((a, b) => a + b, 0) === 10);
}

async function withComputer(browser) {
  const A = await (await browser.newContext()).newPage();
  await registerFromHome(A, 'ClBot', `clbot-${Date.now()}@test.com`);
  await A.click('[onclick="goToRoomScreen()"]');
  await A.click('[onclick="createRoomOnline(true)"]');
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 10000 });
  // na pocetku odigravanja tvrdnja skoro nikad nije sigurna — racunar odbija
  let tested = false;
  for (let i = 0; i < 10 && !tested; i++) {
    if (!(await reachClaimablePlaying([A]))) break;
    if ((await A.locator('#claimBtn').count()) === 0) {
      await driveUntil([A], async () => TERMINAL.includes(await phaseOf(A)), { maxIters: 1500 });
      continue;
    }
    const before = await A.evaluate(() => window.game.state.players.map((p) => p.hand.length || p.handCount));
    await A.click('#claimBtn');
    await A.waitForTimeout(800);
    const s = await A.evaluate(() => ({ phase: window.game.state.phase, claim: window.game.state.claim }));
    const chat = await A.textContent('#chatLog');
    if (s.phase === 'PLAYING') {
      check('računar se nije složio — igra se dalje, predlog je skinut', !s.claim && chat.includes('ne slaže'));
    } else {
      check('računar se složio — ruka završena (tvrdnja je bila sigurna)', TERMINAL.includes(s.phase));
    }
    console.log('karte pre tvrdnje:', before.join('/'), '→ faza', s.phase);
    tested = true;
  }
  check('sto sa računarom je proveren', tested);
}

const browser = await chromium.launch();
try {
  await threeHumans(browser);
  await withComputer(browser);
} catch (e) {
  console.log('FAIL - izuzetak:', e.message);
  state.failed = true;
}
await browser.close();
console.log(state.failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(state.failed ? 1 : 0);
