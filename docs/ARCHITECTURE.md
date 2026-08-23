# PREFERANS — Arhitektura

Verzija: 1.0

Ovaj dokument definiše **arhitekturu celokupne aplikacije**. Kada se donese odluka o nečemu na ovom nivou, dokument se ažurira.

---

# 1. PRINCIPI

## 1.1 Engine je nezavisan

`engine/` modul **ne sme** da zna ništa o:
- HTML-u / DOM-u / browseru
- localStorage / IndexedDB
- WebSocket-u / Supabase / bilo kom backend-u
- React-u / bilo kom UI framework-u

Engine zna samo: **kako se igra Preferans**.

Engine API (pojednostavljeno):
```ts
game.start()                        // počni novu partiju
game.bid(player, bid)               // licitiraj
game.pass(player)                   // "dalje"
game.declareGame(player, game)      // proglaši igru
game.follow(player, follow)         // "Dodjem"/"Ne dodjem"
game.kontra(player, level)          // kontra/rekontra/sub/mort
game.discard(player, cardIds)       // odbaci 2 karte (ako je pobedio normalno)
game.playCard(player, cardId)       // odigraj kartu
game.getState()                     // čitaj trenutno stanje
```

## 1.2 UI je tanak

UI (`ui/`):
- Čita `engine.getState()` i prikazuje
- Šalje akcije nazad u engine
- **Nikada** ne drži poslovnu logiku
- **Nikada** ne radi bodovanje, validaciju, AI

## 1.3 AI je odvojen

`ai/`:
- Čita `engine.getState()` da vidi šta ima
- Poziva `engine.getLegalActions(state)` da vidi šta može
- Bira akciju prema strategiji
- **Nikada** ne mutira engine stanje direktno

```
             PREFERANS ENGINE
                    │
          ┌─────────┴─────────┐
          │                   │
        HUMAN                AI
          │                   │
          └─────────┬─────────┘
                    │
              isti GameState
```

## 1.4 Backend odluka kasnije

Engine ne zna koji je backend. Kad dođe vreme za multiplayer:
- **Backend opcija A**: Supabase (Postgres + Realtime)
- **Backend opcija B**: Node.js + Socket.IO

Odluka se donosi kad budemo imali jasne zahteve za reconnect, anti-cheat, 4 igrača, matchmaking.

---

# 2. TEHNOLOGIJE

| Sloj | Tehnologija | Razlog |
|------|-------------|--------|
| Platforma | **Web PWA** | Instalira se kao app; jedan kod za sve uređaje |
| Engine | **TypeScript** | Tipovi sprečavaju bagove sa mnogo stanja |
| Engine test | **node:test** | Ugrađen u Node; nema dependency-ja |
| UI | **Vanilla JS** | Nema razloga za React u mobilnoj igri karata |
| AI | **TypeScript** (isti jezik kao engine) | Deli tipove i pomoćne funkcije |
| Backend | **Supabase** (opcija A) | Bez infrastrukture; auth + DB odmah |

---

# 3. STRUKTURA PROJEKTA

