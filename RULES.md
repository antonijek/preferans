# PREFERANS PRAVILA

Verzija: 1.0 (izvedeno iz "Preferans Pravila v1.2", 26. oktobar 2001)

Ovaj dokument je **jedini izvor istine** za sva pravila Preferansa u ovoj aplikaciji.
Engine, AI i UI ČITAJU iz ovog dokumenta (ili iz njega izvedenih konstanti).
Svako odstupanje od ovog dokumenta smatra se BUG-om.

---

# 0. REZIME ODLUKA

Ove odluke su zaključane tokom diskusije i smatraju se **finalnim** za ovu verziju:

| # | Odluka | Izbor |
|---|--------|-------|
| 1 | Prioritet "Igra" kad dva igrača prijave istu igru | **A** — prvi koji je rekao "Igra" dobija |
| 2 | "Igra Betl"/"Igra Sans" u toku licitacije | **A** — igra bez talona (kao "Igra") |
| 3 | Trenutak kontra/rekontre | **C** — posle proglašenja igre |
| 4 | Pik bez kontre | Refe samo ako nosilac ima neiskorišćenih refe-a; inače ništa; ALI ako neko u šeširu → regularan prolaz |
| 5 | "Automatski polazi" kod kontre | **B** — kad je data kontra, uvek se igra u troje |
| 6 | Maksimalan broj refea | **2** (podrazumevano za partiju od 100 bula, konfigurabilno) |
| 7 | Refe × kontra | **A** — množe se zajedno |
| 8 | Niko ne prati — nosilac dobija 10 štihova | Nosilac se spušta za `igra × 2`, ostali ne pišu ništa |
| 9 | Betl pad — supe | **A** — fiksno 60 (Betl) / 70 (Igra-Betl) po pratiocu |
| 10 | Poglavlje 16 (DOGOVORI) | Opcioni predlozi — ne podrazumevaju se |

---

# 1. OPŠTE

## 1.1 Igrači

- Preferans se igra u **troje**.
- Varijanta sa 4 igrača (jedan preskače krug) **nije podržana** u ovoj verziji.

## 1.2 Karti

- Igra se sa **32 karte**: 7, 8, 9, 10, J, Q, K, A.
- **As (A) je najjači**, 7 najslabija.
- Boje (redom od najjače ka najslabijoj): pik (♠), herc (♥), karo (♦), tref (♣).

## 1.3 Rang karata

| Karta | Vrednost |
|-------|---------|
| 7     | 0 |
| 8     | 1 |
| 9     | 2 |
| 10    | 3 |
| J     | 4 |
| Q     | 5 |
| K     | 6 |
| A     | 7 |

## 1.4 Redosled igrača

- Igrači su numerisani kao **P1** (prvi po redu), **P2** (drugi), **P3** (treći).
- P1 je onaj sa leve strane dilera (u pravcu suprotnom od kazaljke na satu).
- Deljenje počinje od igrača sa **desne** strane dilera.
- Redosled sedenja je suprotan kazaljke na satu od dilera.

---

# 2. DELJENJE

## 2.1 Mešanje

- Diler meša špil.
- Igrač sa leve strane dilera seče špil (opciono ali preporučljivo).

## 2.2 Runda deljenja

Deljenje se vrši u tri faze:

```
1. 5 karata → P1 (desno od dilera)
2. 5 karata → P2
3. 5 karata → P3
4. 2 karte → TALON (kup)
5. 5 karata → P1
6. 5 karata → P2
7. 5 karata → P3
```

- Svaki igrač dobija **10 karata**.
- **2 karte** idu u talon (kup).
- Kup je okrenut na dole i ne vidi se dok god neko ne dobije licitaciju.

## 2.3 Licitacija počinje

- Licitaciju **uvek započinje P1** (onaj sa desne strane dilera u prvoj fazi deljenja).

---

# 3. LICITIRANJE

## 3.1 Vrednosti igara

