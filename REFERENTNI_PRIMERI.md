# PREFERANS — Primeri 15 kompletnih deljenja

> **NAPOMENA:** Ovo su referentni primeri koje je korisnik dao da se proveri da li engine pravilno implementira Preferans pravila.
> Svaki primer sadrži: deljenje, bidding, odbranu, igru i bodovanje.
> Engine MORA da reprodukuje iste rezultate za iste ulaze.

---

## 1. OSNOVNE INFORMACIJE

| Stavka | Opis |
|--------|------|
| Igrači | 3 (Mirko, Darko, Janko) |
| Špil | 32 karte (7–As) |
| Početak | svi na 100 (ili 150) |
| Cilj | doći do 0 (spuštati se) |
| Deljenje | 10 karata svakom, 2 u talon |

## 2. LICITACIJA

### 2.1. Šta se kaže:

| Licitacija | Značenje |
|-----------|----------|
| "2" | Pik |
| "3" | Karo |
| "4" | Herc |
| "5" | Tref |
| "6" | Betl |
| "7" | Sans |
| "Mogu X" | Izjednačavanje |
| "Dalje" | Odustajanje |

### 2.2. Hijerarhija:

| Red | Licitacija | Adut |
|-----|-----------|------|
| 1 | 2 | Pik |
| 2 | 3 | Karo |
| 3 | 4 | Herc |
| 4 | 5 | Tref |
| 5 | 6 | Betl |
| 6 | 7 | Sans |

### 2.3. Pravila:

- **"Mogu X"** – samo ako je već licitirao u toj rundi
- **"Dalje"** – više ne učestvuje
- Kad dvojica kažu "Dalje" – zadnji koji je licitirao postaje deklarant
- Deklarant može igrati više od licitiranog (npr. licitirao 2, može igrati 5)
- Ako svi kažu "Dalje" → REFA

## 3. VREDNOSTI (licitacija)

| Igra | Vrednost (bule) |
|------|-----------------|
| 2 – Pik | 4 |
| 3 – Karo | 6 |
| 4 – Herc | 8 |
| 5 – Tref | 10 |
| 6 – Betl | 12 |
| 7 – Sans | 14 |

Engine koristi `gameValue * 2` kao bule vrednost: Pik=2→4, Karo=3→6, Herc=4→8, Tref=5→10, Betl=6→12, Sans=7→14. ✅

## 4. "IGRA" NA POČETKU (bez licitacije)

- Igrač kaže "Igra" odmah posle deljenja
- **VAŽNO:** Igrač NE SME reći "Igra" ako je VEĆ licitirao u ovoj rundi (BID/MOGU).
- Ostali mogu reći "Igra" ili "Dalje"
- Pobeđuje veća igra (Pik < Karo < Herc < Tref < Betl < Sans)
- Talon se NE uzima

### Vrednosti:

| Igra | Vrednost (bule) |
|------|-----------------|
| Igra-Pik | 6 |
| Igra-Karo | 8 |
| Igra-Herc | 10 |
| Igra-Tref | 12 |
| Igra-Betl | 14 |
| Igra-Sans | 16 |

Engine: Igra-Pik=3→6, Igra-Karo=4→8, Igra-Herc=5→10, Igra-Tref=6→12, Igra-Betl=7→14, Igra-Sans=8→16. ✅

## 5. ODBRANA

Odbrambeni redom kažu: "Dođem" ili "Neću"

### 5.1. Samo jedan došao:

- Bira: **"Igram sam"** ili **"Zovem X"**
- Ako zove – X MORA DA IGRA
- **"Kontra"** – daje onaj KOJI JE DOŠAO (ne pozvani)
- **"Rekontra"** – deklarant
- **"Subkontra"** – odbrambeni (isti koji je dao Kontra)
- **"Mortkontra"** – deklarant

### 5.2. Obojica došli:

- Igraju obojica (nema zvanja)
- Bilo ko može dati "Kontra"
- **Svaki mora uzeti minimum 2 štiha** ⚠️ (engine ne implementira još)

