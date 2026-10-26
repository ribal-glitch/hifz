# Hifz

Tägliche Hifz-Einheit am Abend: Dars-Portion, frische Dars-Seiten und Murājaʿa,
dazu Fortschritt, Mushaf-Ansicht mit Hifz-Modus und Profile ohne Login.
Die App ist eine installierbare Web-App (PWA) und funktioniert nach dem ersten
Öffnen auch offline. Alle Daten bleiben auf dem jeweiligen Gerät.

## Methode

Die tägliche Einheit folgt dem klassischen Dreiklang der Hifz-Schulen:

1. **Neu lernen (Dars):** die Wochenseite in Portionen à 3 Zeilen – anhören, lesen bis flüssig,
   auswendig aufsagen, mit den Zeilen davor verbinden; Probevortrag am Tag vor dem Dars.
2. **Frisches festigen:** die letzten vier Dars-Seiten täglich auswendig.
3. **Altes wiederholen (Murājaʿa):** lückenlose Rotation durch den ganzen Bestand. Schwachstellen kommen
   täglich zusätzlich dran, bis sie sitzen, und danach zur Nachprüfung nach 3 und 7 Tagen.

Zum Prüfen öffnen sich Seiten verdeckt (erst abrufen, dann nachsehen). Die Mini-Prüfung fragt bevorzugt
Seitenübergänge und Schwachstellen ab. Zum Anhören stehen 16 bekannte Rezitatoren (EveryAyah.com) mit
Wiederholung pro Ajah bereit.

## Auf dem Handy installieren

**iPhone (Safari):** Link öffnen → unten auf „Teilen“ (Quadrat mit Pfeil) →
„Zum Home-Bildschirm“ → „Hinzufügen“. Danach die App immer über das neue Symbol starten.

**Android (Chrome):** Link öffnen → Menü ⋮ oben rechts → „App installieren“
(oder „Zum Startbildschirm hinzufügen“) → bestätigen.

## Änderungen veröffentlichen

Jeder Push auf den Zweig `main` baut und veröffentlicht die App automatisch
(GitHub Actions → GitHub Pages, Dauer etwa 1–2 Minuten). Installierte Apps holen
sich die neue Version beim nächsten Öffnen von selbst.

Am einfachsten: eine neue Claude-Code-Sitzung mit diesem Repository starten und
die Änderung beschreiben. Claude ändert den Code, testet und pusht auf `main`.

## Entwicklung

```bash
npm install
npm run dev      # lokale Vorschau
npm test         # Tests der Tageslogik
npm run build    # Produktions-Build in dist/
npm run data     # Quran-Daten aus data-src/ neu erzeugen (nur bei neuen Quellen nötig)
```

Aufbau:

- `src/logic/`: Tageslogik (Dars, Rotation, Schwachstellen, Prüfung, Statistik), mit Tests in `logic.test.ts`
- `src/screens/`: die Bildschirme (Wer lernt?, Heute, Fortschritt, Lesen, Einstellungen)
- `src/store.tsx`: Profile und Speicherung in IndexedDB
- `public/data/`: erzeugte Quran-Daten (Text und Zeilen-Layouts)
- `data-src/`: unveränderte Quellen, siehe `data-src/README.md`

## Quellen und Lizenzen

- Quran-Text (Uthmani, Hafs ʿan ʿĀṣim, v18) und die Schrift „KFGQPC HAFS Uthmanic Script“:
  King Fahd Glorious Quran Printing Complex. Die Schrift wird unverändert ausgeliefert.
- Schrift der Oberfläche: Plus Jakarta Sans (SIL Open Font License), über `@fontsource/plus-jakarta-sans`.
- Zeilenumbrüche des Madina-Mushaf (Ausgaben 1405 H und 1441 H): aus
  [quran-madina-html](https://www.npmjs.com/package/quran-madina-html) von Tarek Eldeeb,
  Waqf General Public License 2.0. Übernommen werden nur die Zeilengrenzen.
- Rezitationen: über [EveryAyah.com](https://everyayah.com) (u. a. al-Ḥuṣarī, al-Minshāwī, ʿAbd al-Bāsiṭ, al-ʿAfāsī), nur online abgespielt.
- Die Quran-Foundation-API (quran.com) wird bewusst nicht verwendet: Ihre Developer Terms erlauben
  keine vorab gebündelten Textdaten.