| Igra          | Vrednost |
|---------------|----------|
| Pik           | 2 |
| Karo          | 3 |
| Herc          | 4 |
| Tref          | 5 |
| Betl          | 6 |
| Sans          | 7 |
| Igra-Pik      | 3 |
| Igra-Karo     | 4 |
| Igra-Herc     | 5 |
| Igra-Tref     | 6 |
| Igra-Betl     | 7 |
| Igra-Sans     | 8 |

**Igra** uvek vredi **1 više** od standardne verzije iste boje.

## 3.2 Tok licitacije

- Igrači licitiraju u krug, počevši od **P1**.
- Svaki igrač može:
  - **Reći "dalje"** (odustajanje iz licitacije)
  - **Licitirati višu vrednost** od trenutne (počevši od 2, tj. Pik)
  - **Reći "Igra"** (specijalna opcija — vidi 3.4)
- Licitacija se završava kad ostanu **samo jedan ili nijedan** igrač.
- **"Mogu"** — vidi 3.3.

## 3.3 Pravilo "Mogu"

Kada igrač koji je već licitirao ponovo dođe na red:

- Ako je **prvi igrač** (onaj koji je prvi licitirao u krugu), **mora** reći **"mogu X"** (gde je X trenutna vrednost) ako želi da nastavi.
- Ako **"mogu"** preskoči na drugog igrača jer je prvi odustao, onda **drugi igrač** koji je licitirao tu vrednost mora reći "mogu X".
- **"Mogu"** znači "ja sam taj koji je licitirao X i prihvatam tu vrednost — nastavi".

**Primer toka:**

```
P1: "2"
P2: "3"
P3: "dalje"
P1: "mogu 3"  ← prvi igrač mora potvrditi
P2: "4"
... ili P1: "dalje", P2: "mogu 4"
```

## 3.4 Specijalna opcija: "Igra"

- Igrač može u bilo kom trenutku reći **"Igra"**.
- "Igra" znači: "Imam dovoljno dobre karte da igram **bez talona**."
- Igrač proglašava igru **istog trenutka** (nema dalje licitacije).
- Dozvoljene igre kod "Igra": Igra-Pik, Igra-Karo, Igra-Herc, Igra-Tref (tj. igra 2-5).
- Igra-Betl i Igra-Sans se **ne mogu** prijaviti kao "Igra" u smislu "bez talona" — one se prijavljuju kao "Igra Betl" ili "Igra Sans" (vidi 3.5).

### 3.4.1 Više igrača kaže "Igra"

Ako više igrača kaže "Igra":
- Svaki igrač proglašava koja mu je igra.
- Igrač sa **najjačom igrom** dobija.
- Ako dva igrača imaju **istu jačinu igre**: **prvi koji je rekao "Igra"** dobija.

## 3.5 Igra-Betl i Igra-Sans

- Igrač može reći **"Igra Betl"** ili **"Igra Sans"** (ili samo "Betl" / "Sans") u toku licitacije ili nakon pobede u licitaciji.
- Ako je rekao **u toku** licitacije, tretira se kao "Igra" iz 3.4 — igrač **ne uzima talon** i igra sa onim što ima (10 karata).
- Ako je **dobio licitaciju regularno** (ne kroz "Igra"), uzima talon pre proglašenja igre.
- "Igra Betl"/"Igra Sans" uvek vrede 1 više od standardnih (vidi 3.1).

## 3.6 Svi kažu "dalje"

- Ako svi igrači kažu "dalje":
  - **Partija se ne igra**.
  - **Upisuje se refe** (vidi sekciju 7).
  - Deli se nova ruka.

---

# 4. POSLE LICITACIJE — ODLUKA O IGRI

## 4.1 Pobednik licitacije

- Pobednik je **jedini igrač koji nije rekao "dalje"** (ili koji je rekao "Igra" sa najjačom igrom).
- Ako je pobednik licitirao normalno:
  - **Uzima talon** (sada ima 12 karata).
  - **Odbacuje 2 karte** na sto (ne pokazuje ih).
  - **Proglašava igru** (mora biti ≥ vrednost na kojoj je stao).
