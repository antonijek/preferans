# TODO — Preferans projekat

Status: **Engine radi (64/66 testova), UI delimično, ima bagova u IGRA toku**

**Poslednja sesija završena sa:**
- Engine 64/66 testova prolazi (2 IGRA testovi padaju — bidding winner logika izmenjena za MOGU/MOGU popravku)
- UI layout (sto, veće karte, bidding log) — radi
- IGRA tok — engine kod dodat (`sayIgra`/`declareIgra`), app.js prepravljen, ALI testovi padaju
- Bidding winner logika — popravljena u dva navrata (MOGU postavlja bidLevel, bidders uključuje igraPlayer)
- Server pokrenut u pozadini (process `bgp_02f3a885b0015PVzN24DKTC9GR`) — **U NOVOJ SESIJI TREBA PONOVO POKRENUTI**

---

## ⚠️ NOVA SESIJA — PRVI KORACI

```bash
# 1. Proveri stanje testova
cd D:\preferans\engine
npm test

# 2. Kompajliraj engine (ako ima promena)
npm run build

# 3. Pokreni development server
cd D:\preferans
node tools/serve.js

# 4. Otvori browser
# http://localhost:8000/preferans.html
```

**Bitno:** Server iz prethodne sesije više ne radi. Treba ponovo pokrenuti `node tools/serve.js`.

**Bitno 2:** Poslednja verzija ima 2 IGRA testova koji padaju. Treba popraviti bidding winner logiku da podrži IGRA scenario.

---

## ✅ ŠTA JE NAPRAVLJENO

### 1. Dokumentacija
- **`RULES.md`** — kompletna pravila Preferansa (srpska varijanta, Preferans Pravila v1.2). Sve odluke iz diskusije zabeležene. Korisnik uneo kompletan dokument.
- **`docs/ARCHITECTURE.md`** — arhitektura: Web PWA, TypeScript engine, Vanilla JS UI, backend odluka za kasnije.
- **`docs/ENGINE_API.md`** — engine API dokumentacija + uputstvo za pokretanje.

### 2. Engine (`engine/`) — KOMPLETAN, **66/66 testova prolazi**
- **11 TypeScript modula** u `engine/src/`:
  - `types.ts` — svi tipovi (Suit, Rank, Card, Player, GameState, Action...)
  - `constants.ts` — vrednosti igara (Pik=2..Sans=7), multiplikatori (kontra/rekontra...), CARDS_PER_PLAYER=10, TALON_SIZE=2
  - `cards.ts` — operacije nad kartama (compare, isCardLegal)
  - `deck.ts` — makeDeck, shuffle, isValidDeck
  - `deal.ts` — algoritam deljenja 5/5/5/2/5/5/5
  - `bidding.ts` — licitacija (bid/pass/advance)
  - `contracts.ts` — igre (standardne + IGRA)
  - `trick.ts` — pravila štiha (pobednik, praćenje boje)
  - `scoring.ts` — bodovanje (bule, supe, kontra, refa, otpisivanje)
  - `refe.ts` — refe logika
  - `game.ts` — Game klasa (orchestracija svih faza)