## 6. KONTRE – MNOŽIOCI

| Akcija | Ko daje | Množilac |
|--------|---------|----------|
| Bez kontre | – | ×1 |
| Kontra | Odbrambeni (koji je Došao/Zvao) | ×2 |
| Rekontra | Deklarant | ×4 |
| Subkontra | Odbrambeni (isti kontraš) | ×8 |
| Mortkontra | Deklarant | ×16 |

**Kada se da bilo koja – NEKO MORA DA PADNE!**

## 7. BODOVANJE (za 2,3,4,5,7)

### Deklarant USPE:

| Šta | Računica |
|-----|----------|
| Deklarant se SPUŠTA | vrednost × množilac |
| Odbrambeni koji dao kontru i NIJE oborio (kontraš uvek gubi) | DIŽE se: vrednost × množilac |
| Šupe za njega (kontraš) | (njegovi štihovi) × (vrednost × množilac) |

### Deklarant PADNE:

| Šta | Računica |
|-----|----------|
| Deklarant se DIŽE | vrednost × množilac |
| Odbrambeni imaju 5 štihova | – |
| Bez kontre – šupe | Svaki ko je Došao: (svoje štihove) × vrednost |
| Sa kontrom – šupe | SAMO onaj ko dao kontru: (deklarantovi štihovi) × (vrednost × množilac) |

## 8. BETL (6)

### Deklarant USPE (0 štihova):

| Šta | Računica |
|-----|----------|
| Deklarant se SPUŠTA | 12 × množilac |
| Odbrambeni dao kontru – PADA | DIŽE se: 12 × množilac |
| Šupe | NEMA |

### Deklarant PADNE (1+ štihova):

| Šta | Računica |
|-----|----------|
| Deklarant se DIŽE | 12 × množilac |
| OBA odbrambena dobijaju šupe | 60 × množilac |

## 9. PRAVILO ZA "2" (PIK)

- **Može se igrati bez kontre SAMO ako je neko u šeširu (ispod 0)**
- Ako niko nije u šeširu – ide REFA

## 10. REFA

- Svi kažu "Dalje" → svi dobijaju 1 refu
- Maksimum: 2 (partija do 100) / 3 (do 150)

## 11. TERMINI – SAŽETAK

| Termin | Značenje |
|--------|----------|
| 2–7 | Licitacija |
| Mogu X | Izjednačavanje |
| Dalje | Odustajanje |
| Igra | Igra na početku |
| Dođem | Pristajem da igram |
| Neću | Ne pristajem |
| Igram sam | Sam protiv deklaranta |
| Zovem X | Zovem partnera |
| Kontra / Rekontra / Subkontra / Mortkontra | Množioci ×2, ×4, ×8, ×16 |
| Refa | Svi pasiraju |

---

# 15 KOMPLETNIH DELJENJA

## 🔹 RUNDA #1 (Delilac: Janko)

**Karte:**

- **Mirko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Darko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Janko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Mirko: "2"
- Darko: "3"
- Janko: "Mogu 3"
- Mirko: "4"
- Darko: "Dalje"
- Janko: "Mogu 4"
- Mirko: "5"
- Janko: "Dalje"

**Deklarant:** Mirko (5 – Tref, vrednost 10)

**Razmena talona:** Mirko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Darko: "Dođem"
- Janko: "Neću"
- Darko bira: "Zovem Janka"
- Darko daje: "Kontra" (×2)
- Mirko daje: "Rekontra" (×4)

**Igra:** Mirko osvaja 7 štihova (USPEO). Darko uzima 3 štiha.

**Bodovanje:**
- Mirko: spušta se 40 (10 × 4)
- Darko: PADA – diže se 40, 120 šupa (3 × 10 × 4 = 3 × 40)
- Janko: 0

---

## 🔹 RUNDA #2 (Delilac: Mirko)

**Karte:**
- **Darko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Janko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Mirko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Licitacija:**
- Darko: "2"
- Janko: "3"
- Mirko: "Dalje"
- Darko: "4"
- Janko: "Dalje"

