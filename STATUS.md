# ⚡ NAPOMENA ZA NOVU SESIJU — 2026-09-11

> **Ovo je JEDINI dokument koji treba pročitati na početku nove sesije.**
> Sve ostalo (TODO.md, RULES.md, REFERENTNI_PRIMERI.md, IPREF_BIDDING_ANALIZA.md, docs/) je kontekst.

---

## 1. SIGURNA TAČKA — v0.9.0-multiplayer-baseline

Kreiran **annotated tag** sa detaljnim opisom pre početka nove sesije.

```bash
cd D:\preferans
git fetch --tags
git tag -l                                # vidi: v0.9.0-multiplayer-baseline
git show v0.9.0-multiplayer-baseline     # vidi opis
```

**Vraćanje na sigurnu tačku** (samo ako nešto krene naopako):
```bash
git checkout v0.9.0-multiplayer-baseline    # detached, za pregled
# ili trajno:
git checkout main
git reset --hard v0.9.0-multiplayer-baseline
```

**Lokalni backup** (zip bez node_modules):
```
C:\Users\mb-com\.local\share\kilo\tool-output\preferans-v0.9.0-baseline.zip
```
1.8 MB, sadrži ceo repo (bez node_modules, bez dist).

**Server backup** (napravljen 2026-09-11 pre pokušaja deploya):
- Lokacija: `/var/www/preferans.backup-prematchlog` (na serveru)
- Sadrži celu `/var/www/preferans` strukturu pre izmena za istoriju partija

**Restore sa server backupa**:
```bash
ssh root@antonije.dev "rm -rf /var/www/preferans && cp -r /var/www/preferans.backup-prematchlog /var/www/preferans && pm2 restart pref-server"
```

**Remote**: push-ovan na https://github.com/antonijek/preferans
**Deploy**: https://pref.antonije.dev (live)

---

## DEPLOY PROBLEM — 2026-09-11 (za narednog agenta)

**Simptom**: Kolega pokušao deploy novog koda (admin/matches istorija partija). Svi fajlovi uspešno upload-ovani, ali `npm run build` na serveru pada sa 10+ TS grešaka. Isti kod **lokalno radi** (0 grešaka).

**Verovatni uzrok**: Razlika u Node verziji
- Lokalno: **Node 24.18.0**, npm 11.16
- Server: **Node 20.20.2**, npm 10.8

TypeScript 5.9.3 + `moduleResolution: "Bundler"` + `noImplicitAny: true` se **drugačije ponaša** na Node 20 — TS ne vidi module import sa `.js` ekstenzijom iako fajlovi postoje (npr. `db.ts` na serveru postoji, ali TS kaže "Cannot find module '../db.js'").

**Šta je pokušano** (sve bezuspešno):
1. Upload starih fajlova — iste greške
2. `noImplicitAny: false` — smanjilo sa 43 na 10 grešaka ali ne rešava "Cannot find module"
3. `moduleResolution: "Node"` umesto "Bundler" — iste greške

**Šta trenutno radi na serveru** (nakon povratka):
- ✅ Server je na **staroj verziji** (`v0.9.0-multiplayer-baseline`) — sajt normalan za korisnike
- ❌ Novi fajlovi (db.ts, roomEvents.ts, routes.ts, itd.) vraćeni na stare iz backupa
- ❌ `tsconfig.json` vraćen na original (sa `noImplicitAny: true`, `moduleResolution: "Bundler"`)
- 💾 Lokalno (kod korisnika): sve izmene sačuvane, build prolazi, 212/212 testova

**Rešenje za budućnost** (hipoteze):
- **A**: Nadograditi server na Node 24 (preporučeno ali zahteva akciju)
- **B**: Lokalno prilagoditi kod da radi na oba Node-a (npr. ukloniti `.js` iz importa, ili preći na CJS)
- **C**: Drugi agent verovatno ima već rešen ovaj problem — pogledaj njegov `tsconfig.json` ili skripte za deploy