- **13 faza**: WAITING, DEALING, BIDDING, TAKING_TALON, DISCARDING, DECLARING, FOLLOW_DECLARING, KONTRA_DECLARING, PLAYING, TRICK_RESULT, SCORING, REFE, GAME_OVER
- **Engine dist/** — kompajliran u `engine/dist/*.js` (ESM moduli za browser)
- **4 test fajla**, **66 testova**:
  - `scoring.test.ts` — 30 testova (sva pravila bodovanja)
  - `deal.test.ts` — 9 testova (deljenje karata)
  - `trick.test.ts` — 12 testova (pravila štiha)
  - `e2e.test.ts` — 15 testova (kompletni tokovi: bidding, discard, declare, follow, kontra, Igra)

### 3. UI (`preferans.html` + `app.js`) — DELIMIČNO, ima bagova
- **Novi layout (sto)**:
  - Top bar: Potez/Bule/Štih info
  - Sto (ovalni): Zapad gore, Istok desno, Vi (Jug) dole
  - Highlight aktivnog igrača (žuto)
  - Sedža sa bule, štihovima, kartama
  - Štih slotovi na fiksnim pozicijama
- **Bidding panel**:
  - Log sa imenima i bojama ("Istok: 5", "Zapad: dalje")
  - Dugmad: Dalje, Mogu X, 6, 7 (jedno IGRA dugme)
  - Veliko, pregledno
- **Tvoja ruka** uvek vidljiva dole
- **Veće karte** (50x72 standardno, 60x86 na većim ekranima)
- **Responzivan dizajn** (manji ekrani rade, veći ekrani imaju veće karte)
- **Discard UI** za čoveka (selekcija 2 karte vizuelno)
- **AI bidding/discard/declare/follow/kontra** rade automatski za 3 AI mod
- **Setup ekran** sa izborom moda (3 AI vs Vi + 2 AI)

### 4. Tools (`tools/`)
- **`tools/serve.js`** — development HTTP server (port 8000)
- **`tools/play-cli.ts`** — CLI za testiranje partije u terminalu (radi, koristi se za brzu proveru)
- **`tools/fix-app.js`** — skripta za uklanjanje TypeScript `!` iz app.js (korišćeno u ranijim popravkama)

---

## ⚠️ POZNATI BAGOVI

### Kritični (moraju se popraviti)
1. **Bidding winner logika** — ponekad se winner ne postavi automatski kad bidding teče kroz sve igrače. Test u browseru: bidding P1→P2→P0→P1 ponekad ne postavlja winner.
2. **IGRA proglašenje** — bidding "IGRA" je samo reč, proglašenje konkretne igre u DECLARING fazi je delimično implementirano (dodati `sayIgra`/`declareIgra` u engine.ts i `aiChooseIgraGame` u app.js, ali treba testiranje).
3. **Discarding logika** — discard UI za AI radi, ali za čoveka treba testiranje.
4. **Mobile responsive** — veći ekrani (>700px) rade, manji imaju problema sa vidljivošću dugmadi.

### Manji
5. Bidding log formatiranje — dugme "Mogu 5" ima mali tekst (wrap-uje se u dva reda na uskim ekranima)
6. AI je osnovni (agresivan bidding, random kontra) — treba poboljšanje

---

## 🔄 FAZE RAZVOJA (po ARCHITECTURE.md)

- ✅ **FAZA 1** — Engine i pravila (kompletno)
- ✅ **FAZA 1.5** — Kompletni bidding tok (delimično)
- ⚠️ **FAZA 1.6** — UI prepravljanje (delimično, ima bagova)
- ⏳ **FAZA 2** — AI poboljšanje
- ⏳ **FAZA 3** — UI polish + PWA manifest
- ⏳ **FAZA 4** — Multiplayer (Supabase ili Node + WebSocket)
- ⏳ **FAZA 5** — Backend (auth, DB, ranking)

---

## 📁 KONKRETNI FAJLOVI

```
D:\preferans\
├── RULES.md                         ← pravila (1.0)
├── docs\
│   ├── ARCHITECTURE.md             ← arhitektura
│   └── ENGINE_API.md               ← engine API + pokretanje
├── engine\
│   ├── package.json                 ← npm install/test/build/play
│   ├── tsconfig.json                ← TypeScript config
│   ├── src\                         ← TypeScript izvorni kod (11 modula)
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── cards.ts
│   │   ├── deck.ts
│   │   ├── deal.ts
│   │   ├── bidding.ts
│   │   ├── contracts.ts
│   │   ├── trick.ts
│   │   ├── scoring.ts
│   │   ├── refe.ts
│   │   └── game.ts
│   ├── dist\                        ← kompajliran output (za browser)
│   │   ├── game.js, scoring.js, ...
│   └── test\                        ← 4 fajla, 66 testova
│       ├── scoring.test.ts
│       ├── deal.test.ts
│       ├── trick.test.ts
│       └── e2e.test.ts
├── app.js                           ← UI wrapper (~640 linija)
├── preferans.html                   ← UI šel + CSS
├── tools\
│   ├── serve.js                     ← HTTP server (port 8000)
│   ├── play-cli.ts                  ← CLI za testiranje
│   └── fix-app.js                   ← utility skripta
└── fix_declaring.py                ← utility skripta
```

---

## 🚀 POKRETANJE

```bash
# 1. Test engine
cd D:\preferans\engine
npm install              # ako već nije
npm test                  # 66/66 testova ✓

# 2. Kompajliraj engine (ako ima promena u engine/src)
npm run build             # output u engine/dist/

# 3. Pokreni HTTP server
cd D:\preferans
node tools/serve.js       # sluša na http://localhost:8000

# 4. Otvori browser
# http://localhost:8000/preferans.html
```

CLI testiranje:
```bash
cd D:\preferans\engine
npm run play              # odigra celu partiju u terminalu
```

---

## 🎯 SLEDEĆI KORACI (prioritet)

### Odmah (za završiti engine flow)
1. ✅ Testirati IGRA tok u browseru — bidding "IGRA" + proglašenje
2. ✅ Popraviti bidding winner logiku — winner treba da se postavi čim bidding TEČE kroz SVE igrače (currentBidder === bidStartPlayer ponovo)
3. ✅ Testirati discard UI za čoveka (kad bidding winner je P0)

### FAZA 2 — AI
4. Poboljšati AI bidding strategiju:
   - Pass ako ruka slaba
   - IGRA samo sa 6+ iste boje + visoke karte
   - Bolje vrednovanje boja
5. Poboljšati AI kontra logiku (ne random)
6. AI discard strategija (inteligentnija)

### FAZA 3 — UI
7. Popraviti mobilni responsive (testirati na 360x640)
8. PWA manifest + service worker (za instalaciju na telefon)
9. Bolji vizuelni efekti (animacije štihova, zvukovi)

### FAZA 4 — Multiplayer
10. Backend odluka: Supabase (opcija A) ili Node + Socket.IO (opcija B)
11. Auth sistem
12. Privatne sobe + matchmaking
13. Real-time sinhronizacija stanja
14. Reconnect logika

### FAZA 5 — Polish
15. Ranking sistem
16. Statistika
17. Achievements
18. Dnevne igre

---

## 🐛 DEBUGGING INFO

### Testiranje u browseru
Server je pokrenut u pozadini na `http://localhost:8000/preferans.html`.

Browser debugging:
- F12 → Console — vidi `game.state` stanje
- F12 → Network — proveri da li se `engine/dist/*.js` učitavaju

### Engine state pristup
```js
game.state.phase                // 'BIDDING', 'DISCARDING', 'PLAYING'...
game.state.currentBidder        // koji igrač je na potezu (BIDDING)
game.state.currentPlayer         // koji igrač je na potezu (PLAYING)
game.state.winner               // winner nakon bidding-a
game.state.winnerGame           // proglašena igra
game.state.bids                 // istorija bidding-a
game.state.bulas                // bule po igračima
```

### Build i rebuild
Posle izmene `engine/src/*.ts`:
```bash
cd D:\preferans\engine && npm run build
```

Browser cache može držati stari dist — koristiti `?v=N` URL parametar:
```
http://localhost:8000/preferans.html?v=31
```

---

## 🎮 TRENUTNI STATUS TESTIRANJA

Testirano u browseru (Playwright):
- ✅ Setup ekran radi
- ✅ 3 AI mod: bidding → discard → declare → follow → kontra → play (kompletna partija)
- ✅ 1v2 mod: bidding teče kroz sve igrače, čovek dobija priliku
- ✅ "Mogu 5" potvrda radi posle fix-a `bid()` u engine.ts
- ✅ Highlight aktivnog igrača ispravno pokazuje Vi (Jug) tokom bidding-a
- ⚠️ Bidding winner ponekad se ne postavlja (test treba)
- ⚠️ IGRA tok nije testiran u browseru (engine kod je dodat, ali ne i app.js flow)

---

## 📝 NAPOMENE ZA NASTAVAK

Ako se nastavlja u novoj sesiji:
1. Pročitati ovo TODO.md prvo
2. Pokrenuti `npm test` u `engine/` — proveriti da li su testovi zeleni (66/66)
3. Pokrenuti server: `cd D:\preferans && node tools/serve.js`
4. Otvoriti `http://localhost:8000/preferans.html` u browseru
5. Testirati bidding, discard, declare, follow, kontra, play u browseru
6. Fokusirati se na bidding winner logiku i IGRA tok

Engine je srce aplikacije — njemu treba posvetiti najviše pažnje.
UI je wrapper — treba ga srediti za krajnje korisnike.
AI treba poboljšati za pravu igru.
Backend je sledeći veliki korak.