```
D:\preferans\
├── docs\
│   ├── RULES.md              ← pravila Preferansa (zaključana)
│   ├── ARCHITECTURE.md       ← ovaj fajl
│   └── ENGINE_API.md         ← detaljna engine dokumentacija
│
├── engine\                   ← TypeScript, ČIST, bez DOM-a
│   ├── package.json
│   ├── tsconfig.json
│   ├── src\
│   │   ├── types.ts          ← svi tipovi (Suit, Rank, Card, Player...)
│   │   ├── constants.ts      ← vrednosti igara, multiplikatori
│   │   ├── cards.ts          ← operacije nad kartama
│   │   ├── deck.ts           ← factory za špil
│   │   ├── deal.ts           ← algoritam deljenja (5/5/5/2/5/5/5)
│   │   ├── bidding.ts        ← "dalje", "mogu", "igra"
│   │   ├── contracts.ts      ← igre (Pik, Karo, ..., Igra-*)
│   │   ├── trick.ts          ← pravila štiha
│   │   ├── scoring.ts        ← bule, supe, kontra, refa
│   │   ├── refe.ts           ← refe logika
│   │   └── game.ts           ← Game klasa — orchestruje sve
│   │
│   └── test\                 ← node:test
│       ├── scoring.test.ts
│       ├── deal.test.ts
│       └── ...
│
├── ai\                       ← AI — zavisi od engine-a, NE obrnuto
│   ├── bidding.ts            ← AI za licitaciju
│   ├── play.ts               ← AI za odabir karte
│   └── strategy.ts           ← heuristike
│
├── ui\                       ← Vanilla JS, koristi engine kao bundler
│   ├── index.html
│   ├── src\
│   │   ├── main.js
│   │   ├── game-ui.js        ← glavni ekran
│   │   ├── lobby.js          ← izbor igre
│   │   └── components\
│   └── styles\
│
├── backend\                  ← (FAZA 5) Supabase ili Node
│   └── (prazno za sad)
│
└── tools\
    └── play-cli.ts           ← CLI za testiranje engine-a bez ekrana
```

---

# 4. TOK RAZVOJA (FAZE)

## FAZA 1 — Engine i pravila
**Cilj**: Kompletna Preferans logika u `engine/` modulu, potpuno testirana.

Moduli:
1. ✅ Scoring (29 testova)
2. Cards / Deck / Deal
3. Bidding ("dalje", "mogu", "igra")
4. Contracts (izbor igre)
5. Trick (pravila štiha)
6. Refe
7. End-to-end Game

Izlaz: `node tools/play-cli.ts` može da odigra kompletnu partiju sa random AI.

## FAZA 2 — AI
**Cilj**: AI koji zna da igra Preferans.

Moduli:
1. Bidding AI
2. Play AI
3. Strategije (Easy/Normal/Hard)

Izlaz: Moguće igrati 1 čovek vs 2 AI na lokalnom računaru.

## FAZA 3 — UI
**Cilj**: Web PWA sa lepim stolom za Preferans.

Moduli:
1. `index.html` + CSS
2. Game UI (karte, sto, akcije)
3. Lobby
4. Single-player mode

Izlaz: Može se igrati na telefonu protiv 2 AI.

## FAZA 4 — Multiplayer
**Cilj**: Online igra sa drugim ljudima.

Moduli:
1. Backend odluka (Supabase ili Node)
2. Auth i profil
3. Privatne sobe
4. Real-time sinhronizacija

Izlaz: Igra sa 3 stvarna igrača preko interneta.

## FAZA 5 — Polish
**Cilj**: Produkciona spremnost.

Moduli:
1. Ranking
2. Statistika
3. Istorija partija
4. Podešavanja
5. Achievements
6. Dnevne igre

---

# 5. ODLUKE (REZIME)

| # | Pitanje | Odluka |
|---|---------|--------|
| 1 | Platforma | Web PWA |
| 2 | Multiplayer | Engine podržava oba; UI prvo single-player |
| 3 | Backend (kad dođe vreme) | Supabase kao opcija A; Node+WS kao opcija B |
| 4 | Frontend framework | Vanilla JS |
| 5 | Engine jezik | TypeScript |
| 6 | AI | Izdvojen u `ai/`, NE u engine-u |
| 7 | Engine zavisnosti | SAMO TypeScript standard lib; nema DOM |
| 8 | Test framework | node:test (Node 18+) |

---

# 6. PRAVILO BUDUĆIH ODLUKA

Svaka nova arhitektonska odluka se dodaje u ovaj dokument pre nego što se implementira.

Ako se zahtevi promene (npr. korisnik poželi 4 igrača, ili ne želi Supabase), dokument se **prvo** ažurira, pa tek onda kod.