**HITAN FIX — 2026-09-11 14:57** (server je bio 502):
- Simptom: nginx 502, PM2 "online" ali HTTP 000
- Uzrok: `dist/` na serveru je bio parcijalan (samo 5 fajlova) jer build nije uspeo. PM2 pokrenuo ali bez `db.js`, `index.js`, `auth/*` itd.
- Fix: `cp -r /var/www/preferans.backup-prematchlog/server/dist /var/www/preferans/server/dist && pm2 restart pref-server`
- Posle: HTTP 200, sajt radi
- **LEKCIJA**: nikad ne restartuj server ako build nije uspeo — uvek proveri `ls server/dist/ | wc -l` (mora biti ~9, ne 5)

**Lokalno kod korisnika** radi normalno (Node 24). Ako deploy nije kritičan, izmene mogu da čekaju dok se ne reši Node razlika.

---

## 🆕 NOVI PROJEKAT — "Reč Dana" (Wordle na srpskom)

**Status**: 2026-09-11, napravljen u `C:\Users\mb-com\AppData\Local\Temp\kilo\wordle` (temp, treba prebaciti na trajnu lokaciju).

**Šta**: Web Wordle za srpsko tržište — dnevna srpska reč (5 slova, 6 pokušaja, boje kao Wordle), random mode, statistika, share button.

**Fajlovi**:
- `index.html` — UI shell
- `style.css` — dizajn (tamna zelena, zlatna)
- `app.js` — frontend logika (DOM, tastatura, modali)
- `src/engine.js` — game engine (checkGuess, submitGuess, daily word)
- `src/words.js` — 300+ srpskih reči (gradovi, države, životinje, hrana, predmeti...)

**Zašto**: Korisnik shvatio da Preferans nema dovoljno veliko tržište za zaradu — Wordle na srpskom je 2-3 nedelje posla, viralni potencijal, malo konkurencije.

**Deploy plan**: Vercel (besplatan), domen `rec-dana.rs` ili sličan.

**Marketing**: Reddit (r/serbia), TikTok/Reels "rešavam srpski Wordle", Twitter dnevni post.

**Monetizacija**: Google AdSense + Premium 2 EUR/mes.

**Sledeći korak**: Korisnik da otvori `index.html` lokalno, testira, pa deploy na Vercel.

---

## 2. STANJE PROJEKTA (šta radi, šta ne radi)

### ✅ RADI (testirano, 212/212 testova)
- **Engine** (TypeScript, 3.530 linija, 13 modula) — sva Preferans pravila
  - Licitacija (2-7 + IGRA), bidding postepeno (samo currentBid+1), "Mogu X" pravilo
  - Kontra/Rekontra/Subkontra/Mortkontra sa redosledom "desni od nosioca"
  - IGRA tiebreak (jača pobeđuje)
  - Follow: DODJEM/NE_DODJEM, call/alone, "niko ne prati" (nosilac dobija 10)
  - "Pik bez kontre" (RULES 7.1.1): 3 grane (refe/bez refe/šešir)
  - Bodovanje (Betl/Sans/standard), supe, refe množilac
- **AI** (`ai.ts` 794 linije) — bidding/follow/kontra/discard/play heuristike
  - **Kalibrisano uzivo sa korisnikom 30+ ruku** (formule dokumentovane u `ai.ts` komentarima "korisnikov zahtev, uzivo potvrdjeno 2026-09-06/07")
  - **Monte Carlo determinizacija** (`aiSearch.ts` 327 linija) — za BIDDING/DECLARING/FOLLOW/KONTRA iza `searchAiEnabled()` prekidača
  - AI igranje karte (choosePlayCard) — samo heuristike, NE Monte Carlo (TODO linija 197-205)
- **UI** (`app.js` 2.939 + `preferans.html` 1.939) — drvo/zlato dizajn, 3 sedenja, sound, animacije
  - Discard UI za čoveka (selekcija 2 karte vizuelno)
  - Half-split dugmad za izbor igre
  - Home page, Soba, Tabela, Login — prave stranice (ne modal)
  - Mobile/landscape/desktop responsive
  - "Pogledaj karte" privatno, disconnect obaveštenja
- **Online multiplayer** (`server/` 1.555 linija TS) — Express + Socket.IO + sql.js
  - JWT auth (registracija, login, logout)
  - Sobe (kreiranje, pridruživanje, lista, presence, lock)
  - Kibicovanje sa odobrenjem
  - Chat u sobi
  - Reconnect (pagehide/visibilitychange)
  - ELO rejting (persistent u bazi)
  - Admin panel (users + rooms)
  - "Predlog za kraj" voting
  - "Napusti partiju" sa AI preuzimanjem