- Ako je pobednik rekao "Igra":
  - **NE uzima talon**.
  - **NE odbacuje karte**.
  - Igra sa onim što ima (10 karata).

## 4.2 Proglašena igra

Pobednik bira jednu od dozvoljenih igara:

| Ako je stao na... | Može igrati...                  |
|-------------------|---------------------------------|
| 2                 | Pik ili jače                    |
| 3                 | Karo ili jače                   |
| 4                 | Herc ili jače                   |
| 5                 | Tref, Betl ili Sans             |
| Igra-2            | Igra-Pik ili jače               |
| Igra-3            | Igra-Karo ili jače              |
| ...               | ...                             |
| Igra-5            | Igra-Tref, Igra-Betl, Igra-Sans |

Igra mora biti **≥ vrednosti na kojoj je pobednik stao**.

## 4.3 Vraćanje 2 karte

- Dve karte se vraćaju **sakrivene** (ne vide se).
- Ako pobednik ne vrati 2 karte pre nego što se počne igra — **automatski pada**.
- Nije dozvoljeno vraćati karte koje pobednik drži samo privremeno — vracene karte se ne mogu vratiti u ruku.

---

# 5. PRAĆENJE (Dodjem / Ne dodjem)

## 5.1 Ko se izjašnjava

- U **svim igrama osim betla** (i igra-betla):
  - Igrač sa **desne** strane nosioca se izjašnjava prvi: **"Dodjem"** ili **"Ne dodjem"**.
  - Zatim **treći igrač**: **"Dodjem"** ili **"Ne dodjem"**.
- U **betlu i igra-betlu**: **svi automatski prate**. Nema izjašnjavanja.

## 5.2 Mogući ishodi praćenja

| Ishod                           | Posledica                                                       |
|---------------------------------|-----------------------------------------------------------------|
| Oba pratioca kažu "Dodjem"      | Igraju sva trojica.                                            |
| Jedan "Dodjem", drugi "Ne dodjem" | Igraju nosilac + taj pratilac. Drugi NE igra.                  |
| Oba "Ne dodjem"                 | **Partija se ne igra**. Nosilac automatski dobija **10 štihova**. |

## 5.3 Poziv ("Idemo zajedno")

- Pratilac koji je rekao "Dodjem" može pozvati onog koji je rekao "Ne dodjem": **"Idemo zajedno"**.
- Ako pozvani prihvati — igraju sva trojica kao **partneri** protiv nosioca.
- Pozvani igrač **ne upisuje bodove** ni za prolaz ni za pad — njegovi bodovi idu pratiocu koji ga je pozvao.

## 5.4 Niko ne prati — nosilac automatski dobija

Ako oba pratioca kažu "Ne dodjem":
- Partija se **ne igra**.
- Nosilac automatski dobija **10 uzetih štihova** (prolaz).
- Bodovanje:
  - **Nosilac se spušta** za `igra × 2` (prolaz, negativne bule).
  - **Pratioci ne pišu ništa** — ne dobijaju supe jer se štihovi nisu igrali.
- Ovo važi i za Igra-Betl/Sans, i za Betl/Sans.
- Ako je data kontra pre nego što su pratioci rekli "Ne dodjem" — vidi 6.8 (kontra uvek znači igru u troje, tako da ovo pravilo ne važi kad je kontra data).

---

# 6. KONTRA

## 6.1 Kontra

- **Nosilac** proglašava igru.
- Posle praćenja, **svaki pratilac** (onaj koji je rekao "Dodjem") koji veruje da će srušiti nosioca može dati **kontru**.
- Da bi dao kontru, pratilac mora reći ili **"Kontra"** (= imam kontru) ili **"Moze"** (= nemam kontru, ne mogu da srušim nosioca).

## 6.2 Uslov za prolaz kod kontre

- **Pratilac koji je dao kontru** mora, zajedno sa **drugim pratiocem**, uhvatiti **najmanje 5 štihova** da bi prošao.
- Ako ne uhvate 5 — kontraš pada.

## 6.3 Odgovornost kontraša

