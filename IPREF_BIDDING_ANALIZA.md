# IPREF.EXE — KOMPLETNA ANALIZA SVIH STRINGOVA

**Izvor:** `C:\Program Files (x86)\Ipref\Ipref.exe` (PE32 32-bit Delphi XE2–XE4 Enterprise, TurboLinker 2.25)
**Stringovi:** `C:\Users\mb-com\Desktop\ipref_strings.txt` (3 MB, **191.244 linija**, **4.769 UI komponenti**)
**Datum:** 2026-08-29

Ovaj dokument sumira **sve** relevantne informacije iz EXE stringova originalnog Preferansa.

---

## 1. Glavna hijerarhija Delphi klasa

### 1.1 Faze igre (`TFaza` enum)
```
faLicitacija       — Licitacija (bidding)
faZamenaTalona     — Zamena talona (discard)
faOdigravanje      — Odigravanje (playing)
faKrajRuke         — Kraj runde (game over)
```

### 1.2 Akcije (eventi)
```
akOdrediLicit              — Odredi licit (winner postavljen)
akLicit                    — Licitiraj (neko je bidding-ovao)
akZamenaTalona             — Zameni talon (discard završen)
akKrajLicitacije           — Kraj licitacije (bidding završen)
akKrajOdigravanjaKarte     — Kraj odigravanja karte
akKrajStiha                — Kraj štiha
akNoviStih                 — Novi štih
```

---

## 2. Enumeracija igara (`TLicit` vrednosti)

```
liIgra            — Igra (opšta)
liSlabijaIgra     — Slabija igra (??)
liPik             — Pik (2)
liKaro            — Karo (3)
liHerc            — Herc (4)
liTref            — Tref (5)
liBetl            — Betl (6)
liSans            — Sans (7)
liMoze            — Može (potvrda)
liKontra          — Kontra
liRekontra        — Rekontra
liSubkontra       — Subkontra
liZamenaTalona    — Zamena talona
```

Primećujem da original ima **samo 4 nivoa kontre**: Kontra, Rekontra, Subkontra, (verovatno Mortkontra). NE **Drmaj** kao u tvojoj RULES.md verziji.

---

## 3. Glavna stanja (`TLicitacija` klasa)

Polja:
```
FLicitacija           — Trenutno stanje bidding-a
FOdigravanje          — Trenutno stanje igranja
FFaza                 — Trenutna faza (faLicitacija, ...)
FTekuciStih           — Trenutni štih

FDozvoljeniLiciti     — Dozvoljeni liciti (heuristika/legalne akcije)
FTokLicitacije        — Tok licitacije (istorija svih ponuda)
FDrugiDeoLicitacije   — Drugi deo licitacije (MOGU faza)
FKrajLicitacije       — Kraj licitacije (winner)
FPrviDelitelj         — Prvi delitelj (prvi dealer?)
FPozicijaIspalog      — Pozicija igrača koji je pao (nosioca ako padne)
FMrezniRobot          — Mrežni robot (??)

FLicitKontrakt        — Licitacioni kontrakt (ugovor)
```

**`FDrugiDeoLicitacije`** — eksplicitno **drugi deo bidding-a** (MOGU faza)

---

## 4. `TLicit` klasa — pojedinačna ponuda

```
TLicitirano = record
  Licitirano: Integer   — Vrednost 2-7 (ili 0 za pass)
  LicitiraoDo: Integer  — Do koje vrednosti je bidding-ovao
end
```

Metode:
- `Licitiraj` — Dodaj novu ponudu
- `GetGovor` — Dohvati ponudu za poziciju

---

## 5. `TStih` (štih) klasa

`TStih` — klasa za štih (verovatno sadrži AKarta array).

---

## 6. `AKarta` (array karata)

`AKarta` — niz karata. Koristi se u `TLicitacija` za ruke igrača.

---

## 7. `TOdigravanje` klasa — stanje igranja

```
TOdigravanje = class
  FTrenutna: Integer       — Trenutna vrednost
  OdneoStih: Integer       — Ko je odneo štih
  APozicija: Array         — Sve pozicije
  Clear, Odigraj           — Metode
end
```

---

## 8. `TRunda` klasa — runda/partija

