import { chromium } from 'playwright';

// Zatvorene lige od pocetka do kraja (league-ui.js + leagues.ts):
//  1. A pravi ligu; B i C ulaze preko pozivnog linka ?liga=KOD (registracija
//     na tom linku sama uvodi u ligu); D nije clan.
//  2. A pravi ligasku sobu: nema "Popuni racunarom", u lobiju 🏆 oznaka,
//     D ne moze da sedne; B i C sedaju sa stranice lige (Stolovi lige).
//  3. Jedna ruka pa dogovoren kraj — pre 10 ruku se NE upisuje u tabelu.
//  4. Revans ostaje ligaski; 10 ruku pa dogovoren kraj — upisuje se,
//     tabela ima 10-5-1 bodova (ili podeljene) i istaknut je "moj" red.
// Pokretanje: sveza baza, npr. DB_PATH=<tmp> PORT=3001 node dist/index.js
// (registracija je ogranicena na 5 po satu po IP adresi, ovde se trose 4).

const URL = 'http://localhost:3001/';
const LEAGUE_NAME = 'Liga <b>Test</b>';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function fillRegistration(page, letter, stamp) {
  await page.fill('#loginName', `Test-${letter}`);
  await page.fill('#loginEmail', `lg${letter}-${stamp}@test.com`);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen [onclick="doRegister()"]');
}

async function registerFromHome(page, letter, stamp) {
  await page.goto(URL);
  await page.click('[onclick="goOnline()"]');
  await fillRegistration(page, letter, stamp);
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
}

const phaseOf = (page) => page.evaluate(() => window.game?.state?.phase ?? null);
const roundOf = (page) => page.evaluate(() => window.game?.state?.round ?? 0);
const TERMINAL = ['GAME_OVER', 'REFE', 'MATCH_OVER'];

// Isti pristup kao verify-match-end-history.mjs: svako odigra prvu legalnu
// stvar. U svakoj ruci prvi na potezu licitira, ostali kazu "dalje" — kad
// svi kazu "dalje", server deli ponovo u ISTOJ ruci (round se ne menja).
async function tryAct(page, { dealNext }) {
  const phase = await phaseOf(page);
  if (!phase) return;
  if (phase === 'BIDDING') {
    const raise = page.locator('#bidControls .bid-btn.primary');
    const pass = page.locator('#bidControls .bid-btn.danger');
    const noBidYet = await page.evaluate(() => window.game.state.currentBid === 0);
    if (noBidYet && (await raise.count()) > 0) await raise.first().click();
    else if ((await pass.count()) > 0) await pass.first().click();
  } else if (phase === 'DISCARDING') {
    const cards = page.locator('#handArea .card');
    if ((await cards.count()) < 2) return;
    await cards.nth(0).click();
    await cards.nth(1).click();
    const confirm = page.locator('#bidControls .bid-btn.primary');
    if ((await confirm.count()) > 0) await confirm.first().click();
  } else if (['DECLARING', 'FOLLOW_DECLARING', 'KONTRA_DECLARING'].includes(phase)) {
    const btn = page.locator('#bidControls button').first();
    if ((await btn.count()) > 0) await btn.click();
  } else if (phase === 'PLAYING') {
    const card = page.locator('#handArea .card.playable').first();
    if ((await card.count()) > 0) await card.click();
  } else if (dealNext && (phase === 'GAME_OVER' || phase === 'REFE')) {
    const next = page.locator('#nextRoundBtn');
    if (await next.isVisible()) await next.click();
  }
}

// Stanje igre koje mora da se menja dok se igra — ako stoji, igra je zapela.
const progressKey = (page) => page.evaluate(() => {
  const s = window.game?.state;
  return s ? `${s.round}|${s.phase}|${s.currentPlayer}|${s.bids?.length}|${s.trickCount}|${s.currentTrick?.length}` : 'none';
});