- Pratilac koji je dao kontru **snosi SVU odgovornost** — upisuje **sve negativne ili pozitivne bodove** zarađene protiv nosioca.
- Drugi pratilac (pozvan ili ne) **NE upisuje bodove** u kontri.

## 6.4 Rekontra

- Ako nosilac veruje da **neće pasti**, može dati **rekontru** na primljenu kontru.
- Svi bodovi se ponovo **množe sa 2**.

## 6.5 Subkontra i Mortkontra

- Posle rekontre:
  - Pratilac (kontraš) može dati **subkontru** (množenje ×2 ponovo).
  - Nosilac može uzvratiti **mortkontru** (množenje ×2 ponovo).

## 6.6 Multiplikatori

| Nivo            | Multiplikator |
|-----------------|---------------|
| Bez kontre      | 1             |
| Kontra          | 2             |
| Rekontra        | 4             |
| Subkontra       | 8             |
| Mortkontra      | 16            |

## 6.7 Obavezna kontra na pik

- Kada nosilac igra **standardni Pik** (ne Igra-Pik), **kontra je obavezna** od strane pratioca.
- To znači: ako pratilac veruje da može da sruši nosioca, **mora** dati kontru.
- Ako oba pratioca veruju da ne mogu da sruše, kažu "Moze" → primenjuje se pravilo iz 7.1.

## 6.8 Kontra kada niko ne prati

- Ako je data kontra, **igraju uvek sva trojica** — igrač koji je rekao "Ne dodjem" automatski postaje aktivan i dobija ruke.
- Ovo znači: **kontra uvek znači igru u troje** — nikad se ne dešava da kontraš igra sam protiv nosioca.

## 6.9 Igra-Betl i Igra-Sans — kontra

- U Igra-Betl i Igra-Sans: kontra je dozvoljena po istim pravilima.

---

# 7. REFA

## 7.1 Kad se piše refe

Refe se upisuje (i računa se kao "odigrana partija" sa specifičnim pravilima) u sledećim slučajevima:

1. **Svi igrači kažu "dalje"** u toku licitacije.
2. **Nosilac igra standardni Pik** i **nijedan pratilac ne da kontru** (tj. oba kažu "Moze").

## 7.1.1 Pik bez kontre — specijalno pravilo

Kada nosilac igra standardni Pik i nijedan pratilac ne da kontru (tj. oba kažu "Moze"):

- Ako **nosilac ima neiskorišćenih refe-a** → **piše se refe** (vidi 7.3).
- Ako **nosilac nema više refe-a** → **ništa se ne piše**.
- **IZUZETAK**: ako je **bar jedan igrač već u šeširu** (ima negativne bule) → piše se **regularan prolaz nosioca** (bez refe množenja).

## 7.2 Kad se refe NE piše

Refe se **NE piše** ako je ispunjen bilo koji od sledećih uslova:

- Igrač je već iskoristio **maksimalan broj refea**.
- **Bar jedan igrač ima negativne bule** (ispod kape) — vidi 7.1.1 za izuzetak na piku.

**Podrazumevani maksimalan broj refea po igraču**: **2 refea** za partiju od 100 bula (konfigurabilno pre partije).

## 7.3 Efekat refe

- **Svi bodovi** (bule i supe) se **množe sa 2** tokom partije pod refeom.
- Refe množilac se **množi sa multiplikatorom kontre** — npr. kontra (×2) + refe (×2) = ×4 ukupno.
- Posle odigrane partije pod refeom, nosilac partije **odpisuje** jedan svoj refe kao odigran.

## 7.4 Refe tokom kontre

- Ako je data kontra i istovremeno je aktivan refe, **množe se zajedno** (vidi 7.3).
- Npr. kontra (×2) + refe (×2) = svi bodovi se množe sa ×4.

---

# 8. IGRANJE PARTIJE

## 8.1 Ko igra prvi štih

Pravilo zavisi od tipa igre:

### 8.1.1 Standardne igre (Pik, Karo, Herc, Tref, Igra-Pik, Igra-Karo, Igra-Herc, Igra-Tref)