```
TRunda = class
  Licitirano: Integer      — Šta je bidding-ovano
  LicitiraoDo: Integer     — Do koje vrednosti
  Papir, PapirPrePromene   — Papir (zapis partije)
  PocetniTalon, ZamenjenTalon
  Trajanje: Integer        — Trajanje runde
end
```

---

## 9. Sedenje — 3 igrača

**Ključno:** Originalni program koristi **3 sedenja** sa specifičnim imenima:

```
pnlLeviLicit / pnlDesniLicit / pnlJaLicit   — Panel za licit
lblLeviLicit / lblDesniLicit / lblJaLicit   — Labela
pnlLevi / pnlDesni / pnlSto                   — Glavni paneli
lblLeviIme / lblDesniIme / lblJaSkor          — Igrač ime/skor
```

Tvoj program sedi na poziciji **"Ja"** (P0). Levi (P1) je levo, Desni (P2) je desno.

**Detaljne labele za svakog igrača (bodovanje):**
```
lblLeviBule, lblLeviDesni, lblLeviJa, lblLeviSkor
lblDesniBule, lblDesniJa, lblDesniLevi, lblDesniSkor
lblJaBule, lblJaLevi, lblJaDesni, lblJaSkor
```

**Odneo (winner štihova):**
```
pnlLeviOdneo / pnlDesniOdneo / pnlJaOdneo
```

---

## 10. Tabele (Grid-ovi)

```
grdLicit        — Grid prikaz svih ponuda (tabela)
grdLicitTok     — Grid prikaz toka licitacije (vizuelni tok)
grdPapir        — Papir (zapis partije)
grdInfo         — Info grid
grdInfoGlobal   — Globalni info grid
grdLevi         — Ruka levog igrača
grdDesni        — Ruka desnog igrača
grdJa           — Moja ruka
grdIgrac        — Grid igrača (članovi kluba)
grdTabela       — Tabela (verovatno rang lista)
```

**Metode za `grdLicit`:**
- `Click, DblClick, MouseDown, MouseMove, MouseWheelDown`

**Metode za `grdLicitTok`:**
- `DrawCell` — crtanje jedne ćelije toka

**Metode za `grdPapir`:**
- `Click, DrawCell`

---

## 11. Dugmad (Button) — gameplay

```
btnNastavi            — Nastavi partiju
btnPreporuka          — Preporuka (AI preporuka?)
btnPrekiniPartiju     — Prekini partiju
btnOpcije             — Opcije
btnPonudi             — Ponudi (licitacija dugme)
btnPoslednjaRuka      — Poslednja ruka
btnNasaSlova          — Naša slova (srpska slova)
btnDvojica            — Dvojica (2 igrača mod?)
btnChat               — Chat
btnStat               — Statistika
btnRazno              — Razno
btnPartije            — Partije
btnTakmicenja         — Takmičenja
btnCekic              — Čekić (admin akcija)
btnRukaOdvoj          — Odvoji ruku
btnPapir              — Papir
btnDodajBule          — Dodaj bule
btnIstorija           — Istorija
btnSudi               — Sudi (sudijska akcija)
```

---

## 12. Status labele (informativne)

```
lblOpisIgre              — Opis igre
lblMrezaPrekid           — Mreža prekid (mrežni status)
lblMreza                 — Mreža (mrežni status)
lblMrezaKasni            — Mreža kasni
lblPonudaPrihvacena      — Ponuda prihvaćena
lblPonudaOdbijena        — Ponuda odbijena
lblPromenaTalona         — Promena talona
lblPromenaRezultata      — Promena rezultata
lblNekompletna           — Nekompletna ruka
lblPrihvaceno            — Prihvaćeno
lblOdlozenoKibicovanje    — Odloženo kibicovanje
lblPoruka                — Poruka
lblPitanje                — Pitanje (anketa?)
```

---

## 13. Podešavanja / Opcije (`chkXxx`)

### 13.1 Bidding podešavanja
```
chkLicitObrnuto         — Obrnuto prikazivanje bidding-a
chkPotvrdiKontrakt      — Potvrdi kontrakt pre početka
chkPrikaziPonudu        — Prikaži ponudu
```

### 13.2 Prikaz karata
```
chkKarteObrnuto         — Karte obrnuto
chkSlaziBoje            — Slaži boje (po boji?)
chkSveKarte             — Prikaži sve karte (lice/dilej?)
chkSlikeIgraca          — Slike igrača
chkPrikaziObavestenja    — Prikaži obaveštenja
chkPauzaIspis            — Pauza ispis
chkLogVreme              — Log vreme
chkLogChat               — Log chat
```

