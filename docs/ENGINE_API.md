# ENGINE API — Preferans

Verzija: 1.0

Ovaj dokument opisuje **javni API** Preferans engine-a. Engine je čist TypeScript modul bez DOM/UI/AI zavisnosti.

---

# POKRETANJE

## Engine (Node test/CLI)

```bash
cd engine
npm install
npm test         # 66/66 ✓
npm run play     # CLI partija
npm run build    # kompajlira u dist/ za browser
```

## UI (Web PWA — preferans.html)

Engine se koristi iz browser-a preko ESM modula.

```bash
# Iz root direktorijuma D:\preferans:
node tools/serve.js
# Otvori http://localhost:8000/preferans.html
```

> **VAŽNO**: Direktan `file://` NE radi zbog ESM CORS pravila — **mora HTTP server**.

---

# STRUKTURA PROJEKTA

```
D:\preferans\
├── RULES.md
├── docs\
│   ├── ARCHITECTURE.md
│   └── ENGINE_API.md
├── engine\
│   ├── package.json
│   ├── tsconfig.json
│   ├── src\           ← TypeScript izvorni kod
│   ├── dist\          ← kompajliran output (za browser)
│   └── test\          ← node:test (66 testova)
├── app.js             ← UI wrapper (koristi engine/dist)
├── preferans.html     ← UI shell
└── tools\
    ├── serve.js       ← HTTP server za browser testiranje
    └── play-cli.ts    ← CLI za testiranje u terminalu
```

---

# INSTALACIJA I BRZI START

```bash
cd engine
npm install
```

```ts
import { Game } from './src/game.ts';

const game = new Game({ seed: 42, playerNames: ['Ja', 'AI 1', 'AI 2'] });
game.newHand(0); // dealer = position 0

// Čitaj stanje
const state = game.getState();

// Licitacija
game.bid(1, 3);      // player 1, vrednost 3
game.pass(2);        // player 2 kaže "dalje"
game.declareGame(1, 'Tref'); // player 1 proglašava igru

// Praćenje
game.follow(2, 'DODJEM');

// Kontra
game.kontra(2, 'KONTRA');

// Igra
game.playCard(0, 'A♠');
```

---

# Tipovi

## `Game`

Tip igre. Može biti:
- `'Pik' | 'Karo' | 'Herc' | 'Tref' | 'Betl' | 'Sans'`
- `'Igra-Pik' | 'Igra-Karo' | 'Igra-Herc' | 'Igra-Tref' | 'Igra-Betl' | 'Igra-Sans'`

## `Position`

`0 | 1 | 2` — igrač u partiji. Konvencija: 0 = Jug, 1 = Istok, 2 = Zapad.

## `Card`

```ts
{
  id: string;     // npr. "A♠"
  suit: Suit;     // '♠' | '♥' | '♦' | '♣'
  rank: Rank;     // '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'
}
```

## `GameState`

Kompletno stanje partije. Sadrži:
- `phase: GamePhase` — `'WAITING' | 'DEALING' | 'BIDDING' | 'DECLARING' | 'FOLLOW_DECLARING' | 'PLAYING' | 'TRICK_RESULT' | 'SCORING' | 'GAME_OVER'`
- `players: [Player, Player, Player]`
- `currentPlayer: Position`
- `currentBidder: Position`
- `currentBid: number`
- `bids: BidRecord[]`
- `winner: Position | null`
- `declaredGame: Game | null`
- `trump: Suit | null`
- `talon: Card[]`
- `currentTrick: TrickCard[]`
- `tricks: TrickCard[][]`
- `trickCount: number`
- `bulas: [number, number, number]`
- `supeDelta`, `refeCount`, `kontraLevel`, ...

---

# Game klasa

## `new Game(config?)`

```ts
interface GameConfig {
  playerNames?: [string, string, string];   // default: ['Jug', 'Istok', 'Zapad']
  seed?: number;                            // default: Date.now()
  refePerPlayer?: number;                   // default: 2
  initialBule?: number;                     // default: 100
}
```

## Metode

### `newHand(dealer?: Position): void`

Deli karte i pokreće novu rundu.

### `bid(player: Position, value: number): boolean`

Licitacija. Vraća `false` ako nije validan potez.

### `pass(player: Position): boolean`

Igrač kaže "dalje".

### `declareGame(player: Position, game: Game): boolean`

Pobednik licitacije proglašava igru.

### `follow(player: Position, choice: 'DODJEM' | 'NE_DODJEM'): boolean`

Pratilac se izjašnjava.

### `call(caller: Position, callee: Position): boolean`

Pratilac zove drugog pratioca ("Idemo zajedno").

### `kontra(player: Position, level: 'KONTRA' | 'REKONTRA' | 'SUBKONTRA' | 'MORTKONTRA'): boolean`

Pratilac daje kontru.

### `playCard(player: Position, cardId: string): boolean`

Igrač igra kartu.

### `getState(): Readonly<GameState>`

Vraća trenutno stanje (read-only).

### `getLegalCards(player?: Position): Card[]`

Legalne karte za igrača. Default: trenutni igrač.

### `endHand(): EndOfHandResult`

Završava partiju i računa rezultat.

### `writeOff(): WriteOffResult`

Otpisivanje bula.

---

# Scoring funkcije

Sve su čiste funkcije bez stanja.

## `calculateBulaChange(declarerTricks, game, contraMultiplier?, refeMultiplier?): number`

Računa bule za nosioca. Pozitivno = pad, negativno = prolaz.

## `calculateBulaDistribution(declarerDelta, config): Record<Position, number | undefined>`

Računa kako se bule dele među protivnicima.

## `calculateSupaForFollower(tricks, game, contraMultiplier?, refeMultiplier?): number`

Supe za jednog pratioca.

## `calculateBetlSupa(game, contraMultiplier?, refeMultiplier?): number`

Fiksne supe za betl (60/70).

## `calculateFinalScore({ supeZa, supeProtiv, finalneBule }): number`

Formira 14.1 iz RULES.md.

## `calculateWriteOff(bule): { writeOff, finalBule }`

Otpisivanje prema 9.6.

---

# Pokretanje testova

```bash
npm test
```

Izlaz:
```
✔ getGameValue — poznate igre
✔ calculateBulaChange — Pik prolaz/pad
...
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

---

# Pokretanje CLI

```bash
npm run play
```

Odigra jednu partiju sa AI protivnicima u terminalu.

---

# POKRETANJE

## Engine

```bash
cd engine
npm install
npm test         # 66/66 ✓
npm run play     # CLI partija
npm run build    # kompajlira u dist/ za browser
```

## UI (Web PWA)

Engine se koristi iz browser-a preko ESM modula.

```bash
# Iz root direktorijuma:
node tools/serve.js
# Otvori http://localhost:8000/preferans.html
```

Direktan `file://` NE radi zbog ESM CORS pravila — **mora HTTP server**.

---

# STRUKTURA PROJEKTA

| Modul | Svrha |
|-------|-------|
| `types.ts` | Svi tipovi |
| `constants.ts` | Vrednosti igara, multiplikatori |
| `cards.ts` | Čiste funkcije nad kartama |
| `deck.ts` | Špil i shuffle |
| `deal.ts` | Algoritam deljenja |
| `bidding.ts` | Licitacija (dalje, mogu, igra) |
| `contracts.ts` | Izbor igre |
| `trick.ts` | Pravila štiha |
| `scoring.ts` | Bule, supe, kontra, refa |
| `refe.ts` | Refe logika |
| `game.ts` | Game klasa — orchestracija |