- **Prvi igrač je onaj koji je prvi licitirao** u krugu (obično P1).
- **Ako taj igrač ne igra** (nije pobedio u licitaciji), prvi igra **igrač sa njegove desne strane**.

### 8.1.2 Betl i Igra-Betl

- Isto kao 8.1.1 (prvo licitirao, ako ne igra onda desni od njega).

### 8.1.3 Sans i Igra-Sans

- **Prvi igrač je uvek pratilac sa leve strane nosioca** (suprotno od pravila 8.1.1).
- Ovo je specifično pravilo za sans.

## 8.2 Pravila štiha

1. **Prvi igrač** vodi bilo kojom kartom.
2. **Drugi igrač** mora **odgovoriti na boju** (pratiti istu boju ako ima).
3. **Treći igrač** (ako igra) isto mora odgovoriti na boju.
4. **Pobednik štiha** je onaj sa najjačom kartom prema pravilima 8.3.

## 8.3 Praćenje boje

### 8.3.1 Adutske igre

Ako igrač **ima** kartu u vođenoj boji — **mora** je odigrati.

Ako igrač **nema** kartu u vođenoj boji:
- Ako **ima adut** — **mora** odigrati adut.
- Ako **nema adut** — može odigrati bilo koju kartu.

### 8.3.2 Sans i Betl (bez aduta)

Ako igrač **ima** kartu u vođenoj boji — **mora** je odigrati.

Ako igrač **nema** kartu u vođenoj boji — može odigrati **bilo koju kartu**.

## 8.4 Određivanje pobednika štiha

### 8.4.1 Adutske igre

- Ako su u štihu **aduti** — pobednik je onaj sa **najjačim adutom**.
- Ako nema aduta — pobednik je onaj sa **najjačom kartom vođene boje**.

### 8.4.2 Sans i Betl

- Pobednik je onaj sa **najjačom kartom vođene boje**.
- Nema aduta.

## 8.5 Betl specifična pravila

- Nosilac betla **ne sme uzeti nijedan štih** da bi prošao.
- Ako uzme **bilo koji** štih — **pada**.
- **Pratioci** koji nisu dali kontru **ne padaju** u betlu, čak i ako uzmu 0 štihova.
- **Pratioci koji su dali kontra** — važe ista pravila kao u drugim igrama (5+ zajedno).

## 8.6 Kraj partije

- Partija ima **10 štihova** (3 igrača × 10 karata = 30 karata = 10 štihova).
- Posle 10. štiha prebrojavaju se štihovi po igraču i računa se prolaz/pad.

---

# 9. BODOVANJE

## 9.1 Početno stanje

- Svaki igrač dobija **100 bula** na početku partije (ili po dogovoru).
- Partija traje dok **zbir bula svih igrača ne postane 0** (tj. neko padne u minus, ali zbir ostane 0).

## 9.2 Bule — prolaz ili pad

Bule se računaju na osnovu proglašene igre:

```
prolaz = -igra * 2   (nosilac gubi bule)
pad    = +igra * 2   (nosilac dobija bule)
```

**Ko gubi/dobija bule**:
- Ako **nosilac prođe**: nosilac gubi `igra × 2` bule.
- Ako **nosilac padne**: nosilac dobija `igra × 2` bule.
- **Suprotničke bule** se menjaju u suprotnom smeru.

Pojedinačna raspodela bule među protivnicima zavisi od tipa igre i kontre — vidi 9.3, 9.4.

## 9.3 Raspodela bule među protivnicima

### 9.3.1 Bez kontre

- Ako nosilac prođe: nosilac gubi `igra × 2` bule. **Svaki pratilac dobija** `igra × 1` (tj. polovinu).
- Ako nosilac padne: nosilac dobija `igra × 2` bule. **Svaki pratilac gubi** `igra × 1`.
- **Izuzeci**:
  - Ako je **samo jedan** pratilac (drugi rekao "Ne dodjem"): taj jedan dobija/gubi celu vrednost `igra × 2`.
  - Ako je **pozvan** igrač — pozivalac snosi sve bodove (uključujući bule).
  - Ako je **kontra** data — kontraš snosi sve bodove.