**Deklarant:** Darko (4 – Herc, vrednost 8)

**Razmena talona:** Darko uzima 8♣ i 7♣. Odbacuje 7♠ i 8♠.

**Odbrana:**
- Janko: "Dođem"
- Mirko: "Dođem"
- Bez kontre.

**Igra:** Darko osvaja 6 štihova (USPEO). Janko 3 štiha, Mirko 1 štih.

**Bodovanje:**
- Darko: spušta se 8
- Janko: prošao – 24 šupa (3 × 8)
- Mirko: PADA – diže se 8, 8 šupa (1 × 8)

---

## 🔹 RUNDA #3 (Delilac: Darko)

**Karte:**
- **Janko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Mirko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Darko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Janko: "2"
- Mirko: "3"
- Darko: "Dalje"
- Janko: "Mogu 3"
- Mirko: "4"
- Janko: "Dalje"

**Deklarant:** Mirko (4 – Herc, vrednost 8)

**Razmena talona:** Mirko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Janko: "Dođem"
- Darko: "Neću"
- Janko bira: "Igram sam"

**Igra:** Mirko osvaja 6 štihova (USPEO). Janko uzima 4 štiha.

**Bodovanje:**
- Mirko: spušta se 8
- Janko: prošao – 32 šupe (4 × 8)
- Darko: 0

---

## 🔹 RUNDA #4 (Delilac: Janko) – IGRA NA POČETKU

**Karte:**
- **Mirko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Darko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Janko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Posle deljenja:**
- Mirko: "Igra"
- Darko: "Dalje"
- Janko: "Dalje"
- Mirko kaže: "Betl" (vrednost 14)

**Talon se NE uzima!**

**Odbrana:**
- Darko: "Dođem"
- Janko: "Dođem"
- Darko daje: "Kontra" (×2)

**Igra:** Mirko osvaja 0 štihova (USPEO).

**Bodovanje:**
- Mirko: spušta se 28 (14 × 2)
- Darko: PADA – diže se 28
- Janko: 0

---

## 🔹 RUNDA #5 (Delilac: Mirko)

**Karte:**
- **Darko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Janko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Mirko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Darko: "2"
- Janko: "3"
- Mirko: "Dalje"
- Darko: "4"
- Janko: "Dalje"

**Deklarant:** Darko (4 – Herc, vrednost 8)

**Razmena talona:** Darko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Janko: "Dođem"
- Mirko: "Neću"
- Janko bira: "Zovem Mirka"
- Janko daje: "Kontra" (×2)

**Igra:** Darko osvaja 7 štihova (USPEO). Janko uzima 3 štiha.

**Bodovanje:**
- Darko: spušta se 16 (8 × 2)
- Janko: PADA – diže se 16, 48 šupa (3 × 8 × 2 = 3 × 16)
- Mirko: 0

---

## 🔹 RUNDA #6 (Delilac: Darko)

**Karte:**
- **Janko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Mirko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Darko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Licitacija:**
- Janko: "2"
- Mirko: "3"
- Darko: "Dalje"
- Janko: "Mogu 3"
- Mirko: "4"
- Janko: "Dalje"

**Deklarant:** Mirko (4 – Herc, vrednost 8)

**Razmena talona:** Mirko uzima 8♣ i 7♣. Odbacuje 7♠ i 8♠.

**Odbrana:**
- Janko: "Dođem"
- Darko: "Dođem"
- Bez kontre.

**Igra:** Mirko osvaja 6 štihova (USPEO). Janko 2 štiha, Darko 2 štiha.

**Bodovanje:**
- Mirko: spušta se 8
- Janko: prošao – 16 šupa (2 × 8)
- Darko: prošao – 16 šupa (2 × 8)

---

## 🔹 RUNDA #7 (Delilac: Janko)

**Karte:**
- **Mirko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Darko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Janko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Mirko: "2"
- Darko: "3"
- Janko: "Dalje"
- Mirko: "Dalje"

