# Woordkoffer 1.0

Pak je woorden in voor op reis. Woordkoffer is een flashcard-app om de woorden van een taal te leren, met herhaling op het juiste moment. De naam knipoogt naar het spel "Ik ga op reis en ik neem mee".

Het is een web-app (PWA): hij werkt in de browser op Android en iPhone, je kunt hem als app op je beginscherm zetten en hij werkt offline.

## Wat erin zit
- **Talen:** Spaans, Italiaans, Frans, Portugees, Duits, Engels en Zweeds, te kiezen bovenaan. Per taal eigen lijsten en de juiste stem.
- **Kant-en-klare lijsten (Spaans):** werkwoorden (top 100), bijwoorden, de auto (binnen en buiten), dieren, kleding, gereedschap, lichaamsdelen en iemand beschrijven (uiterlijk).
- **Kant-en-klare lijsten (Zweeds):** dezelfde acht onderwerpen, met en/ett bij de zelfstandige naamwoorden.
- **Lijsten aan- en uitzetten:** bij Kant-en-klare lijsten. Uitzetten haalt een lijst uit je overzicht; je voortgang blijft bewaard. Een lijst die aanstaat is je eigen kopie die je kunt aanpassen.
- **Eigen lijsten:** woorden plakken (`el perro – de hond`, één per regel) of een .txt/.csv kiezen.
- **Herhaalschema** zoals bij Anki (SM-2), met de knoppen Opnieuw, Moeilijk, Goed en Makkelijk.
- **Beide richtingen:** elk nieuw woord komt eerst als taal → Nederlands en een paar kaarten later als Nederlands → taal.
- **Tempo per lijst:** Weinig (10), Normaal (20) of Veel (40) nieuwe woorden per keer oefenen, of een eigen aantal. Daarna kun je doorgaan met 10 extra.
- **Terugkomen in kaarten:** tijdens het oefenen komt een woord dat je aan het leren bent terug na 8 (Opnieuw), 14 (Moeilijk) of 25 (Goed) andere kaarten, hoe snel je ook bent. Daarna gaat het om dagen.
- **Alles in woorden:** de app telt unieke woorden, niet kaarten. Per lijst: geleerd · mee bezig · nieuw. Geleerd = in beide richtingen twee keer achter elkaar goed.
- **Voortgang tijdens het oefenen:** "X van Y woorden klaar" met de geschatte tijd, en stipjes per woord (hoe vaak goed, hoe vaak nog nodig). Met **Overslaan** komt een woord de volgende keer terug.
- **Statistieken:** dagen geoefend, woorden geoefend, percentage meteen goed, tijd, een kalender, woorden per oefendag of week, hoe goed je geleerde woorden onthoudt, de stand van je woorden en je lastigste woorden. Elk antwoord wordt daarvoor vastgelegd op je eigen apparaat.
- **Makkelijke woorden:** "Ken ik al" bij een nieuw woord verbergt het; "Makkelijk" bij een woord dat je aan het leren bent geeft minstens 60 dagen pauze. Verborgen woorden kun je per lijst doorkijken.
- **Woorden die je niet wilt leren:** het knopje "✕ Weg" op de kaart.
- **Vrij oefenen:** een hele lijst door zonder dat het meetelt, handig om samen te oefenen.
- **Uitspraak** met de stem van de telefoon; geluid aan of uit tijdens het oefenen.
- **Weergave:** automatisch (zoals de telefoon), licht of donker.
- **Menu:** een zijlade via ☰. Openen door op het overzicht naar rechts te vegen; sluiten met de terugknop van de telefoon, naar links vegen of ernaast tikken. Op een iPhone met de app op het beginscherm is vanaf de linkerrand naar rechts vegen "terug".
- **Taal van de app:** Nederlands, of de hele app in de taal die je leert (nu Spaans). Schakelaar in het menu en bij Instellingen.
- **Lijsten delen** als tekstbestand, **back-up** maken en terugzetten, en **automatische kopieën** van de voortgang.

## Voortgang
- De voortgang staat in de browser (localStorage, sleutel `woordkoffer`), los van de app-bestanden. Een nieuwe versie vervangt alleen de bestanden.
- Bij een nieuwe versie: de sleutel `woordkoffer` niet veranderen. Verandert de opbouw van de gegevens, verhoog dan `DATA_VERSION` en zet de gegevens om in `normalize()` zonder iets van de voortgang weg te gooien.
- De app bewaart zelf kopieën: één per dag (laatste 7), één vlak voor het omzetten naar een nieuwe versie, en één voor elk terugzetten. Terugzetten via Instellingen → Automatische kopieën.
- De voortgang hoort bij één adres in één browser. Een ander adres heeft een eigen, lege voortgang. Overzetten naar een ander apparaat gaat met Instellingen → Back-up maken en daar Back-up terugzetten.

## Lokaal testen
```bash
python3 -m http.server 8765
```
Voer dit uit in deze map en open http://localhost:8765. Je kunt `index.html` ook direct openen; dan werkt alles behalve offline gebruik en installeren.

## Op de telefoon zetten
Open het webadres van de app en zet hem op je beginscherm:
- **iPhone (Safari):** deelknop → *Zet op beginscherm*
- **Android (Chrome):** menu ⋮ → *App installeren* of *Toevoegen aan startscherm*

Open de app daarna altijd via het icoon: Safari kan de gegevens van een gewone website na een tijd wissen, maar niet van een app op het beginscherm.

## Bestanden
- `index.html`, `styles.css`, `app.js`: de app
- `lijsten.js`, `lijsten-sv.js`: de kant-en-klare woordenlijsten (Spaans, Zweeds)
- `vertalingen.js`: de teksten van de app in andere talen (sleutel = de Nederlandse tekst). Een taal toevoegen is een nieuw blok met dezelfde sleutels
- `manifest.json`, `sw.js`, `icons/`: nodig om te installeren en offline te werken. Verander `VERSION` in `sw.js` bij elke nieuwe uitgave.

## Licentie
MIT, zie `LICENSE`.