### 9.3.2 Sa kontrama

- Množenje kontra/rekontra/subkontra/mortkontra (multiplikatori iz 6.6) se primenjuju na **bule** i **supe**.
- **Kontraš** snosi celokupnu promenu bule.

## 9.4 Supe

**Supe** su bodovi koje **pratioci** zarađuju protiv nosioca, na osnovu **svog broja uzetih štihova**.

```
supa = broj_uzeтih_štihova_ovog_pratioca × igra × 2
```

- Supe se **množe** sa multiplikatorom kontre (2, 4, 8 ili 16).
- Supe se **množe** sa multiplikatorom refe-a (×2) ako je partija pod refeom.
- Ako nosilac padne, njegovi uzeti štihovi **ne računaju se** kao supe za njega — supe su samo za pratioce.
- **Pozvani igrač** ne upisuje supe (sve ide pratiocu koji ga je pozvao).
- **Kontraš** upisuje sve supe (čak i one koje bi inače pripale drugom pratiocu).

### 9.4.1 Betl specifične supe

**Kad nosilac betla padne** (uzmeo ≥1 štih):

Svaki pratilac beleži **fiksnu vrednost** supe, bez obzira na broj uzetih štihova:

- Standardni Betl: **60 supa** po pratiocu
- Igra-Betl: **70 supa** po pratiocu

Ovo je ekvivalentno formuli `5 × igra × 2`, ali se **ne računa po stvarnim štihovima** — fiksno je.

Ako je data kontra, supe se množe sa multiplikatorom kontre (×2, ×4, ×8, ×16).

**Kad nosilac betla prođe** (uzeo 0 štihova):
- Nosilac dobija `betl × 2` (tj. 12) negativnih bula (prolaz).
- Pratioci ne zarađuju supe jer nisu uzeli štihove.

## 9.5 Kapa / sesir

- Kada igrač pređe sa pozitivnih bula u negativan saldo, kaže se da je **"ispod kape"** ili **"ispod sesira"**.
- Igrač ispod kape **ne može** da piše refe (vidi 7.2).

## 9.6 Otpisivanje (ako partija mora da se prekine)

Ako partija mora da se prekine pre nego što zbir bula postane 0, svi igrači **odpisuju** (umanjuju) bule tako da zbir postane 0.

**Algoritam**:
1. Izračunaj `total = zbir svih bula`.
2. Izračunaj `base = floor(total / 3)` i `ceiling = ceil(total / 3)`.
3. Ako je `total` deljiv sa 3 — svi otpisuju `base`.
4. Ako nije deljiv sa 3:
   - `remainder = total mod 3` igrača otpisuju `ceiling`.
   - `3 - remainder` igrača otpisuju `base`.
   - Igrači sa **najviše bula** (pozitivni saldo, najbolji) dobijaju `ceiling`.
   - Igrači sa **najmanje bula** (ili najviše u minusu, najgori) dobijaju `base`.

Ovo osigurava da posle otpisivanja, **igrač sa najlošijim bulama ostaje u najvećem minusu** (jer je najbliže nuli od početka, pa svako "zaokruživanje nagore" ide dalje u minus).

**Primer 15** (dokument): Nikola 24, Dusko 34, Milenko 28, zbir 86.
- base = 28, ceiling = 29, remainder = 2
- Sortirano silazno: Dusko (34), Milenko (28), Nikola (24)
- Dusko 29, Milenko 29, Nikola 28 ✓

**Primer 16** (dokument): Nikola 8, Dusko 2, Milenko 0, zbir 10.
- base = 3, ceiling = 4, remainder = 1
- Sortirano silazno: Nikola (8), Dusko (2), Milenko (0)
- Nikola 4, Dusko 3, Milenko 3 ✓

