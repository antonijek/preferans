# Preferans

Web aplikacija za igranje Preferansa (srpska kartaška igra za 3 igrača).

## Status

- ✅ Engine (TypeScript) — 119/119 testova (`cd engine && npm test`), pravila usklađena sa RULES.md + REFERENTNI_PRIMERI.md (licitacija, kontra na svim igrama uklj. Betl/Sans, "niko ne prati", "Pik bez kontre", Igra tiebreak)
- ✅ UI (Vanilla JS) — "3 AI" i "Vi + 2 AI" mod odigravaju celu partiju do kraja bez zastoja (potvrđeno preko 20+ nezavisnih headless-browser partija, `npm run test:ui:multi`), sa vidljivom tabelom bula/supa/refa
- ⚠️ AI — osnovni (radi, ali strategija je primitivna); postoji odvojen testiran `engine/src/ai.ts` koji UI ne koristi
- ❌ Backend — tek treba (engine je framework-agnostic, spreman da radi server-side bez izmena)

Pogledaj [TODO.md](./TODO.md) za detaljan status i plan.

## Struktura

```
.
├── RULES.md                  ← Pravila Preferansa
├── docs/                     ← Dokumentacija
│   ├── ARCHITECTURE.md
│   └── ENGINE_API.md
├── engine/                   ← TypeScript engine (srce igre)
│   ├── src/                  ← TypeScript kod (11 modula)
│   ├── dist/                 ← Kompajliran output (za browser)
│   ├── test/                 ← Testovi (66 testova)
│   └── package.json
├── app.js                    ← UI wrapper (koristi engine/dist)
├── preferans.html            ← UI šel + CSS
└── tools/
    ├── serve.js              ← Development HTTP server (port 8000)
    └── play-cli.ts           ← CLI za testiranje partije
```

## Pokretanje

```bash
# 1. Engine testovi
cd engine
npm install
npm test

# 2. Kompajliraj engine za browser
npm run build

# 3. Pokreni development server
cd ..
node tools/serve.js

# 4. Otvori browser
# http://localhost:8000/preferans.html
```

## Browser smoke test (UI + engine zajedno)

```bash
npm install         # instalira Playwright (jednom)
npm run test:ui     # pokreće server, odigra 2 cele partije u headless Chromium-u
```

Ovo hvata bagove koje `engine` testovi ne mogu vidjeti (npr. AI se zaglavi u UI-ju),
jer stvarno pokreće `app.js` u browseru, ne samo engine funkcije.

```bash
npm run test:ui:multi -- 20   # N nezavisnih partija — hvata retke, seed-zavisne zastoje
npm run visual:check          # screenshotovi kljucnih trenutaka u tools/shots/
```

## CLI testiranje

```bash
cd engine
npm run play    # odigra celu partiju u terminalu
```

## Tehnologije

- **Engine**: TypeScript, Node.js test
- **UI**: Vanilla JavaScript, ESM moduli
- **HTTP server**: Node.js builtin (za development)
- **Build**: TypeScript compiler (tsc)