- **PWA** (manifest.json + sw.js) — instalira se kao app
- **Dokumentacija**:
  - `RULES.md` (553 linije) — kompletna pravila
  - `REFERENTNI_PRIMERI.md` (506 linija, 15 primera) — reprodukuje se tačno
  - `docs/ARCHITECTURE.md` + `docs/ENGINE_API.md` — struktura
  - `IPREF_BIDDING_ANALIZA.md` (614 linija) — analiza EXE stringova originalnog IPREF (koristan za nijanse)
- **Alati** (`tools/`):
  - `serve.js` — development HTTP server (port 8000)
  - `browser-smoke-test.mjs` — Playwright 1 partija
  - `multi-smoke.mjs` — Playwright N partija (hvata seed-zavisne zastoje)
  - `visual-check.mjs` — screenshotovi
  - `play-cli.ts` — CLI partija u terminalu
  - `reproduce-trainer-hand.mjs`, `bid-trainer.html` — kalibracija

### ⚠️ OTVORENO (TODO.md linije 85-110)
1. **Tabela ne prikazuje ko je došao/koliko uhvatio na stvarno odigranoj ruci**
   - Korisnik: "došao sam na tref, uzeo 4 štiha, tabela prazna"
   - Dijagnostika: privremeni `console.log('[TABELA DEBUG]', ...)` u `recordHandIfNew()` (app.js)
2. **Pozivnica (room:invite) možda ne stiže pozvanom**
   - Server DOKAZANO šalje pravom socketu (`[INVITE DEBUG] foundSockets=1`)
   - Klijent (`onlineSocket.on('room:invited', ...)` → `showInviteBanner`) izgleda ispravno
   - Moguće: zombi socket (mrtav ali registrovan u presence.ts)
3. **Sans "pogrešan prvi igrač"** — korisnik: "juče je radilo, danas ne"
   - Engine kod (`getFirstPlayer()`, `(winner+2)%3` za Sans) NEPROMENJEN od 2026-09-05
   - Najverovatnije vizuelna zabuna zbog `seatOf()` rotacije (svako vidi sebe dole)
   - Treba TAČAN primer za potvrdu
4. **AI igranje karte** — `choosePlayCard` nije kalibrisano Monte Carlo metodom
   - Korisnik dao konvenciju "vodi singleton vanadutsku boju" — NIJE ugrađena
5. **Refa množilac (RULES 7.3)** — `state.refeUsed` se ne postavlja, samo placeholder
6. **Istorija partija (kad je korisnik pitao 2026-09-11)** — nema tabele u bazi za gotove partije, ne mogu da se gledaju stare partije. Dodati: `hand_log` tabela (id, room_code, started_at, ended_at, players, winner, final_bulas, hands_json), INSERT posle kraja partije, GET endpoint + UI za pregled. **Procenjeno opterećenje baze**: ~5 KB po partiji × 50 korisnika × 3 partije = ~750 KB/dan, nema veze — minimalan uticaj. **Status 2026-09-11: ✅ IMPLEMENTIRANO** (db.ts + roomEvents.ts + admin.html + matches.html) — ali **NIJE DEPLOY-OVANO** zbog Node razlike (vidi dole). Lokalno radi, čeka deploy rešenje.

### 🔧 MANJE BITNO (radi, ali nije idealno)
- 6 `console.log` debug-ova u serveru (`server/src/socket/roomEvents.ts`)
- README.md, ENGINE_API.md zastareli (kažu 66 testova, sad 212; kažu "backend ❌", sad ✅)
- app.js je 2.939 linija — preveliko, treba modularizacija
- TODO.md je 845 linija — treba STATUS/HISTORY/CHANGELOG podelu

---

## 3. KOMANDA ZA POKRETANJE

```bash
# 1. Testovi
cd D:\preferans\engine
npm test                    # očekivano: 212/212

# 2. Build (ako ima promena u engine/src)
npm run build

# 3. UI server (offline)
cd ..
node tools/serve.js         # http://localhost:8000/preferans.html

# 4. Online server (drugi terminal)
cd D:\preferans\server
npm install                  # jednom
npm run build
npm start                    # http://localhost:3001
```