> **Napomena**: Tekst u originalnom dokumentu ("igrac sa najlosijim bulama se uvek spusta malo vise") je nejasan — potvrđeno kroz testove da znači "ostaje u većem minusu" (= manji otpis), a ne "gubi više bula".

---

# 10. FINALNI REZULTAT

Kada partija završi (zbir bula = 0), svaki igrač računa svoj **finalni rezultat**:

```
finalni_rezultat = -supa_protiv_protivnika + supe_od_protivnika + finalni_broj_bula × 10
```

**Interpretacija**:
- Rezultat **ispod nule je dobar** (igrač je u plusu).
- Rezultat **iznad nule je loš** (igrač je u minusu).

---

# 11. ODNOS PROTIVNIKA

- Pratioci igraju **kao partneri** protiv nosioca.
- Pozvani igrač ili kontraš **igraju da pomognu** pratiocu.
- Svaka odigrana karta treba da **pomogne pratiocu** (ili kontrašu ako je data kontra).
- Nosilac igra **samo za sebe** (nema partnera).

---

# 12. DOGOVORI (OPCIONO — IGRAČI SE MOGU DOGOVORITI PRE PARTIJE)

Ova pravila su **opciona** i **nisu podrazumevana** u osnovnoj verziji engine-a. Igrači ih mogu uključiti pre početka partije:

- Licitacija na 2/3/4/5 zahteva minimum 3 aduta.
- Licitacija na 2/3/4/5 zahteva 3 aduta sa najjačom kartom Q, K ili A.
- Sans bez kontre: ako je prvi, igrač koji je pozvan kreće iz trefa.
- Sans sa kontrе: ako je prvi, igrač koji nije dao kontru kreće iz (1) pika ili (2) boje do koje je kontraš licitirao.
- Kad igrač kaže da polaže na pik, mora imati bar 2 asa, ili adutski štih i asa.

Engine u prvoj verziji **ne primenjuje ove dogovore** — oni su dokumentovani ovde za buduću konfigurabilnost.

---

# ODLUKE (ZAKLJUČANA PRAVILA)

Ova sekcija beleži **sve odluke** donete tokom diskusije o nejasnim pitanjima u dokumentu. Smatraju se **finalnim** za ovu verziju engine-a.

## Pitanje 1 → A
**Prioritet "Igra" kad dva igrača prijave istu igru**

**Izbor**: A — prvi koji je rekao "Igra" dobija.

## Pitanje 2 → A
**"Igra Betl" / "Igra Sans" u toku licitacije**

**Izbor**: A — igra bez talona (kao "Igra" u 3.4). Igrač ne uzima talon i igra sa onim što ima.

## Pitanje 3 → C
**Trenutak davanja kontra/rekontre**

**Izbor**: C — kontra/rekontra se daju **posle proglašenja igre** (kad su karte već spremne, posle odbacivanja 2 karte).

## Pitanje 4 → specijalno pravilo
**Pik bez kontre**

**Izbor**:
- Ako nosilac ima neiskorišćenih refe-a → piše se refe.
- Ako nema → ništa se ne piše.
- **Izuzetak**: ako je bar jedan igrač već u šeširu (negativne bule) → piše se regularan prolaz nosioca (bez refe množenja).

## Pitanje 5 → B
**"Automatski polazi" kod kontre**

**Izbor**: B — kad je data kontra, **uvek se igra u troje**. Igrač koji je rekao "Ne dodjem" automatski dobija ruke i aktivno igra.

## Pitanje 6 → 2 (konfigurabilno)
**Maksimalan broj refea po igraču**

**Izbor**: Podrazumevano **2 refea** za partiju od 100 bula. Konfigurabilno (stvar dogovora pre partije).

## Pitanje 7 → A
**Refe × kontra**

**Izbor**: A — refe i kontra se množe zajedno (npr. kontra × refe = ×4 ukupno).

## Pitanje 8 → posebno pravilo
**Niko ne prati — nosilac dobija 10 štihova**

**Izbor**:
- Nosilac se spušta za `igra × 2` (prolaz, negativne bule).
- Ostali ne pišu ništa (ne dobijaju supe jer se partija nije igrala).
- Primer: nosilac igra karo (vrednost 3) → nosilac -6 bula, ostali 0.

