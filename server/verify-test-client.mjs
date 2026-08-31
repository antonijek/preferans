import { chromium } from 'playwright';

const URL = 'http://localhost:3001/test-client.html';
let failed = false;

function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const pageC = await ctxC.newPage();

  const consoleErrors = [];
  for (const p of [pageA, pageB, pageC]) {
    p.on('pageerror', (e) => consoleErrors.push(e.message));
  }

  await Promise.all([pageA.goto(URL), pageB.goto(URL), pageC.goto(URL)]);

  async function registerAs(page, letter) {
    await page.fill('#email', `${letter}-${stamp}@test.com`);
    await page.fill('#password', 'test1234');
    await page.click('text=Registruj');
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Povezan'), { timeout: 5000 });
  }

  await registerAs(pageA, 'a');
  await registerAs(pageB, 'b');
  await registerAs(pageC, 'c');
  check('all 3 pages show "Povezan" status after register', true);

  await pageA.click('text=Napravi sobu');
  await pageA.waitForFunction(() => document.getElementById('joinCode').value.length > 0, { timeout: 5000 });
  const code = await pageA.inputValue('#joinCode');
  check('room code generated and visible in UI', code.length === 5);

  await pageB.fill('#joinCode', code);
  await pageB.click('text=Pridruži se (igrač)');
  await pageC.fill('#joinCode', code);
  await pageC.click('text=Pridruži se (igrač)');

  await pageA.waitForFunction(() => {
    const el = document.getElementById('state');
    return el.textContent.includes('"phase"') && !el.textContent.includes('"WAITING"');
  }, { timeout: 5000 });

  const stateTextA = await pageA.textContent('#state');
  check('game auto-started after 3rd join (visible in state pane)', !stateTextA.includes('"WAITING"'));

  const stateTextB = await pageB.textContent('#state');
  check('player B also sees non-WAITING state', !stateTextB.includes('"WAITING"'));

  console.log('\n--- chat test ---');
  await pageA.fill('#chatText', 'zdravo iz test-client');
  await pageA.click('#chatBox >> text=Pošalji');
  await pageB.waitForFunction(() => document.getElementById('chatLog').textContent.includes('zdravo iz test-client'), { timeout: 5000 });
  check('chat message from A visible in B\'s chat log', true);

  check('no uncaught JS errors on any page', consoleErrors.length === 0);
  if (consoleErrors.length) console.log('Console errors:', consoleErrors);

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
