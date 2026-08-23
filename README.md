# Preferans

Web aplikacija za igranje Preferansa (srpska kartaška igra za 3 igrača).

## Status

- ✅ Engine (TypeScript) — kompletan, 66/66 testova
- ⚠️ UI (Vanilla JS) — delimično, ima bagova
- ⚠️ AI — osnovni
- ❌ Backend — tek treba

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