async function driveUntil(pages, predicate, { maxIters = 3000, dealNext = false } = {}) {
  let lastKey = null;
  let still = 0;
  for (let i = 0; i < maxIters; i++) {
    if (await predicate()) return true;
    const key = await progressKey(pages[0]);
    still = key === lastKey ? still + 1 : 0;
    lastKey = key;
    if (still >= 150) {
      console.log(`  ZASTOJ: stanje se ne menja (${key})`);
      await dumpPages();
      return false;
    }
    for (const p of pages) await tryAct(p, { dealNext }).catch(() => {});
    await pages[0].waitForTimeout(120);
  }
  return false;
}

async function agreeEndMatch(proposer, others) {
  await proposer.click('#matchMenuBtn');
  await proposer.click('#matchMenuPanel [onclick*="proposeEndMatch"]');
  await proposer.click('#endMatchBanners .end-match-actions .bid-btn.primary');
  for (const p of others) {
    await p.waitForSelector('#endMatchBanners .end-match-actions .bid-btn.primary', { timeout: 5000 });
    await p.click('#endMatchBanners .end-match-actions .bid-btn.primary');
  }
  await proposer.waitForFunction(() => window.game?.state?.phase === 'MATCH_OVER', { timeout: 8000 });
}

async function openLeaguePage(page) {
  await page.evaluate(() => window.goToLeagues());
  await page.waitForSelector('#leagueList .league-card', { timeout: 5000 });
  await page.click('#leagueList .league-card');
  await page.waitForSelector('#leagueStandings', { timeout: 5000 });
}

async function standings(page) {
  return page.$$eval('#leagueStandings tr', (rows) => rows.map((tr) => ({
    cells: [...tr.children].map((td) => td.textContent),
    me: tr.classList.contains('me'),
  })));
}