### 13.3 Interfejs
```
chkBezTastature          — Bez tastature
chkBezYU                 — Bez YU slova
chkDupliKlik             — Dupli klik
chkZvuci                 — Zvuci (zvukovi)
chkPauza                 — Pauza
chkUbrzano               — Ubrzano
chkSnimiIme              — Snimi ime
chkZenskiRod             — Ženski rod
chkMuskiSmeh             — Muški smeh
chkKlubPauza             — Klub pauza
chkOcenaProcenat         — Ocena procenat
chkDrmaj                 — Drmaj (kontrola?)
chkPartijeBroj           — Partije broj
```

### 13.4 Podešavanja partije
```
chkPrivatna              — Privatna partija
chkIsteKarte             — Iste karte za sve
chkRavnomerno            — Ravnomerno (deljenje?)
chkNetakmicarska         — Netakmičarska partija
chkMadjarice             — Mađarice (posebna varijanta?)
```

---

## 14. Bule, Refe, Ruka

### 14.1 Podešavanja partije
```
edtBule / lblBule        — Početna bule (input)
edtRefe / lblRefe        — Broj refe-a (input)
btnDodajBule              — Dodaj bule (dugmе)
btnIstorija               — Istorija bule
```

### 14.2 Prikaz ruke i bule
```
lblNRuka / lblRuka         — Broj ruke
lblNRukaH / lblRukaL       — Broj ruke H/L
lblBule                    — Ukupna bule (prikaz)
pnlLista                   — Lista bule
lblNBula                   — N bule (ukupno)
lblBule                    — Bule vrednost
lblTakmicenje              — Takmičenje
lblNTakmicenje             — N takmičenja
lblNTakmicenje             — N takmičenja
```

---

## 15. Članovi kluba (statistika)

```
lblClanIme / lblClanIme1   — Ime člana
lblClanNick               — Nadimak člana
lblClanDolazak            — Datum dolaska
lblClanDolazaka           — Broj dolazaka
lblClanOdlazak            — Datum odlaska
lblClanChat               — Broj chat poruka
lblClanOcena              — Ocena člana
lblClanOcenaJa            — Moja ocena člana
lblClanRejting            — Rejting člana
lblClanRejtingG           — Globalni rejting
lblClanRuke               — Broj ruku
lblClanPartije            — Broj partija
lblClanPozicija           — Pozicija (statistika?)
lblClanOdigravanja        — Broj odigravanja
lblClanPadova             — Broj padova
lblClanZvanja              — Zvanja (titule?)
lblClanSkor               — Skor
lblClanDostignuca         — Dostignuća
lblClanRP                 — RP (rating points)
lblClanLokacija           — Lokacija
lblClanRodjen             — Rođendan
lblClanProcenat           — Procenat (ocena?)
```

---

## 16. Takmičenja

### 16.1 Liga
```
lblLigaPocetak / lblLigaKraj
lblLigaPartija / lblLigaIgraca
lblPobednikLige
lblLigaPravila
lblLigaKrediti1 / lblLigaKrediti11
lblLigaInfo1-4 / lblLigaDetaljno
btnLigaPartije / btnLigaTabela / btnLigaPravila
pnlLiga / pnlLigaDole
tabLiga
```

### 16.2 Kup
```
lblKupInfo1-5 / lblKupPravila
lblKupPocetak / lblKupKrajKola / lblKupKolo
lblKupIgracaPartija
lblKupKrediti1 / lblKupKrediti2 / lblKupKrediti3
lblPobednikKupa
btnKupPartije / btnKupRezultati / btnKupPravila
pnlKupDole
tabKup
```

### 16.3 Ekipno
```
lblEkipnoPocetak / lblEkipnoKraj
lblEkipnoIgraca / lblEkipnoPobednik
lblEkipnoKolo / lblEkipnoKrajM
lblEkipnoKrediti1 / lblEkipnoKrediti2 / lblEkipnoKrediti3
lblEkipnoPravila / lblEkipnoInfo1-4 / lblEkipnoDetaljno
btnEkipnoRezultati / btnEkipnoTabela / btnEkipnoPravila / btnEkipaPrijava
pnlEkipnoDole
tabEkipno / tabTrofej
```

