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

**Remote**: push-ovan na https://github.com/antonijek/preferans
**Deploy**: https://pref.antonije.dev (live)

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
