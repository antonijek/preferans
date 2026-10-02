// Javi Bing-u, Yandex-u i ostalima (IndexNow) da su stranice Preferansa
// promenjene, da ne čekaju da same dođu. Google IndexNow ne koristi — za
// njega važi sitemap.xml i "Request indexing" u Google Search Console.
// Pokretanje posle deploy-a koji menja tekst stranica: npm run indexnow
// Ključ je u server/src/seo.ts i server ga pokazuje na /<ključ>.txt.
// Isti obrazac kao D:\lora\tools\notify-indexnow.mjs.

const HOST = 'preferans.igrajmo.online';
const KEY = '0e1224fd04629909710006e9618b66ba';
const urls = [`https://${HOST}/`, `https://${HOST}/pravila.html`];

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log('IndexNow:', res.status, res.statusText, '(200/202 = primljeno)');
if (res.status >= 400) console.log(await res.text().catch(() => ''));