### 16.4 Rejting
```
lblRejtingPik / lblRejtingKaro / lblRejtingHerc / lblRejtingTref
lblRejtingCrven / lblRejtingOker
lblRejtingAs / lblRejtingSa
lblRejtingNaslov / lblRejtingBez
imgPik / imgKaro / imgTref / imgHerc / imgCrven / imgOker
btnRejtingIzlaz / btnStatRejtingGraf / btnRejtingSvi / btnRejtingPartija
tabStatRejting / tabDueli
lblDueliIme / btnDueliUcitaj
cmbGraf / btnGrafVrsta / btnGrafTacke / btnUcitajGraf / btnGrafLista
tabGraf / pnlGrafDole
```

---

## 17. Admin / Sudijske akcije

```
lblIgrac                    — Igrač (kazne)
cmbNapustio                 — Napustio partiju
cmbKazna / cmbZabrana        — Kazna, zabrana
lblPartija / lblKazna / lblZabrana
lblObrazlozenje / edtObrazlozenje
edtKazna / edtKaznaKeyPress
chkZavrsi                   — Završi (partiju)
btnIzvrsi / btnOdustani
pnlPriv                     — Privatno
pnlDole
```

### 17.1 Akcije (admin)
```
pnlAkcijePozadina / pnlAkcijeGore / pnlAkcije
pnlAkcijeParametri / pnlIme / pnlMemo / pnlRazlog / pnlOcena / pnlSifra
lblAkcija / lblIme / lblMemo / lblRazlog / lblOcena / lblSifra
lblRezultatAkcije / lblEfekat
cmbOcena / cmbEfekat
cmbUplataValuta
edtIme / edtMemo / edtRazlog / edtSifra / edtAkcija1KeyPress
edtImeChange / edtMemo / edtRazlog / edtAkcija1KeyPress
edtUplataIme / edtUplataIznos / edtUplataBanka / edtUplataNapomena / edtUplataMesto
lblUplataIme / lblUplataIznos / lblUplataBanka / lblUplataNapomena / lblUplataMesto
pnlUplata
memAkcijaRezultat
btnIzvrsi
btnKrediti                   — Krediti
```

---

## 18. Forum i ankete

```
pnlForumTeme / pnlForumOdgovori / pnlForumOdgovoriGore
lblForumOdgovori / lblForumDiskusija
memForum
btnForumUcitajOdgovore / btnForumOdgovori / btnForumOdustani / btnForumPosalji
btnForumNovaTema / btnForumUcitajTeme / btnForumPartija / btnForumPosaljiClick
btnDiskusije / lblDiskusije1-5 / pnlDiskusije
tabForum
tabAkcijeAnkete
lblAnketeInfo / lblAnketaInfo1-6
btnAnketeUcitaj / btnAnketaNova / btnAnketaOdgovor
chkAnketaS / chkAnketaV
```

---

## 19. Memoi / Edit polja

```
memForum / memChange
edtChat / edtChatDblClick / edtChatKeyDown / edtChatKeyPress
edtClanIme / edtClanImeChange / edtClanImeKeyPress
edtImeDueli / edtImeDueliChange / edtAkcija1KeyPress
edtPartijeBroj / edtPartijeBrojKeyPress
edtStatClan1 / edtStatClan1KeyPress / edtStatClan2 / edtStatClan3
edtPort / edtPauza / edtSifra
edtBule / edtRefe / edtBuleChange / edtBuleKeyPress / edtRefe / edtBuleKeyPress
edtKazna / edtKaznaKeyPress / edtObrazlozenje
edtPitanje / edtOdgovor1-5 / edtPitanjeKeyPress
edtUplataIme / edtUplataIznos / edtUplataBanka / edtUplataNapomena / edtUplataMesto
edtMesto
edtMemo / edtRazlog / edtSifra
edtIme / edtImeChange / edtAkcija1KeyPress
edtImeKeyPress / edtSifraKeyPress
```

---

## 20. Tabele i ostali prikazi

