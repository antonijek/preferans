# TODO — Preferans projekat

## 🔴 PREDAJA NOVOJ SESIJI (2026-08-30, noćna sesija) — PROČITAJ OVO PRVO

**Kontekst**: korisnik je otišao na spavanje i eksplicitno dao dozvolu da se
radi bez prekida celu noć ("dajem ti unapred sve dozvole... ako vidiš da si
negde zapeo probaj drugi pristup") — zato je ova sesija radila i spore
headless regresije (nešto što je ranije EKSPLICITNO tražio da se NE radi dok
je on aktivan i čeka, vidi obrazac ispod).

**ISPRAVKA zastarele tvrdnje iz prethodne "predaje" (ispod)**: `engine/src/ai.ts`
NIJE mrtav kod — `app.js` već koristi `chooseDiscard/chooseFollow/chooseKontra/
choosePlayCard/chooseCallOrAlone/chooseBidAction/evaluateHand` odatle. Samo su
`chooseIgraConfirm`/`chooseUseRefe` i dalje neiskorišćeni (verovatno nepotrebni —
refe se rešava automatski u engine-u, ne kroz AI izbor).

**Trenutno stanje**: `cd engine && npm test` → **173/173**. `npm run
test:ui:multi -- 100` (iz root-a, root uzrok ranijih "zaglavljivanja" — vidi
niže) → pokrenuto, proveri rezultat ako nije stigao pre nego što nastaviš.
Server: `node tools/serve.js` iz `D:\preferans` (port 8000).

**VAŽNO — zašto se `npm run test:ui:multi`/`npm run visual:check` ranije
"zaglavljivalo bez izlaza" satima**: ovi alati SAMI pokreću svoj server
(`spawn` u `tools/multi-smoke.mjs`/`tools/visual-check.mjs`) na portu 8000.
Ako je već pokrenut `node tools/serve.js` ručno (za korisnika da testira
uživo), dolazi do konflikta i alat visi. UVEK proveri/ugasi ručni server pre
pokretanja ovih alata: `netstat -ano | grep ":8000"`, pa `taskkill` ako
postoji, PRE `npm run test:ui:multi`. Takođe — kad Bash komanda ide kroz
`| tail -N`, nema NIKAKVOG izlaza dok proces ne završi (tail čeka EOF) — ne
zaključuj da je nešto zaglavljeno na osnovu prazne background-output
datoteke, prvo probaj BEZ `| tail`.

**Šta je urađeno večeras (2026-08-29 uveče → 2026-08-30 noć), redom:**

1. **AI poboljšanja** — `aiBidTurn` (app.js) sad koristi testirani
   `chooseBidAction` (ai.ts) umesto grubog skeniranja boja. Pratilac protiv
   Sansa sad izlazi iz Pika (uz kontru) / Trefa (bez kontre), samo na prvom
   štihu ruke. AI pratilac više ne "pregazi" saigrača koji već drži štih.
2. **Bidding bag**: igrač koji je Mogu-eligible ali je Mogu VEĆ zauzet od
   drugog SME da podigne licitaciju (ranije ostajao zaglavljen na "Dalje").
   `game.ts` `bid()` + `getLegalActions()` + `ai.ts` `chooseBidAction()`.
3. **Refe — potpuno predizajniran model** (3 uzastopne runde ispravki uživo
   sa korisnikom, videti RULES.md sekciju 7 za finalnu, tačnu verziju):
   - Kad refe "okine" (svi dalje, ILI Pik bez kontre/niko-ne-prati-na-Piku)
     → SVA TRI igrača dobijaju po 1 refu "na raspolaganju" (`state.refePending`),
     odvojeno od "iskorišćeno" (`state.refeCount`). Svako je troši SAM kad
     LIČNO postane nosilac neke ODIGRANE rune (ne mora biti odmah sledeća).
   - Novo OKIDANJE (dodela/redeal) kod "niko ne prati" je SAMO za Pik (ne
     Igra-Pik, ne bilo koja druga igra) — ista tri-grana logika kao "Pik bez
     kontre" (šešir-izuzetak / dodela-ako-ima-budžeta / redeal-bez-budžeta).
   - ALI potrošnja VEĆ POSTOJEĆE raspoložive refe (od ranijeg trigera) VAŽI
     NA SVAKOJ igri kod "niko ne prati", ne samo Piku — refa je lična
     osobina igrača, ne vezana za mehanizam kojim se ruka završava.
   - `game.ts`: novi `awardRefeToAll()`, `handleUnplayedHand()` (deljena
     Pik-bez-kontre/Pik-niko-ne-prati logika), `consumeRefeIfPending()`.
4. **"Svi kažu Igra" bag (RULES 3.4.1)** — engine je ranije proglašavao
   pobednika = PRVI koji je rekao Igra, bez ikakvog traženja da ostali
   TAKOĐE proglase svoju igru i bez poređenja jačine. Popravljeno — novi
   `state.igraCompetitors`/`igraDeclarations`, `declareIgra(player, game)`
   sad zahteva SVE konkurente da proglase, pa poredi jačinu (izjednačenje →
   prvi koji je rekao Igra pobeđuje).
5. **UI**: nov mod "Vi na sve 3" (`mode==='3human'`) — čovek kontroliše sva
   tri mesta, za ručno testiranje scenarija (`isHuman(player)` helper svuda
   umesto starih `mode==='1v2' && player===0` provera). Podesiva početna
   bula/broj refea na setup ekranu (`createGame()` factory, ne više fiksno
   `new Game()` na modul-load). CSS bag "igra na pola ekrana" — `.status-bar.empty
   { display:none }` je uklanjao element iz CSS grid toka (body je grid sa 4
   eksplicitna reda), pomerajući SVE ostale elemente u pogrešne redove —
   ispravljeno na vizuelno kolabiranje bez uklanjanja iz grid-a. Talon sad
   prikazan kao STVARNE karte u sredini stola (`#talonCenter`), ne sitan
   tekst-bedž.
6. Preostalo za sledeću sesiju: korisnik je tražio da se layout dodatno
   uporedi sa Ipref.exe screenshot-ovima (poslao 2 slike u chatu, nisu
   sačuvane kao fajlovi — ako ih opet pošalje, sačuvaj referencu). Mobile
   portret top-bar tekst se malo lomi ("100/100/100" preloma na "/100") —
   manji kozmetički nedostatak, nije hitno.

---

## 🔴 PREDAJA NOVOJ SESIJI (2026-08-29) — PROČITAJ OVO PRVO (ISTORIJSKI — vidi noviju predaju iznad za trenutno stanje)

**Trenutno stanje**: `cd engine && npm test` → **152/152 testova prolazi**.
`npm run test:ui:multi -- 20` (iz root-a) → **20/20 partija čisto**, poslednji put
potvrđeno posle SVIH ispravki ispod. Server: `node tools/serve.js` iz `D:\preferans`
(port 8000) — proveri `netstat -ano | grep ":8000"` pre pokretanja, prethodna
sesija je možda ostavila proces da radi.

**Radni obrazac koji korisnik EKSPLICITNO traži** (rekao više puta, frustriran
kad se ne poštuje): NE pokretati pun test+build+smoke ciklus (traje dugo) posle
SVAKE sitne izmene. Skupiti više prijavljenih bagova, popraviti ih SVE, pa tek
onda pokrenuti jedan test/smoke krug na kraju batch-a.

**Bagovi pronađeni i popravljeni danas (2026-08-29)** — svi potvrđeni uživo od
korisnika i/ili unakrsno protiv RULES.md / REFERENTNI_PRIMERI.md / spoljnih
izvora (WebSearch: preferansklub.com, idoc.pub, pdfcoffee.com):

1. **Automatski prekid runde na 5. štihu odbrane** (`game.ts`,
   `isDeclarerCertainlyDown()`, pozvano iz `resolveTrick()`) — čim odbrana
   (svi ne-nosioci ZAJEDNO) uhvati toliko štihova da nosilac matematički više
   ne može stići do praga (5 za standardne/Igra igre, 1 za Betl), runda staje
   ODMAH, bez igranja preostalih štihova. Potvrđeno nezavisno na
   preferansklub.com i pdfcoffee.com ("Rezultat Pratioca je limitiran na
   maksimum od 5 štihova... igra se prekida").
2. **Supa formula kod kontre kad nosilac padne** — koristila je NOSIOČEVE
   preostale štihove umesto ZBIRA ODBRANE (svi ne-nosioci zajedno, uvek tačno
   5 zahvaljujući ispravci #1). Potvrđeno REFERENTNI_PRIMERI.md rundom #11
   ("Janko: 80 supa = 5×8×2", gde je 5 = odbrana zajedno — ranije se to
   poklapalo sa nosiočevim štihovima SAMO slučajno jer je taj primer imao 5-5
   podelu, pa greška nije bila uočena.
3. **DUPLIRAN AI bidding tajmer** (`app.js`, `startGame()`/`nextRound()`/
   `restart()`) — pored ispravnog tajmera u `renderBiddingPanel()`, postojao
   je DRUGI koji je čitao `game.state.currentBidder` TEK kad tajmer opali
   (posle 500ms) umesto da ga zaključa odmah. Ako bi red u međuvremenu
   stigao baš do čoveka, taj zaostali tajmer je zvao AI logiku ZA ČOVEKA,
   mimo dugmadi, bez ikakvog traga u konzoli. **Ovo je najverovatniji uzrok**
   dugo neuhvatljivih bagova "pise da sam rekao 3 a nisam", "licitacije nije
   ni bilo, odmah uzimam talon", "dodjem/ne dodjem se pojavilo bez licitacije".
   Uklonjena sva 3 duplirana mesta — sad postoji SAMO jedan mehanizam
   zakazivanja (u `renderBiddingPanel()`). NIJE 100% potvrđeno da je ovo bio
   JEDINI uzrok te klase bagova — ako se ponovi, proveri F12 konzolu (sad ima
   `logTrustedAction()` dijagnostika na SVAKOM dugmetu akcije, ne samo bidding).
4. **Refe mehanizam bio mrtav kod** (`game.ts`, `handleRefe()` + `newHand()`)
   — `state.refeUsed` (zastava za ×2 množilac) se NIGDE nije postavljala na
   `true`, samo na `false` u `newHand()`. Cela ×2 refe-mehanika nikad nije
   radila. Dodatno, `handleRefe()` je pogrešno odmah upisivao refe SVA TRI
   igrača čim bi svi rekli "dalje" — po RULES.md 7.3, refe se troši SAMO
   nosiocu SLEDEĆE (upravo podeljene) ruke, i to TEK kad se ta ruka završi.
   Popravljeno: `handleRefe()` sad samo naoružava `refeUsed=true` za sledeću
   ruku (posle `newHand()` poziva, jer `newHand()` resetuje na `false`); stvarna
   potrošnja (`refeCount[declarer]++`) već je postojala ispravno u `endHand()`.
5. **Poziv (Zovem X) bez kontre — pogrešan prag I pogrešan zbir** — dve
   odvojene greške u istoj formuli (`scoring.ts` `calculateBulaDistribution`,
   `game.ts` `activeFollowers`):
   - Formula je BEZUSLOVNO dizala/spuštala pozivaoca za `-declarerDelta`,
     ignorišući broj štihova. Ispravljeno da koristi prag (kao 5.2), ali:
   - Korisnik je uživo potvrdio da prag za pozivaoca+pozvanog ZAJEDNO nije 2
     (kao samostalni pratilac) nego **4** — dvostruko, jer su dvojica protiv
     nosioca. Ovo NIJE bilo u RULES.md — dodato u sekciju 5.3.
   - `activeFollowers` (koji gradi `tricksWon` mapu) je gledao SAMO
     `followChoices[p] === 'DODJEM'`, pa je POZVANI partner (koji kaže
     NE_DODJEM ali stvarno igra) ispadao iz zbira — njegovi štihovi su se
     uvek računali kao 0. Popravljeno da koristi `isPlayerActive()`.
6. **Talon banner nestajao prebrzo** (`app.js`, `renderStatusBar()`) — talon
   se prikazivao samo tokom DISCARDING/DECLARING, nestajao čim bi nosilac
   proglasio igru — prebrzo da se stigne pogledati šta je AI kupio. Prošireno
   da traje kroz FOLLOW_DECLARING/KONTRA_DECLARING i dok ne prođe prvi štih
   igranja (`trickCount === 0`).
7. Dodat backdrop-click (klik van kutije zatvara) na 📊 Tabela modal — mera
   predostrožnosti za mobilne dodire koji možda ne registruju tačan klik na
   "Zatvori" (nepotvrđen uzrok, samo dodatna sigurnosna mreža).

**Dijagnostika i dalje aktivna** (`app.js`, `logTrustedAction()`): SVAKO
dugme akcije (bid, mogu, igra, declare, dodjem/ne dodjem, poziv, kontra,
odbacivanje, igranje karte) loguje u F12 konzolu da li je klik bio stvaran
(`isTrusted`) i pun snapshot stanja. Ako se pojavi bilo koja "phantom
action" prijava opet, PRVO tražiti F12 → Console izveštaj pre bilo kakve
izmene koda.

**Odbijeno da se uradi** (i treba ostati odbijeno): korisnik je tražio da se
rasčlani (reverse-engineer) tuđi kompajlirani komercijalni Preferans program
(`Ipref.exe`, Delphi) — string dump, DIE analiza, itd. — kao izvor za
poređenje pravila. Odbijeno oba puta (i sopstvena analiza i tuđa gotova
analiza koju je korisnik doneo) — nije ni etički ni praktično korisno (samo
Delphi UI imena komponenti, nema formula). Ako korisnik ponovo predloži ovo,
ista odluka važi. Alternativa koja VAŽI: korisnik igra taj drugi program
(legitimna upotreba, ne rasčlanjivanje) i javlja REZULTATE/brojeve za sporne
scenarije — to je ok i korisno.

**Sledeći korak za novu sesiju**: čekati da korisnik javi sledeći bag uživo
(igra na localhost:8000). Ne pokretati preventivne test cikluse dok se ne
skupi bar par prijava. RULES.md je ažuriran (sekcija 5.3, prag 4) — ostaje
jedini izvor istine, ali OVA sesija je pokazala da čak i on ima rupe (npr.
prag za poziv uopšte nije bio naveden pre danas) — ne oklevati da se doda
novo pravilo kad korisnik uživo potvrdi nešto što nedostaje.

---

## 🟡 STARIJA PREDAJA (2026-08-28, kasno uveče) — istorijski kontekst

Korisnik prelazi na novu Claude sesiju posle duge noćne sesije popravki. Nemoj
krenuti od nule — pročitaj ovo i ostatak fajla pre bilo kakve izmene koda.

**Šta je SIGURNO ispravno i testirano** (nemoj ponovo menjati bez jakog razloga):
- Engine: 119/119 testova (`cd engine && npm test`). Pokriva licitaciju,
  kontru (uklj. Betl/Sans), "niko ne prati", "Pik bez kontre", IGRA tok.
- Browser: `npm run test:ui` i `npm run test:ui:multi -- 20` (iz root-a) —
  headless partije, AI protiv AI, hvataju prave zastoje. **Poslednji pun
  rezultat: 20/20 čisto** — ALI ovaj run je bio PRE poslednje izmene (AI
  logika igranja karata u `aiPlayCard()`, `app.js`). **Pokreni
  `npm run test:ui:multi -- 20` JOŠ JEDNOM pre bilo čega drugog** da
  potvrdiš da ta izmena ne pravi nove zastoje.
- Dvokoračni IGRA tok je VRAĆEN na original po zahtevu korisnika: `sayIgra(player)`
  (bez imena igre) → posle svih odgovora ide u DECLARING fazu → tek tu
  `declareIgra(game)` bira konkretnu igru. NE MENJAJ ovo na "odmah imenuj igru"
  — to je bila moja greška ranije večeras, korisnik je eksplicitno tražio da
  se vrati na dvokoračni tok.
- "Mogu X" pravilo — korisnik EKSPLICITNO potvrdio: igrač MORA da je licitirao
  BAREM JEDNOM (bilo koju vrednost) u ovoj rundi da bi imao pravo na "Mogu X"
  za BILO KOJU trenutnu vrednost X (ne mora biti tačno ta vrednost koju je on
  licitirao). Implementirano u `game.ts` `bid()`: `p.bidLevel > 0` uslov.
  Ovo JE potvrđeno tačno — korisnikova poruka: "rekao sam bilo sta licitirao,
  ako sam ja rekao 2, posle mogu da kazem bilo koje mogu X, mogu 4, mogu 5...".

**🔴 OTVORENO PITANJE — nisam stigao da rešim, korisnik je frustriran:**

Korisnik je prijavio: kliknuo "Mogu 4", i ODMAH se licitacija završila, ali je
DRUGI igrač (ne on) postao nosilac i proglasio Herc — iako je ON rekao Mogu 4.

Moja hipoteza (NIJE POTVRĐENA, nisam dobio tačan redosled od korisnika pre
prekida sesije): u `checkBiddingEnd()` (`game.ts`, grana `notPassed.length >= 2`
/ `allSaidMoguForCurrent`), kad SVI aktivni igrači potvrde istu vrednost
(bilo BID bilo MOGU), pobednik se određuje ovako:
```js
const winner = notPassed.find(p =>
  this.state.bids.some(b => b.player === p && b.type === 'BID' && b.value === this.state.currentBid)
);
```
Ovo bira igrača koji ima STVARAN "BID" zapis za tu vrednost — ako je korisnik
samo rekao "Mogu 4" (MOGU zapis, ne BID), a NEKI DRUGI igrač je ranije stvarno
BID-ovao 4, taj DRUGI igrač postaje nosilac, ne korisnik koji je "mogu"-ovao.

**Pitanje koje treba postaviti korisniku pre bilo kakve izmene:** Da li je ovo
očekivano ponašanje ("mogu" samo znači "ne dižem dalje", nosilac ostaje onaj
ko je STVARNO prvi licitirao tu vrednost) ili bag? Treba TAČAN redosled ko je
šta licitirao pre "Mogu 4" da se sa sigurnošću utvrdi da li je ovo tačno.
NE MENJAJ ovu logiku bez tog konkretnog primera — večeras sam 2 puta menjao
"Mogu" pravilo tamo-amo bez dovoljno informacija i to je iscrpelo korisnika.

**Takođe netestirano posle poslednje izmene** (AI logika igranja karata u
`app.js`, `aiPlayCard()` — sad ima cilj: nosilac pokušava da uzme štih,
pratilac udara samo kad nosilac trenutno vodi štih): pokreni
`npm run test:ui:multi -- 20` da potvrdiš da ne pravi nove zastoje.

---

Status (2026-08-28): **Engine 119/119 testova, UI odigrava celu partiju do kraja (potvrđeno 20+ nezavisnih headless-browser partija bez zastoja)**

**Poslednja sesija (Claude, noćna) — obiman prolaz kroz korektnost pravila + UI:**

Engine bug-ovi (`engine/src/game.ts`), svi sa novim/proširenim testovima:
1. Licitacija se prerano završavala kad ostane 1 aktivan bidder koji jos nista nije licitirao — popravljeno da mora stvarno odigrati potez (REFA scenario).
2. Redosled kontriranja bio obrnut ("desni od nosioca" = `(winner+2)%3`, ne `nextPlayer(winner)`).
3. "Može" logika nije pratila redosled — drugi pratilac nije dobijao šansu za kontru. Dodato `followersInKontraOrder()`.
4. **Licitacija je dozvoljavala skok** (npr. odmah "5" umesto 2→3→4→5) — sad `bid()` traži tačno `currentBid+1`. Otkrio korisnik uživo testirajući.
5. **"Mogu X" nije dozvoljeno igraču koji NIJE UOPŠTE licitirao** u toj rundi (`p.bidLevel > 0` je uslov, pored `value===currentBid`) — korisnik eksplicitno potvrdio ovo pravilo. Napomena: UI provera je ranije bila STROŽA od engine provere (tražila `bidLevel===currentBid` tačno, ne samo `bidLevel>0`), što je verovatno pravi uzrok "Mogu je nestalo" utiska — sad su usklađene, obe traže samo "makar jednom licitirao ovu rundu". Test: `e2e.test.ts` "Mogu X nije dozvoljeno...".
6. **FOLLOW_DECLARING deadlock** kad oba pratioca kažu "Ne dođem" — dodato `handleNoOneFollows()` (RULES 5.4: nosilac automatski dobija 10 štihova).
7. **Kontra je bila potpuno onemogućena za Betl/Sans** — u koliziji sa RULES.md 6.9 i sa 3 primera iz REFERENTNI_PRIMERI.md (runde #4, #10, #14). Popravljeno, sad prolaze kroz KONTRA_DECLARING kao i ostale igre.
8. **"Pik bez kontre" (RULES 7.1.1)** — bilo potpuno neimplementirano (test je bio prazan). Dodato `handlePikWithoutKontra()` sa sve 3 grane (refe / bez refe / neko u šeširu).
9. **"Igra" tiebreak** — drugi igrač koji kaže Igra je tiho prepisivao prvog bez poređenja jačine. `sayIgra(player, game)` sad odmah traži igru i poredi po RULES 3.4.1 (jača pobeđuje, izjednačenje → prvi pobeđuje). Ukinut poseban `declareIgra()` poziv — IGRA sad ide direktno u FOLLOW_DECLARING.
10. **`bid()` je numerička licitacija dozvoljavala i posle "Igra"** (drugi igrač je mogao beskonačno raditi normalan bid dok engine čeka njihov odgovor na Igra) — uzrokovalo stvaran deadlock, uhvaćeno multi-seed testom. Popravljeno: `bid()` odbija kad `igraPlayer !== null`.
11. **`renderFollowing()` "Zovi/Igram sam" UI kod je bio mrtav** — uslov je proveravao `undecided === callerCandidate` unutar grane koja se izvršava SAMO dok neko još nije odlučio, pa se nikad nije gađao trenutak kad oba pratioca VEĆ odluče. Uzrokovalo stvaran FOLLOW_DECLARING zastoj, uhvaćeno kroz `npm run test:ui:multi`. Prepisana cela funkcija.
12. Obrisan mrtav kod: `engine/src/bidding.ts` (nije ga koristio `game.ts`, imao i pokvaren komentar od lošeg find-replace-a), i 3 scratch skripte (`remove-dup*.cjs`, `update-test.cjs`).

AI popravke (`app.js`):
- `aiBidTurn()` licitira jedan korak odjednom (RULES 3.2), ne skače na ciljanu vrednost; poštuje isto "Mogu" i "Igra zamrzava numeriku" pravilo.
- `renderFollowing()`'s AI heuristika (`hand.length>=4`) je bila uvek `true` (ruka je uvek 10 karata) — zamenjena stvarnom procenom (broj aduta/visokih karata).
- Dodata odbrana od "stale setTimeout" trke na SVIM odloženim AI pozivima (bid/discard/declare/follow/kontra) — svaki proverava da stanje igre nije već napredovalo pre nego što deluje. Otkriveno posle korisnikovog izveštaja "piše da sam rekao 3 a nisam rekao ništa".

UI (RULES.md prikaz, korisnikov zahtev "sve da bude vidljivo"):
- **Contract banner** (ko igra šta, kontra nivo) — uvek vidljiv čim je igra proglašena.
- **Poslednji štih** — trajna traka (3 karte + pobednik), izvor `state.tricks.at(-1)` (engine već čuvao, UI nije čitao).
- **Tabela (📊 dugme)** — modal sa: trenutne bule, refe iskorišćeno/dozvoljeno po igraču, **supe "ko kome duguje" matrica** (kumulativna kroz partiju), i istorija svake ruke (krug/nosilac/igra/kontra/rezultat/bule). Napaja se novim `engine` poljem `state.lastHandResult` (popunjava se na SVAKOM kraju ruke, uklj. nove RULES 5.4/7.1.1 puteve).
- Kompaktan Σ-supe i 🔁-refe bedž na svakom sedištu (uvek vidljivo, bez klika).
- Raspored karata u ruci sortiran: tref → herc → pik → karo, A→7 unutar boje (korisnikov zahtev).
- Centralizovan `dispatch` obrazac za korisničke akcije (priprema za budući multiplayer — klijent kasnije samo menja OVO mesto da šalje na server umesto lokalnog engine poziva).

Alati:
- `npm run test:ui` — jedna headless-browser partija (postojalo).
- `npm run test:ui:multi -- N` — N nezavisnih partija, hvata retke seed-zavisne zastoje (novo, ovim je uhvaćeno oba stvarna zastoja gore).
- `npm run visual:check` — screenshotovi ključnih UI trenutaka u `tools/shots/`.
- `.claude/settings.json` — allowlist za `npm test`/`npm run *` da se smanje permission-prompt prekidi.

**Otkriveno, nije menjano (van obima, treba pitati korisnika):**
- `state.refeUsed` (množilac ×2 za "partiju pod refeom") se nigde stvarno ne postavlja na `true` — trenutni `handleRefe()` je pojednostavljena verzija ("Po tvom pravilu" komentar u kodu, iz ranije sesije). Realna refe-doubling mehanika (RULES 7.3: sledeća ruka koju nosilac sa neiskorišćenom refom dobije se duplira) NIJE implementirana. Namerno nedirano — ne menjati bez pitanja korisnika, jer je prošla svesna pojednostavljivanja.
- `engine/src/ai.ts` — potpuno odvojen, testiran (`engine/test/ai.test.ts`) AI modul koji `app.js` uopšte ne koristi (app.js ima svoju jednostavniju inline AI logiku). Moguća osnova za buduće poboljšanje AI-ja.
- `engine/tools/test-full-game.ts` — manuelni CLI test cele partije, koristi `ai.ts`, radi nezavisno od `app.js`.

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

### Popravljeno (2026-08-27)
1. ~~Bidding winner logika~~ — popravljeno, vidi rezime na vrhu.
2. ~~IGRA proglašenje~~ — `sayIgra`/`declareIgra` tok testiran (e2e testovi), radi.
3. ~~AI se zaglavi u PLAYING fazi~~ — popravljeno u `app.js` (render() sad pokreće AI lanac).

### Kritični (moraju se popraviti)
1. **Discarding UI za čoveka** — AI discard radi, ali čovek (mod "Vi + 2 AI") treba manuelno testiranje u browseru.
2. **Mobile responsive** — veći ekrani (>700px) rade, manji imaju problema sa vidljivošću dugmadi.

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
