import { chromium } from 'playwright';

const URL = 'http://localhost:3001/';
let failed = false;
function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

const adminEmail = process.argv[2];
const regularEmail = process.argv[3];

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();

  await page.goto(URL + 'admin.html');
  await page.fill('#email', adminEmail);
  await page.fill('#password', 'test1234');
  await page.click('text=Uloguj se');
  await page.waitForSelector('#adminBox', { state: 'visible', timeout: 5000 });
  check('admin login succeeded, admin panel visible', true);

  const usersText = await page.textContent('#usersBody');
  console.log('users table contains regular test account:', usersText.includes(regularEmail));
  check('users table lists the regular test account', usersText.includes(regularEmail));
  check('users table lists the admin account too', usersText.includes(adminEmail));

  console.log('--- non-admin gets rejected ---');
  const page2 = await (await browser.newContext()).newPage();
  await page2.goto(URL + 'admin.html');
  await page2.fill('#email', regularEmail);
  await page2.fill('#password', 'test1234');
  await page2.click('text=Uloguj se');
  await page2.waitForTimeout(800);
  const adminBoxVisible = await page2.isVisible('#adminBox');
  const errText = await page2.textContent('#loginErr');
  console.log('non-admin login error:', errText);
  check('non-admin does NOT see the admin panel', !adminBoxVisible);
  check('non-admin sees an access-denied message', errText.length > 0);

  console.log('--- credit adjustment ---');
  page.once('dialog', (d) => d.accept('test top-up'));
  const rows = page.locator('#usersBody tr');
  const rowCount = await rows.count();
  let targetRow = null;
  for (let i = 0; i < rowCount; i++) {
    const t = await rows.nth(i).textContent();
    if (t.includes(regularEmail)) { targetRow = rows.nth(i); break; }
  }
  check('found the regular account row to adjust credits on', targetRow !== null);
  await targetRow.locator('input[type="number"]').fill('75');
  await targetRow.locator('button:has-text("Primeni kredit")').click();
  await page.waitForTimeout(500);
  const usersTextAfter = await page.textContent('#usersBody');
  check('credits column shows 75 after the adjustment', /75/.test(usersTextAfter));

  await browser.close();
  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
