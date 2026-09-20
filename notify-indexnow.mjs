// Rucno pokretati posle svakog deploy-a koji menja sadrzaj HTML stranica
// (korisnikov zahtev 2026-09-20 — "sto ce Bing/Yandex cekati da sami
// dodju kad mogu odmah da se obaveste"). IndexNow je zajednicki protokol
// (Bing, Yandex — Google ga NE podrzava, za njega i dalje vazi rucni
// "Request Indexing" u Search Console).
// Pokretanje: node notify-indexnow.mjs
const HOST = 'pref.antonije.dev';
const KEY = '2bfa4c3bef17eecb0ce409b49ad9f9a1';
const urls = [
  `https://${HOST}/`,
  `https://${HOST}/pravila.html`,
];

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urls,
  }),
});
console.log('IndexNow status:', res.status, res.statusText);
if (res.status >= 400) console.log(await res.text().catch(() => ''));
