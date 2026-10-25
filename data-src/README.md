# Datenquellen

Diese Dateien sind die unveränderten Quellen, aus denen `scripts/build-data.mjs`
die Daten der App erzeugt (`npm run data`). Kein Quran-Text wird von Hand
geschrieben; alles kommt aus diesen Dateien.

## kfgqpc/

- `hafsData_v18.json`: Quran-Text (Uthmani, Hafs ʿan ʿĀṣim), Version 18, mit
  Seite, Juz und Zeilenbereich pro Ajah.
- Herausgeber: King Fahd Glorious Quran Printing Complex (KFGQPC),
  https://qurancomplex.gov.sa/en/techquran/dev/
- Bezogen über den Spiegel https://github.com/thetruetruth/quran-data-kfgqpc
  (Commit 281dbbe8eed1370daa5a023b6cd81655cbfd6473).
- Die Schrift `src/assets/hafs.18.ttf` (KFGQPC HAFS Uthmanic Script,
  Version 0.18) stammt aus demselben Paket und wird unverändert ausgeliefert.
  Laut ihrer eingebetteten Lizenz darf sie kostenlos genutzt, kopiert und
  weitergegeben, aber nicht verändert oder verkauft werden.

## layouts/

- `Madina-1405H.json` (klassische Ausgabe) und `Madina-1441H.json` (neue Ausgabe)
  aus dem npm-Paket `quran-madina-html` 2.2.2 von Tarek Eldeeb,
  Lizenz: Waqf General Public License 2.0 (siehe `LICENSE.md`).
- Daraus werden nur die Zeilengrenzen (welche Wörter auf welcher Zeile stehen)
  und die Zeilenarten (Sura-Kopf, Basmala, Text) übernommen. Der Text selbst
  kommt aus den KFGQPC-Daten.
- Abgleich: Für die Ausgabe 1441 H stimmen Seite und Zeilenbereich aller
  6236 Ajat mit den KFGQPC-Daten überein.