**Deklarant:** Darko (igra 3 – Karo, vrednost 6)
- Darko može igrati i više, bira 3.

**Razmena talona:** Darko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Mirko: "Dođem"
- Janko: "Neću"
- Mirko bira: "Zovem Janka"
- Mirko daje: "Kontra" (×2)
- Darko daje: "Rekontra" (×4)

**Igra:** Darko osvaja 7 štihova (USPEO). Mirko uzima 3 štiha.

**Bodovanje:**
- Darko: spušta se 24 (6 × 4)
- Mirko: PADA – diže se 24, 72 šupa (3 × 6 × 4 = 3 × 24)
- Janko: 0

---

## 🔹 RUNDA #8 (Delilac: Mirko)

**Karte:**
- **Darko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Janko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Mirko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Licitacija:**
- Darko: "2"
- Janko: "3"
- Mirko: "Dalje"
- Darko: "4"
- Janko: "Dalje"

**Deklarant:** Darko (4 – Herc, vrednost 8)

**Razmena talona:** Darko uzima 8♣ i 7♣. Odbacuje 7♠ i 8♠.

**Odbrana:**
- Janko: "Dođem"
- Mirko: "Dođem"
- Bez kontre.

**Igra:** Darko osvaja 6 štihova (USPEO). Janko 3 štiha, Mirko 1 štih.

**Bodovanje:**
- Darko: spušta se 8
- Janko: prošao – 24 šupa (3 × 8)
- Mirko: PADA – diže se 8, 8 šupa (1 × 8)

---

## 🔹 RUNDA #9 (Delilac: Darko)

**Karte:**
- **Janko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Mirko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Darko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Janko: "2"
- Mirko: "3"
- Darko: "Dalje"
- Janko: "Mogu 3"
- Mirko: "4"
- Janko: "Dalje"

**Deklarant:** Mirko (4 – Herc, vrednost 8)

**Razmena talona:** Mirko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Janko: "Dođem"
- Darko: "Neću"
- Janko bira: "Zovem Darka"
- Janko daje: "Kontra" (×2)
- Mirko daje: "Rekontra" (×4)

**Igra:** Mirko osvaja 6 štihova (USPEO). Janko uzima 4 štiha.

**Bodovanje:**
- Mirko: spušta se 32 (8 × 4)
- Janko: PADA – diže se 32, 128 šupa (4 × 8 × 4 = 4 × 32)
- Darko: 0

---

## 🔹 RUNDA #10 (Delilac: Janko) – IGRA NA POČETKU

**Karte:**
- **Mirko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Darko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Janko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Posle deljenja:**
- Mirko: "Igra"
- Darko: "Dalje"
- Janko: "Dalje"
- Mirko kaže: "Sans" (vrednost 16)

**Talon se NE uzima!**

**Odbrana:**
- Darko: "Dođem"
- Janko: "Dođem"
- Darko daje: "Kontra" (×2)
- Mirko daje: "Rekontra" (×4)

**Igra:** Mirko osvaja 6 štihova (USPEO). Darko uzima 4 štiha.

**Bodovanje:**
- Mirko: spušta se 64 (16 × 4)
- Darko: PADA – diže se 64, 256 šupa (4 × 16 × 4 = 4 × 64)
- Janko: 0

---

## 🔹 RUNDA #11 (Delilac: Mirko)

**Karte:**
- **Darko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Janko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Mirko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Darko: "2"
- Janko: "3"
- Mirko: "Dalje"
- Darko: "4"
- Janko: "Dalje"

**Deklarant:** Darko (4 – Herc, vrednost 8)

**Razmena talona:** Darko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Janko: "Dođem"
- Mirko: "Dođem"
- Janko daje: "Kontra" (×2)

**Igra:** Darko osvaja 5 štihova (PAO). Odbrambeni uzimaju 5 štihova.

**Bodovanje:**
- Darko: diže se 16 (8 × 2)
- Janko: 80 šupa (5 × 8 × 2 = 5 × 16)
- Mirko: 0