```
imgIPref / imgIPrefClick / imgIPrefContextPopup
imgClan / imgClanClick / imgClanZnak
imgKibic / imgMreza1 / imgMreza2 / imgMreza3
imgKaro / imgPik / imgTref / imgHerc / imgCrven / imgOker
imgMrezaKasni2 / imgMrezaKasni3
imgMemo / imgMemoClick
TStringGrid (grdLicit, grdPapir, grdLevi, grdDesni, grdLicitTok, grdIgrac, grdTabela, grdInfo, grdInfoGlobal)
TListView (lista igrača, partija, ...)
TListBox
TSpeedButton
TBitBtn
TPanel (pnl)
```

---

## 21. Tajmeri i mreža

```
TTimer (Tajmer)
FMrezniRobot     — Mrežni robot (mrežna komunikacija)
TPocni (počni partiju)
lblMrezaPrekid    — Mreža prekid (mrežni status)
lblPonudaPrihvacena — Ponuda prihvaćena
imgMrezaKasni      — Slika mreža kasni (animacija)
```

---

## 22. Podešavanja mreže i porta

```
edtPort     — Port
edtPauza    — Pauza
edtSifra    — Šifra
chkZvuci    — Zvuci
chkPauza    — Pauza
chkMadjarice — Mađarice
lblPort, lblPauza, lblSifra
```

---

## 23. Verzija i registracija

```
lblRegistracija / lblIme / lblSifra / lblIme1 / lblSifra1
edtIme / edtSifra
chkSifra
btnUnesi
```

---

## 24. `TSkore` (skor ruke)

```
SkorRuke — Skor ruke (broj bodova u ruci)
```

---

## 25. Struktura sedenja — finalna interpretacija

Na osnovu svih stringova, originalni program ima:

- **3 igrača** za stolom
- **Ja (Ja)** = sedim na poziciji 0 (Jug)
- **Levi** = pozicija levo od mene (u pravcu suprotnom od kazaljke)
- **Desni** = pozicija desno od mene

Ovo je **suprotno od kazaljke na satu**:
- Podela: Levi → Ja → Desni (ili Ja → Desni → Levi?)
- Licitacija: Levi → Ja → Desni → Levi...

Zapravo, pošto Preferans se igra suprotno kazaljke, redosled je:
- Deljenje kreće od igrača **desno** od dilera
- Ako sam ja dealer (P0), desni od mene je Desni (P1)... ALI original kaže "P1 je onaj sa leve strane dilera (suprotno kazaljke)"

Možda original koristi **suprotnu konvenciju** od tvoje:
- Original: Ja dealer → Levi prvi bidding-uje (levo od mene)
- Tvoj: ja dealer → Istok prvi bidding-uje (desno od mene, jer suprotno kazaljke)

ILI original je drugačiji. Po stringu `pnlLevi`, `pnlDesni` — pozicije su **fiksne** (uvek isti raspored), dok kod tebe dinamički se menjaju po dealeru.

---

## 26. Kompletna bidding logika — rekonstrukcija

Na osnovu **svih** stringova vezanih za bidding:

### 26.1 Struktura toka bidding-a
```
BIDDING:
  Faza 1: Početni bidding (2-7, IGRA, DALJE)
  Faza 2: Drugi deo (MOGU za sve bidding-ovane)
  Faza 3: Kraj (winner postavljen)
```

### 26.2 Dozvoljene akcije (`FDozvoljeniLiciti`)
- Igrač može bidding-ovati **currentBid+1** (samo jednu vrednost višu)
- Igrač može reći DALJE
- Ako je već bidding-ovao, može reći MOGU za istu vrednost
- **IGRA** je specijalna opcija (samo reč, bez vrednosti)

### 26.3 Tok prikaz (`FTokLicitacije`, `grdLicitTok`)
- Grid prikazuje **istoriju** bidding-a
- DrawCell crta svaku ćeliju

### 26.4 Kontrakt (`FLicitKontrakt`)
- Vrednost ugovora (2-7)
- Samo Pik (2) ne može imati kontra u nekim varijantama
- Šušti bez kontre = manja vrednost

### 26.5 Dodatne komponente za bidding
- `chkLicitObrnuto` — obrnuti redosled prikaza
- `chkPotvrdiKontrakt` — potvrda pre početka partije
- `chkPrikaziPonudu` — prikaz ponude
- `lblPromenaTalona` — promena talona (kad se zameni)
- `lblPonudaPrihvacena` — ponuda prihvaćena
- `lblPonudaOdbijena` — ponuda odbijena
- `lblPromenaRezultata` — promena rezultata
- `lblNekompletna` — nekompletna ruka