## Pitanje 9 → A
**Betl supe — fiksno ili zavisi od štihova**

**Izbor**: A — **fiksno 60 supa** (Betl) ili **70 supa** (Igra-Betl) po pratiocu kad nosilac betla padne, bez obzira na broj uzetih štihova pratioca.

## Pitanje 10 → opcioni predlozi
**DOGOVORI iz poglavlja 16**

**Izbor**: Poglavlje 16 (DOGOVORI) ostaje u dokumentu kao **opcioni predlozi** — ne podrazumevaju se u osnovnoj verziji engine-a. Igrači ih mogu uključiti pre partije.

---

# DODATAK A: PRIMERI IZ DOKUMENTA

## A.1 Bule — primeri

**Primer 4**: Milenko prošao na trefu (vrednost 5). Dusko pao, Nikola prošao.
- Milenko: -10 bula (5 × 2)
- Dusko: +5 bula (polovina od 10)
- Nikola: 0 (nije kontraš, ali je prošao — ne dobija negativne ni pozitivne)

**Primer 5**: Milenko prošao na Igra-Karo (vrednost 4). Dusko prošao, Nikola pao.
- Milenko: -8 bula (4 × 2)
- Dusko: 0
- Nikola: +4 bule

**Primer 6**: Milenko prošao na Betl (vrednost 6). Igor dao kontru i pao.
- Množenje: kontra = ×2
- Milenko: -24 bula (6 × 2 × 2)
- Igor: +24 bula (snosi sve kao kontraš)
- Dusko: 0 (pozvan, ne upisuje)

## A.2 Supe — primeri

**Primer 9**: Milenko uhvatio 6 štihova na trefu. Dusko i Nikola pratili, svaki uhvatio po 2.
- Dusko: 2 × 5 × 2 = 20 supe protiv Milenka
- Nikola: 2 × 5 × 2 = 20 supe protiv Milenka

**Primer 10**: Milenko uhvatio 6 štihova na trefu. Dusko uhvatio 3, Nikola 1.
- Dusko: 3 × 5 × 2 = 30 supe
- Nikola: 1 × 5 × 2 = 10 supe

**Primer 11**: Milenko uhvatio 7 štihova na hercu. Dusko zvao Nikolu, zajedno uhvatili 3.
- Dusko: 3 × 4 × 2 = 24 supe (sve, jer je pozvao)
- Nikola: 0 (pozvan, ne upisuje)

**Primer 12**: Sekula pao na kontru Igra-tref (refe). Jasmina dala kontru.
- Sekula: 5 × 6 × 2 × 2 = 120 supe (5 uzetih štihova, Igra-Tref=6, ×2 za supe, ×2 za kontra, ×2 za refe)

**Primer 13**: Filip pao na rekontru Igra-pik na refeu. Igor dao kontru.
- Igor: 5 × 3 × 2 × 4 × 2 = 240 supe (5 štihova, Igra-Pik=3, ×2 supe, ×4 rekontra, ×2 refe)

## A.3 Otpisivanje — primeri

**Primer 14**: Nikola 20, Dusko 30, Milenko 40. Zbir = 90. Svi otpisuju 30.
- Nikola: -10
- Dusko: 0
- Milenko: 10

**Primer 15**: Nikola 24, Dusko 34, Milenko 28. Zbir = 86 (nije deljiv sa 3).
- Nikola: -28, Dusko: -29, Milenko: -29

**Primer 16**: Nikola 8, Dusko 2, Milenko 0. Zbir = 10 (nije deljiv sa 3).
- Nikola: -4, Dusko: -3, Milenko: -3

---

# KRAJ DOKUMENTA

Verzija RULES.md: 1.0
Izvor: Preferans Pravila v1.2 (26. oktobar 2001)
Status: **Sva otvorena pitanja rešena** (sekcija "ODLUKE").

Sledeći korak: implementacija `engine/` modula na osnovu ovog dokumenta.