---

## 🔹 RUNDA #12 (Delilac: Darko)

**Karte:**
- **Janko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Mirko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Darko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Licitacija:**
- Janko: "2"
- Mirko: "3"
- Darko: "Dalje"
- Janko: "Mogu 3"
- Mirko: "4"
- Janko: "Dalje"

**Deklarant:** Mirko (4 – Herc, vrednost 8)

**Razmena talona:** Mirko uzima 8♣ i 7♣. Odbacuje 7♠ i 8♠.

**Odbrana:**
- Janko: "Dođem"
- Darko: "Neću"
- Janko bira: "Igram sam"

**Igra:** Mirko osvaja 6 štihova (USPEO). Janko uzima 4 štiha.

**Bodovanje:**
- Mirko: spušta se 8
- Janko: prošao – 32 šupe (4 × 8)
- Darko: 0

---

## 🔹 RUNDA #13 (Delilac: Janko)

**Karte:**
- **Mirko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Darko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Janko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Mirko: "2"
- Darko: "3"
- Janko: "Dalje"
- Mirko: "4"
- Darko: "Dalje"

**Deklarant:** Mirko (4 – Herc, vrednost 8)

**Razmena talona:** Mirko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Darko: "Neću"
- Janko: "Dođem"
- Janko bira: "Zovem Darka"
- Janko daje: "Kontra" (×2)

**Igra:** Mirko osvaja 7 štihova (USPEO). Janko uzima 3 štiha.

**Bodovanje:**
- Mirko: spušta se 16 (8 × 2)
- Janko: PADA – diže se 16, 48 šupa (3 × 8 × 2 = 3 × 16)
- Darko: 0

---

## 🔹 RUNDA #14 (Delilac: Mirko) – IGRA NA POČETKU

**Karte:**
- **Darko:** A♠, K♠, Q♠, J♠, 10♠, A♥, Q♥, K♦, J♦, 9♣
- **Janko:** 9♠, 8♠, K♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, Q♣
- **Mirko:** 7♠, 9♥, 8♥, 7♥, Q♦, 8♦, 7♦, K♣, J♣, 10♣
- **Talon:** 8♣, 7♣

**Posle deljenja:**
- Darko: "Igra"
- Janko: "Dalje"
- Mirko: "Dalje"
- Darko kaže: "Betl" (vrednost 14)

**Talon se NE uzima!**

**Odbrana:**
- Janko: "Dođem"
- Mirko: "Dođem"
- Mirko daje: "Kontra" (×2)
- Darko daje: "Rekontra" (×4)

**Igra:** Darko osvaja 0 štihova (USPEO).

**Bodovanje:**
- Darko: spušta se 56 (14 × 4)
- Mirko: PADA – diže se 56
- Janko: 0

---

## 🔹 RUNDA #15 (Delilac: Darko)

**Karte:**
- **Janko:** A♠, K♠, Q♠, 10♠, 9♠, A♥, K♥, Q♦, J♦, 7♣
- **Mirko:** J♠, 8♠, Q♥, J♥, 10♥, A♦, 10♦, 9♦, A♣, K♣
- **Darko:** 7♠, 9♥, 8♥, 7♥, K♦, 8♦, 7♦, Q♣, J♣, 10♣
- **Talon:** 8♣, 9♣

**Licitacija:**
- Janko: "2"
- Mirko: "3"
- Darko: "Dalje"
- Janko: "Mogu 3"
- Mirko: "4"
- Janko: "Dalje"

**Deklarant:** Mirko (4 – Herc, vrednost 8)

**Razmena talona:** Mirko uzima 8♣ i 9♣. Odbacuje 7♣ i 9♠.

**Odbrana:**
- Janko: "Dođem"
- Darko: "Neću"
- Janko bira: "Igram sam"

**Igra:** Mirko osvaja 6 štihova (USPEO). Janko uzima 4 štiha.

**Bodovanje:**
- Mirko: spušta se 8
- Janko: prošao – 32 šupe (4 × 8)
- Darko: 0