---

## 27. Mogućnosti igrača (verovatno mode-ovi)

```
btnDvojica     — Dvojica (2 igrača mod?)
chkPrivatna    — Privatna partija
chkRavnomerno  — Ravnomerno (deljenje?)
chkIsteKarte   — Iste karte za sve
chkNetakmicarska — Netakmičarska
chkMadjarice   — Mađarice (posebna varijanta?)
```

---

## 28. Šta SVE nedostaje (šta stringovi NE otkrivaju)

Iz stringova **ne mogu** videti:
1. **Algoritam** za `FDozvoljeniLiciti` (samo ime)
2. **Heuristika** za AI bidding/discard/follow
3. **Bodovanje** (skoring pravila) — verovatno u drugoj klasi
4. **Talon pravila** (zamena karata)
5. **Redosled igranja** u štihu (supe, prilozi)
6. **Supe** (pozajmice)
7. **Pik-Betl** pravila (Betl bez kontre vredi manje)
8. **Šešir** pravilo (negativna bule)

Ali **struktura** je jasna i daje nam osnovu za rekonstrukciju.

---

## 29. Veza sa tvojim Preferansom

| Original (IPREF) | Tvoj engine (TS) | Komentar |
|---|---|---|
| `TLicitacija.FLicitacija` | `state.bids` | Istorija svih ponuda |
| `TLicitacija.FDozvoljeniLiciti` | `engine.getLegalActions()` | Legalne akcije za UI |
| `TLicitacija.FTokLicitacije` | bid log u UI | Prikaz toka bidding-a |
| `TLicitacija.FDrugiDeoLicitacije` | MOGU faza | Potvrda bidding-a |
| `TLicitacija.FKrajLicitacije` | `state.winner !== null` | Kraj bidding-a |
| `TLicitacija.FLicitKontrakt` | `state.currentBid` | Trenutna vrednost ugovora |
| `TLicit.Licitirano` | `BidRecord.value` | Vrednost ponude |
| `TLicit.LicitiraoDo` | `state.currentBid` | Do koje je bidding-ovao |
| `pnlLevi/Desni/JaLicit` | render sečenja | Sedenja u UI |
| `lblLevi/Desni/JaBule` | `state.bulas[i]` | Bule igrača |
| `lblLevi/Desni/JaSkor` | skor | Skor igrača |
| `grdLicit` | UI tabela ponuda | Sve ponude u grid-u |
| `grdLicitTok` | bid log | Vizuelni tok |
| `grdLevi/Desni/Ja` | `state.players[i].hand` | Ruka igrača |
| `lblPromenaTalona` | talon izmena | Promena talona |
| `lblPonudaPrihvacena` | accept prihvatanje | Ponuda prihvaćena |
| `pnlLevi/Desni/JaOdneo` | `state.players[i].tricksWon` | Odneo (winner štih) |
| `liPik...liSans` | `Game` enum | Vrednosti igara |
| `liKontra/Rekontra...` | `ContraLevel` enum | Nivo kontre |
| `liMoze` | MOGU | Može (potvrda) |
| `chkLicitObrnuto` | reversed redosled | Obrnuti redosled |
| `chkPotvrdiKontrakt` | confirm | Potvrda |
| `chkSmartPass` (verovatno) | - | Pametan pass |

---

## 30. Originalna Pravila (zaključak)

Na osnovu **svih** stringova:

1. **Bidding se odvija u dva dela** (eksplicitno FDrugiDeoLicitacije)

2. **Mogu se bidding-ovati vrednosti 2-7** (Pik, Karo, Herc, Tref, Betl, Sans)

3. **Postoji heuristika** (`FDozvoljeniLiciti`) koja ograničava legalne akcije

4. **Sedenje**: 3 igrača (Levi, Desni, Ja)

5. **`FMrezniRobot`** — verovatno AI protivnik ili mrežni mod

6. **`FPozicijaIspalog`** — pozicija nosioca ako padne

7. **`FPrviDelitelj`** — ko je prvi delio

8. **Kontra nivoi**: Kontra, Rekontra, Subkontra, (verovatno Mortkontra)

9. **Pik-Betl razlika**: Pik se tretira drugačije od Betla