let pagesForDebug = [];
async function dumpPages() {
  for (const [i, p] of pagesForDebug.entries()) {
    const info = await p.evaluate(() => ({
      screens: [...document.querySelectorAll('.screen.active')].map((s) => s.id),
      phase: window.game?.state?.phase ?? null,
      round: window.game?.state?.round ?? null,
      currentPlayer: window.game?.state?.currentPlayer ?? null,
      inGame: document.body.classList.contains('online-in-game'),
      bidButtons: document.querySelectorAll('#bidControls button').length,
      handCards: document.querySelectorAll('#handArea .card').length,
      roomError: document.getElementById('roomError')?.textContent,
      leagueError: document.getElementById('leagueError')?.textContent ?? null,
    })).catch((e) => ({ evalError: e.message }));
    console.log(`page${'ABCD'[i]}:`, JSON.stringify(info));
  }
  if (pageErrors.length) console.log('JS greske:', pageErrors);
}
const pageErrors = [];

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();
  const [A, B, C, D] = await Promise.all([1, 2, 3, 4].map(() => browser.newContext().then((c) => c.newPage())));
  pagesForDebug = [A, B, C, D];
  [A, B, C, D].forEach((p, i) => p.on('pageerror', (e) => pageErrors.push(`page${'ABCD'[i]}: ${e.message}`)));

  // --- 1. liga i pozivni link ---
  await registerFromHome(A, 'a', stamp);
  await A.click('#leaguesBtn');
  await A.waitForSelector('#leagueScreen.active #leagueCreateBtn', { timeout: 5000 });
  await A.click('#leagueCreateBtn');
  await A.waitForSelector('#lgName');
  await A.fill('#lgName', LEAGUE_NAME);
  await A.fill('#lgNorma', '1');
  await A.click('#lgSubmitBtn');
  await A.waitForSelector('#leagueCode', { timeout: 5000 });
  const code = (await A.textContent('#leagueCode')).trim();
  check('liga napravljena, pozivni kod od 6 znakova', /^[A-Z0-9]{6}$/.test(code));
  check('naziv lige prikazan kao tekst, ne HTML', (await A.textContent('#leagueTitle')) === LEAGUE_NAME
    && (await A.$$('#leagueTitle b')).length === 0);
  await A.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/league-page.png` : 'league-page.png', fullPage: true });

  for (const [page, letter] of [[B, 'b'], [C, 'c']]) {
    await page.goto(`${URL}?liga=${code}`);
    await page.waitForSelector('#loginScreen.active', { timeout: 5000 });
    await fillRegistration(page, letter, stamp);
    await page.waitForSelector('#leagueScreen.active #leagueTitle', { timeout: 8000 });
  }
  check('B je posle registracije preko linka na stranici lige', (await B.textContent('#leagueTitle')) === LEAGUE_NAME);
  await registerFromHome(D, 'd', stamp);

  // --- 2. ligaska soba ---
  await openLeaguePage(A);
  await A.click('#leaguePlayBtn');
  await A.waitForSelector('#roomScreen.active', { timeout: 5000 });
  await A.waitForFunction(() => document.body.classList.contains('league-room'), { timeout: 5000 });
  const roomCode = await A.inputValue('#roomCodeInput');
  check('ligaska soba napravljena', roomCode.length === 5);
  check('u ligaskoj sobi nema "Popuni racunarom"', !(await A.isVisible('#roomStatus .fill-bots-btn')));
  check('u ligaskoj sobi pise ligaska napomena', await A.isVisible('#roomStatus .waiting-league-note'));

  await D.click('[onclick="goToRoomScreen()"]');
  await D.waitForSelector(`#openRoomsList [data-room-code="${roomCode}"]`, { timeout: 8000 });
  const dRow = `#openRoomsList [data-room-code="${roomCode}"]`;
  check('lobi: ligaski sto ima 🏆 oznaku', (await D.textContent(`${dRow} .lobby-league`)).includes('Liga'));
  check('lobi: igrac van lige nema "Sedi"', (await D.$$(`${dRow} .lobby-sit-btn`)).length === 0);
  await D.fill('#roomCodeInput', roomCode);
  await D.click('#roomJoinBtn');
  await D.waitForFunction(() => document.getElementById('roomError').textContent.includes('ligaška'), { timeout: 5000 });
  check('igrac van lige ne moze da sedne ni kodom', true);
  await D.close();
  pagesForDebug = [A, B, C];

  for (const p of [B, C]) {
    await openLeaguePage(p);
    await p.waitForSelector(`#leagueTables [data-room-code="${roomCode}"] .lobby-sit-btn`, { timeout: 5000 });
    await p.click(`#leagueTables [data-room-code="${roomCode}"] .lobby-sit-btn`);
    // treci igrac odmah pokrece partiju, pa ekran sobe moze vec da nestane
    await p.waitForSelector('#leagueScreen:not(.active)', { state: 'attached', timeout: 5000 });
  }
  await A.waitForFunction(() => window.game?.state?.phase && window.game.state.phase !== 'WAITING', { timeout: 8000 });
  check('partija pocela sa tri clana lige', true);

  // --- 3. jedna ruka + dogovor: ne upisuje se ---
  await driveUntil([A, B, C], async () => TERMINAL.includes(await phaseOf(A)));
  await agreeEndMatch(A, [B, C]);
  await A.waitForSelector('#resultMsg .league-result-note', { timeout: 5000 });
  check('posle 1 ruke: "ne ulazi u tabelu lige"', (await A.textContent('#resultMsg .league-result-note')).includes('ne ulazi'));
  // "Podeli rezultat" (share.js): bez sistemskog deljenja slika se preuzima
  const [shot] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#shareResultBtn')]);
  check('Podeli rezultat: slika rezultata', shot.suggestedFilename() === 'preferans-rezultat.png');
  if (process.env.SHOT_DIR) await shot.saveAs(`${process.env.SHOT_DIR}/share.png`);

  // --- 4. revans ostaje ligaski, 10 ruku + dogovor: upisuje se ---
  await A.click('#rematchBtn');
  await A.waitForSelector('#roomScreen.active', { timeout: 5000 });
  for (const p of [B, C]) {
    await p.waitForFunction(() => document.getElementById('rematchBtn').textContent.includes('Prihvati'), { timeout: 5000 });
    await p.click('#rematchBtn');
  }
  await A.waitForFunction(() => window.game?.state?.phase && !['WAITING', 'MATCH_OVER'].includes(window.game.state.phase)
    && window.game.state.round === 1, { timeout: 8000 });
  check('revans je ligaska partija', await A.evaluate(() => window.game.state.league !== null));

  // 10 zavrsenih ruku: kraj 10. ruke, ili vec pocela 11. (npr. "svi dalje")
  const tenHandsDone = async () => {
    const round = await roundOf(A);
    return round >= 11 || (round >= 10 && TERMINAL.includes(await phaseOf(A)));
  };
  const reached = await driveUntil([A, B, C], tenHandsDone, { dealNext: true, maxIters: 6000 });
  check(`odigrano 10 ruku (ruka ${await roundOf(A)}, faza ${await phaseOf(A)})`, reached);
  if ((await phaseOf(A)) !== 'MATCH_OVER') await agreeEndMatch(A, [B, C]);
  await A.waitForSelector('#resultMsg .league-result-note', { timeout: 5000 });
  check('posle 10 ruku: "Upisano u tabelu lige"', (await A.textContent('#resultMsg .league-result-note')).includes('Upisano'));

  await A.click('#nextRoundBtn');
  await openLeaguePage(A);
  const rows = await standings(A);
  console.log('tabela:', JSON.stringify(rows));
  const points = rows.map((r) => Number(r.cells[3]));
  check('tabela: tri clana sa po 1 partijom', rows.length === 3 && rows.every((r) => r.cells[2] === '1'));
  check('tabela: zbir bodova 16 (10+5+1, i kad dele mesta)', Math.abs(points.reduce((s, p) => s + p, 0) - 16) < 0.01);
  check('tabela: zbir ± je 0', Math.abs(rows.map((r) => Number(r.cells[5].replace('−', '-').replace('+', ''))).reduce((s, p) => s + p, 0)) <= 1);
  check('tabela: moj red je istaknut', rows.filter((r) => r.me).length === 1);
  await A.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/league-standings.png` : 'league-standings.png', fullPage: true });

  // --- 5. prozori u stilu igre (dialog.js) umesto confirm/prompt ---
  await A.click('#leagueCopyLinkBtn');
  await A.waitForFunction(() => document.getElementById('leagueCopyLinkBtn').textContent.includes('Kopirano')
    || document.getElementById('appDialog')?.open, { timeout: 3000 });
  if (await A.evaluate(() => document.getElementById('appDialog')?.open)) {
    check('link lige u prozoru kad kopiranje nije dozvoljeno', (await A.inputValue('#appDialogLink')).includes(`?liga=${code}`));
    await A.click('#appDialogOk');
  } else {
    check('link lige kopiran', true);
  }
  const lastRemove = '#leagueMembers .league-member:last-child .mode-btn.danger';
  await A.click(lastRemove);
  await A.waitForSelector('#appDialog[open]', { timeout: 3000 });
  await A.click('#appDialogCancel');
  await A.waitForTimeout(300);
  check('Otkaži ne uklanja igrača', (await A.$$('#leagueMembers .league-member')).length === 3);
  await A.click(lastRemove);
  await A.waitForSelector('#appDialog[open]', { timeout: 3000 });
  await A.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/dialog.png` : 'dialog.png' });
  await A.click('#appDialogOk');
  await A.waitForFunction(() => document.querySelectorAll('#leagueMembers .league-member').length === 2, { timeout: 5000 });
  check('Ukloni u prozoru uklanja igrača', true);

  check('nema JS gresaka u pregledacu', pageErrors.length === 0);
  if (pageErrors.length) console.log(pageErrors);
  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  await dumpPages();
  process.exit(1);
});
