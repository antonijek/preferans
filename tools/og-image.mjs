// Slika za pregled linka (Viber, WhatsApp, Facebook, Google): icons/og-image.jpg, 1200×630.
// Pokretanje: node tools/og-image.mjs
// Isti obrazac kao D:\lora\tools\og-image.mjs, boje/stil preuzeti sa naseg
// stvarnog stola (preferans.css .table-felt).

import { chromium } from 'playwright';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// karte ugradjene direktno (setContent stranica ne sme da cita fajlove sa diska)
const card = id => 'data:image/svg+xml;base64,' + readFileSync(path.resolve(`icons/cards/${id}.svg`)).toString('base64');
const fan = ['JH', 'QS', 'KD', 'AC'];

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; font-family: 'Segoe UI', system-ui, sans-serif; color: #f0ead6;
    background: radial-gradient(ellipse at 30% 40%, #177245 0%, #0e4d2e 70%, #0a3a23 100%);
    border: 18px solid #6b4424; box-shadow: inset 0 0 0 4px #4a2e17, inset 0 0 80px rgba(0,0,0,.45);
    display: flex; align-items: center; padding: 0 70px; overflow: hidden; position: relative; }
  .text { flex: 1; z-index: 2; max-width: 650px; }
  h1 { font-size: 104px; line-height: 1; color: #ffd54f; letter-spacing: .01em; text-shadow: 0 4px 10px rgba(0,0,0,.35); }
  h1 span { display: block; font-size: 44px; color: #f0ead6; font-weight: 600; margin-top: 6px; }
  p { font-size: 30px; margin-top: 20px; line-height: 1.35; color: #e6efe9; max-width: 540px; }
  .tags { display: flex; gap: 12px; margin-top: 28px; }
  .tags b { font-size: 21px; padding: 8px 16px; border-radius: 999px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,213,79,.3); font-weight: 600; }
  .url { position: absolute; left: 70px; bottom: 34px; font-size: 24px; color: #b8cbbf; }
  .fan { position: relative; width: 380px; height: 440px; flex-shrink: 0; margin-left: 20px; }
  .fan img { position: absolute; width: 200px; left: 90px; top: 50px; border-radius: 14px; box-shadow: -6px 10px 24px rgba(0,0,0,.45); transform-origin: 50% 120%; }
</style></head><body>
  <div class="text">
    <h1>Preferans<span>online</span></h1>
    <p>Balkanski preferans — licitacija, refe, kontra, Betl i Sans. Igraj sa drugarima ili protiv AI-ja.</p>
    <div class="tags"><b>Online sobe</b><b>Betl &amp; Sans</b><b>AI protivnici</b></div>
  </div>
  <div class="fan">${fan.map((id, i) => `<img src="${card(id)}" style="transform: rotate(${(i - 1.5) * 14}deg)">`).join('')}</div>
  <div class="url">preferans.igrajmo.online</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
// JPG: WhatsApp ne prikazuje pregled sa slikom vecom od ~300 KB
await page.screenshot({ path: 'icons/og-image.jpg', type: 'jpeg', quality: 86 });
await browser.close();
console.log('icons/og-image.jpg');
