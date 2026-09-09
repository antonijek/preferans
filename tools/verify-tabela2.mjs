import { chromium } from 'playwright';
const browser = await chromium.launch();

// Desktop check - contrast
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://pref.antonije.dev/');
await page.waitForTimeout(500);
await page.evaluate(() => { document.getElementById('setupScreen')?.classList.add('active'); });
await page.waitForTimeout(200);
let startBtn = await page.$('button[onclick*="startGame"]');
if (startBtn) await startBtn.click();
await page.waitForTimeout(600);
await page.evaluate(() => window.toggleScore && window.toggleScore());
await page.waitForTimeout(300);
await page.screenshot({ path: 'tools/tabela-after-desktop.png' });
const bg = await page.$eval('.score-box', el => getComputedStyle(el).backgroundImage);
console.log('score-box background:', bg);
await page.close();

// Mobile check - width
const mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mpage.goto('https://pref.antonije.dev/');
await mpage.waitForTimeout(500);
await mpage.evaluate(() => { document.getElementById('setupScreen')?.classList.add('active'); });
await mpage.waitForTimeout(200);
startBtn = await mpage.$('button[onclick*="startGame"]');
if (startBtn) await startBtn.click();
await mpage.waitForTimeout(600);
await mpage.evaluate(() => window.toggleScore && window.toggleScore());
await mpage.waitForTimeout(300);
await mpage.screenshot({ path: 'tools/tabela-after-mobile.png' });
const bbox = await mpage.$eval('.score-box', el => el.getBoundingClientRect());
console.log('mobile score-box width:', bbox.width, 'viewport 390');
await browser.close();
