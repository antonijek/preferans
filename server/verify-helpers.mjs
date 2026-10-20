// Zajednicko za verify-*.mjs skripte koje igraju online partiju u
// pregledacu (verify-leagues, verify-replay): registracija, odigravanje
// ruku i dogovoren kraj partije. Server: DB_PATH=<sveza> PORT=3001.

export const URL = 'http://localhost:3001/';

export function makeChecker() {
  const state = { failed: false };
  const check = (label, condition) => {
    console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
    if (!condition) state.failed = true;
  };
  return { check, state };
}

export async function fillRegistration(page, name, email) {
  await page.fill('#loginName', name);
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', 'test1234');
  await page.click('#loginScreen [onclick="doRegister()"]');
}

export async function registerFromHome(page, name, email) {
  await page.goto(URL);
  await page.click('[onclick="goOnline()"]');
  await fillRegistration(page, name, email);
  await page.waitForSelector('#homeScreen.active', { timeout: 5000 });
}

export const phaseOf = (page) => page.evaluate(() => window.game?.state?.phase ?? null);
export const roundOf = (page) => page.evaluate(() => window.game?.state?.round ?? 0);
export const TERMINAL = ['GAME_OVER', 'REFE', 'MATCH_OVER'];

// Svako odigra prvu legalnu stvar. U svakoj ruci prvi na potezu licitira,
// ostali kazu "dalje" — kad svi kazu "dalje", server deli ponovo u ISTOJ
// ruci (round se ne menja), pa bez licitacije ruke nikad ne bi isle dalje.
export async function tryAct(page, { dealNext }) {
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

export async function dumpPages(pages) {
  for (const [i, p] of pages.entries()) {
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
}

export async function driveUntil(pages, predicate, { maxIters = 3000, dealNext = false } = {}) {
  let lastKey = null;
  let still = 0;
  for (let i = 0; i < maxIters; i++) {
    if (await predicate()) return true;
    const key = await progressKey(pages[0]);
    still = key === lastKey ? still + 1 : 0;
    lastKey = key;
    if (still >= 150) {
      console.log(`  ZASTOJ: stanje se ne menja (${key})`);
      await dumpPages(pages);
      return false;
    }
    // stanje se moze promeniti izmedju provere i klika — sledeci krug pokusava ponovo
    for (const p of pages) await tryAct(p, { dealNext }).catch((e) => e);
    await pages[0].waitForTimeout(120);
  }
  return false;
}

export async function agreeEndMatch(proposer, others) {
  await proposer.click('#matchMenuBtn');
  await proposer.click('#matchMenuPanel [onclick*="proposeEndMatch"]');
  await proposer.click('#endMatchBanners .end-match-actions .bid-btn.primary');
  for (const p of others) {
    await p.waitForSelector('#endMatchBanners .end-match-actions .bid-btn.primary', { timeout: 5000 });
    await p.click('#endMatchBanners .end-match-actions .bid-btn.primary');
  }
  await proposer.waitForFunction(() => window.game?.state?.phase === 'MATCH_OVER', { timeout: 8000 });
}