URL-ovi:
- **Offline UI**: http://localhost:8000/preferans.html
- **Online UI**: http://localhost:3001/preferans.html (preko servera, isti HTML)
- **Test klijent**: http://localhost:3001/test-client.html
- **Deploy**: https://pref.antonije.dev

---

## 4. STRUKTURA PROJEKTA

```
D:\preferans\
├── STATUS.md                ← OVAJ FAJL (pročitaj prvo)
├── TODO.md                  ← 845 linija istorije (ne čitaj od početka)
├── RULES.md                 ← 553 linije pravila
├── REFERENTNI_PRIMERI.md    ← 506 linija, 15 primera
├── IPREF_BIDDING_ANALIZA.md ← 614 linija, analiza EXE
├── README.md                ← zastareo, treba ažurirati
├── docs\
│   ├── ARCHITECTURE.md      ← 218 linija
│   └── ENGINE_API.md        ← zastareo, treba ažurirati
├── engine\                  ← TypeScript (srce igre)
│   ├── src\                 ← 3.530 linija, 13 modula
│   ├── test\                ← 3.929 linija, 12 fajlova, 212 testova
│   └── tools\               ← 6 alata za testiranje
├── server\                  ← Online multiplayer (Express + Socket.IO + sql.js)
│   ├── src\                 ← 1.555 linija, 14 fajlova
│   └── dist\                ← kompajliran output
├── app.js                   ← 2.939 linija UI (vanilla JS)
├── preferans.html           ← 1.939 linija UI shell + CSS
├── manifest.json            ← PWA manifest
├── sw.js                    ← Service Worker
├── icons\                   ← PWA ikone
└── tools\                   ← development alati
```

---

## 5. POSLEDNJA POZNATA STANJA (pre sigurne tačke)

- **Last commit**: `158ae41` Fix: force game.state.phase = WAITING when leaving result screen
- **Last tag**: `v0.9.0-multiplayer-baseline` (push-ovan)
- **Last deploy**: 2026-09-08 (visual pravac "klasična kockarnica")
- **Last test run**: 212/212 ✓ (engine), Playwright 0 page-error-a (visual)

---

## 6. PREPORUČENI REDOSLED ZA NOVU SESIJU

1. **Pročitaj OVAJ fajl** (STATUS.md) — gotov si za 3 min
2. **Proveri testove** — `cd engine && npm test` (očekivano 212/212)
3. **Pitaj korisnika** šta hoće da radi:
   - Brzi pobedi (1-2 sata): README ažuriranje, console.log čišćenje, STATUS podela TODO-a
   - Srednji (3-5 sati): 3 otvorena baga (tabela, invite, Sans)
   - AI poboljšanja: kalibracija choosePlayCard, refe množilac mehanika
   - Modularizacija app.js (dugoročno)
4. **Ako sumnjaš da je nešto pokvareno** — vrati se na `v0.9.0-multiplayer-baseline`

---

## 7. BITNE KONVENCIJE I ŽARGON (korisnik specifično)

- **"DODJEM"** = "dolazim, hoću da igram sa nosiocem"
- **"NE_DODJEM"** = "ne dolazim" (taj igrač sedi)
- **"MOGU X"** = "potvrđujem bidding X" (samo ako je već biddovao u ovoj ruci)
- **"Zovem"** = caller poziva NE_DODJEM igrača kao sparing
- **"Kontra/Rekontra/Subkontra/Mortkontra"** = ×2, ×4, ×8, ×16 množilac
- **"Refa"** = svi kažu dalje, svi dobijaju refu
- **"Šešir"** = bule < 0 (igrač u minusu)
- **"Pik bez kontre"** = specijalno pravilo (vidi RULES 7.1.1)

Pozicije:
- **Jug** = south = P0 = "Vi" u 1v2 modu
- **Istok** = east = P1
- **Zapad** = west = P2

Smer igranja: **suprotno kazaljke na satu** (R1 → R2 → R3)
- Deljenje: P1 → P2 → P3
- Licitacija: P1 → P2 → P3 (krugovi)
- Štih: prvi bidding-ovao ili levo od nosioca (Sans)

---

**KRAJ NAPOMENE.** Srećno! 🎮