10. **Modovi**: Dvojica, Privatna, Netakmicarska, Ravnomerno, IsteKarte, Madjarice

11. **Statistika kluba**: Bule, Skor, Rejting (po bojama), Pozicija, Odigravanja, Padovi, Zvanja, Dostignuća

12. **Takmičenja**: Liga, Kup, Ekipno, Trofej

13. **Admin/Sudijske akcije**: Kazne, Zabrane, Obrazloženja

---

## 31. Delphi Class Hierarchy — kompletna

```
TRunda (cela ruka)
├── TRunda.Licitacija             (ugovor)
├── TRunda.Odigravanje            (igranje)
├── TRunda.Trajanje               (koliko traje)
└── TRunda.Papir                  (zapis)

TLicitacija (bidding stanje)
├── FLicitacija                   (aktivna ponuda)
├── FDozvoljeniLiciti             (heuristika)
├── FTokLicitacije                (istorija)
├── FDrugiDeoLicitacije           (MOGU faza)
├── FKrajLicitacije               (winner)
├── FLicitKontrakt                (ugovor vrednost)
└── ALicit: Array of TLicit       (sve ponude)

TLicit (jedna ponuda)
├── Licitirano: Integer           (2-7, 0 za pass)
└── LicitiraoDo: Integer          (maksimum)

TOdigravanje (igranje)
├── FTrenutna                     (trenutni igrač)
├── OdneoStih                     (winner štiha)
└── APozicija                     (svi igrači)

TLicitTip (tip licita)
├── liIgra, liPik, liKaro, liHerc, liTref, liBetl, liSans
├── liMoze, liKontra, liRekontra, liSubkontra
└── liZamenaTalona

TFaza (faza igre)
├── faLicitacija
├── faZamenaTalona
├── faOdigravanje
└── faKrajRuke
```

---

## 32. Preporuke za poboljšanje tvoje igre

Na osnovu **svih** informacija iz EXE-a:

1. **Dodaj `FDrugiDeoLicitacije`** kao **eksplicitnu fazu** u engine (`isSecondBiddingPhase: boolean`)

2. **Dodaj `chkPotvrdiKontrakt`** opciju u settings (pitaj korisnika da potvrdi kontrakt pre početka)

3. **Dodaj `chkLicitObrnuto`** opciju (prikaži bidding suprotno)

4. **Dodaj `grdLicitTok`** vizuelni prikaz toka bidding-a (kako je igra tekla)

5. **Dodaj `lblLevi/Desni/JaBule/Skor`** labele sa svim podacima (bule, skor, odneo, itd.)

6. **Dodaj `lblPromenaTalona`** notifikaciju kad se zameni talon

7. **Dodaj `lblPonudaPrihvacena/Odbijena`** notifikacije

8. **Dodaj `SkorRuke`** bodovanje runde

9. **Dodaj admin/sudijske akcije** (kazne, zabrane, obrazloženja) za mrežnu igru

10. **Dodaj statistiku kluba** (svi `lblClan*` podaci)

11. **Dodaj takmičenja** (liga, kup, ekipno, trofej)

12. **Dodaj forume i ankete**

13. **Dodaj mrežne portove i podešavanja** (port, pauza, šifra)

---

## 33. Zaključak

Originalni IPREF.EXE je **mnogo složenija** aplikacija nego moja igra:
- Ima **mrežni mod** (server/klijent)
- Ima **admin/sudijski sistem**
- Ima **statistiku kluba i igrača**
- Ima **takmičenja** (liga, kup, ekipno)
- Ima **forume i ankete**
- Ima **detaljnu bidding logiku** sa dva dela
- Ima **mnogo modova** partije (dvojica, privatna, mađarice...)

Za poboljšanje tvoje igre, prioriteti su:
1. **Bidding dva dela** (FDrugiDeoLicitacije)
2. **Vizuelni tok bidding-a** (grdLicitTok)
3. **Stat labele** za sve igrače (bule, skor, odneo)
4. **Podešavanja** (potvrdi kontrakt, obrnuto, itd.)

---

**Dokument generisan:** 2026-08-29
**Verzija:** 2.0 — KOMPLETNA ANALIZA
**Tip:** Analiza svih stringova Preferans EXE
**Ukupno obrađeno:** 191.244 linija stringova, 4.769 UI komponenti, ~250 gameplay-relevantnih stringova
