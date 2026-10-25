// Erzeugt die statischen Daten der App aus den Quellen in data-src/.
//
//   public/data/text.json          Wörter jeder Ajah (KFGQPC Hafs v18)
//   public/data/layout-1405.json   Seiten/Zeilen der klassischen Ausgabe
//   public/data/layout-1441.json   Seiten/Zeilen der neuen Ausgabe
//   src/data/meta.generated.ts     Suren, Juz und Seiten-Metadaten für die Logik
//
// Aufruf: npm run data
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8').replace(/^﻿/, ''));

const EDITIONS = { 1405: 'Madina-1405H', 1441: 'Madina-1441H' };
const AYAH_END = '۝';

function fail(msg) {
  console.error('FEHLER: ' + msg);
  process.exit(1);
}

// ---------- KFGQPC-Text ----------
const kfgqpc = readJson('data-src/kfgqpc/hafsData_v18.json');
if (kfgqpc.length !== 6236) fail('Erwartet 6236 Ajat, gefunden ' + kfgqpc.length);

const ayahs = []; // { sura, aya, juz, page1441, lineStart, lineEnd, words: string[] (inkl. Nummer am Ende) }
const ayahIndex = new Map(); // "s:a" -> globaler Index
const suras = [];
for (const r of kfgqpc) {
  const m = /^(.*?) ([٠-٩]+)$/.exec(r.aya_text);
  if (!m) fail(`Ajah ${r.sora}:${r.aya_no} ohne Nummernzeichen`);
  const words = m[1].split(' ').filter(Boolean);
  words.push(m[2]);
  ayahIndex.set(`${r.sora}:${r.aya_no}`, ayahs.length);
  ayahs.push({
    sura: r.sora,
    aya: r.aya_no,
    juz: r.jozz,
    page1441: r.page,
    lineStart: r.line_start,
    lineEnd: r.line_end,
    words,
  });
  if (!suras[r.sora - 1]) suras[r.sora - 1] = { n: r.sora, ar: r.sora_name_ar, tr: r.sora_name_en, ayahs: 0 };
  suras[r.sora - 1].ayahs++;
}
if (suras.length !== 114) fail('Erwartet 114 Suren');

// Grundgerüst der Schrift ohne Vokalzeichen, zum Abgleich unterschiedlicher Worttrennung.
const skeleton = (w) =>
  w
    .replace(/[ٱآأإ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[^آ-ي]/g, '');

// Ordnet jedem KFGQPC-Wort einer Ajah die Zeile aus dem Layout zu.
function alignWords(kWords, segments, key) {
  const tTokens = [];
  for (const seg of segments) {
    for (const w of seg.t.split(' ')) {
      if (!w || w.includes(AYAH_END)) continue;
      tTokens.push({ w, l: seg.l });
    }
  }
  const body = kWords.slice(0, -1);
  if (tTokens.length === body.length) return body.map((_, i) => tTokens[i].l);
  // Unterschiedliche Worttrennung (z. B. „لوما“ vs. „لو ما“): über das Schriftgerüst zusammenführen.
  const lines = [];
  let j = 0;
  for (const w of body) {
    const sk = skeleton(w);
    if (j < tTokens.length && skeleton(tTokens[j].w) === sk) {
      lines.push(tTokens[j].l);
      j += 1;
    } else if (j + 1 < tTokens.length && skeleton(tTokens[j].w + tTokens[j + 1].w) === sk) {
      if (tTokens[j].l !== tTokens[j + 1].l) fail(`${key}: zusammengeführtes Wort über zwei Zeilen`);
      lines.push(tTokens[j].l);
      j += 2;
    } else {
      fail(`${key}: Wort „${w}“ lässt sich nicht zuordnen`);
    }
  }
  if (j !== tTokens.length) fail(`${key}: ${tTokens.length - j} Layout-Wörter übrig`);
  console.log(`  Worttrennung angeglichen: ${key}`);
  return lines;
}

const basmalaWords = ayahs[0].words.slice(0, -1);

// ---------- Layouts ----------
const metaByEdition = {};
for (const [edition, file] of Object.entries(EDITIONS)) {
  console.log(`Ausgabe ${edition} (${file})`);
  const lay = readJson(`data-src/layouts/${file}.json`);
  if (lay.lines.length !== 604) fail(`${file}: ${lay.lines.length} Seiten`);
  const fullWidth = lay.line_width;

  // pages[p-1][l-1] = { kind, sura?, parts: [[ayahIdx, from, to]] }
  const pages = lay.lines.map((pageLines) =>
    pageLines.map((l) => ({ kind: l.k, w: l.w, parts: [] })),
  );
  const ayahPage = new Array(ayahs.length).fill(0);

  lay.suras.forEach((s, si) => {
    const suraNo = si + 1;
    let ayaNo = 0;
    for (const entry of s.ayas) {
      if (!entry.r.length) continue;
      const lastText = entry.r[entry.r.length - 1].t;
      const line0 = pages[entry.p - 1]?.[entry.r[0].l - 1];
      if (!line0) fail(`${file}: ungültige Position ${suraNo} S.${entry.p} Z.${entry.r[0].l}`);
      if (!lastText.includes(AYAH_END)) {
        if (!lastText) continue;
        if (line0.kind === 'sura') line0.sura = suraNo;
        else if (line0.kind === 'bism') line0.sura = suraNo;
        else fail(`${file}: unerwarteter Eintrag in Sura ${suraNo}: ${lastText}`);
        continue;
      }
      ayaNo += 1;
      const key = `${suraNo}:${ayaNo}`;
      const idx = ayahIndex.get(key);
      if (idx === undefined) fail(`${file}: Ajah ${key} fehlt in KFGQPC`);
      const a = ayahs[idx];
      // Madina-Mushaf: jede Seite endet mit einem Ajah-Ende, Ajat laufen nie über die Seite.
      for (let i = 1; i < entry.r.length; i++) {
        if (entry.r[i].l < entry.r[i - 1].l) fail(`${file}: Ajah ${key} läuft über die Seite`);
      }
      const wordLines = alignWords(a.words, entry.r, key);
      wordLines.push(entry.r[entry.r.length - 1].l); // Nummernzeichen steht hinter dem letzten Wort
      ayahPage[idx] = entry.p;
      if (edition === '1441') {
        if (entry.p !== a.page1441 || wordLines[0] !== a.lineStart || wordLines.at(-1) !== a.lineEnd) {
          fail(`${file}: Ajah ${key} weicht von KFGQPC ab`);
        }
      }
      let from = 0;
      for (let i = 1; i <= wordLines.length; i++) {
        if (i === wordLines.length || wordLines[i] !== wordLines[from]) {
          const line = pages[entry.p - 1][wordLines[from] - 1];
          if (line.kind !== 'text') fail(`${file}: Ajah ${key} auf Zeile vom Typ ${line.kind}`);
          line.parts.push([idx, from, i]);
          from = i;
        }
      }
    }
    if (ayaNo !== suras[si].ayahs) fail(`${file}: Sura ${suraNo} hat ${ayaNo} statt ${suras[si].ayahs} Ajat`);
  });

  // Kontrolle: jede Textzeile hat Wörter, jeder Kopf und jede Basmala gehört zu einer Sura.
  pages.forEach((pl, pi) =>
    pl.forEach((line, li) => {
      if (line.kind === 'text') {
        if (!line.parts.length) fail(`${file}: S.${pi + 1} Z.${li + 1} ist leer`);
      } else if (!line.sura) {
        fail(`${file}: S.${pi + 1} Z.${li + 1} (${line.kind}) ohne Sura`);
      }
    }),
  );

  // Ausgabe-Datei für die Lese-Ansicht
  const outPages = pages.map((pl) =>
    pl.map((line) => {
      if (line.kind === 'sura') return ['h', line.sura];
      if (line.kind === 'bism') return ['b'];
      const ratio = line.w / fullWidth;
      return ratio < 0.97 ? ['t', line.parts, Math.round(ratio * 1000) / 1000] : ['t', line.parts];
    }),
  );
  mkdirSync(join(root, 'public/data'), { recursive: true });
  writeFileSync(join(root, `public/data/layout-${edition}.json`), JSON.stringify({ edition, pages: outPages }));

  // Metadaten
  const pageFirst = [];
  const pageLast = [];
  const pageJuz = [];
  const pageLines = [];
  const pageTextMask = [];
  const suraPages = suras.map(() => [999, 0]);
  const juzPages = Array.from({ length: 30 }, () => [999, 0]);
  for (let p = 1; p <= 604; p++) {
    const idxs = ayahs.map((_, i) => i).filter((i) => ayahPage[i] === p);
    if (!idxs.length) fail(`${file}: Seite ${p} ohne Ajat`);
    const first = ayahs[idxs[0]];
    const last = ayahs[idxs.at(-1)];
    pageFirst.push([first.sura, first.aya]);
    pageLast.push([last.sura, last.aya]);
    pageJuz.push(first.juz);
    pageLines.push(pages[p - 1].length);
    pageTextMask.push(pages[p - 1].reduce((m, line, li) => (line.kind === 'text' ? m | (1 << li) : m), 0));
    for (const i of idxs) {
      const sp = suraPages[ayahs[i].sura - 1];
      sp[0] = Math.min(sp[0], p);
      sp[1] = Math.max(sp[1], p);
      const jp = juzPages[ayahs[i].juz - 1];
      jp[0] = Math.min(jp[0], p);
      jp[1] = Math.max(jp[1], p);
    }
    // Sura-Köpfe zählen zur Seite, auf der sie stehen
    for (const line of pages[p - 1]) {
      if (line.kind === 'sura') suraPages[line.sura - 1][0] = Math.min(suraPages[line.sura - 1][0], p);
    }
  }
  // Einige Juz beginnen mitten auf einer Seite; diese Seite gehört dann zu beiden Juz.
  const midPage = [];
  for (let j = 1; j < 30; j++) {
    if (juzPages[j][0] !== juzPages[j - 1][1] + 1) midPage.push(`${j + 1} (S. ${juzPages[j][0]})`);
  }
  console.log(`  Juz-Beginn mitten auf der Seite: ${midPage.join(', ') || 'keiner'}`);
  metaByEdition[edition] = { pageFirst, pageLast, pageJuz, pageLines, pageTextMask, suraPages, juzPages };
}

// ---------- text.json ----------
writeFileSync(
  join(root, 'public/data/text.json'),
  JSON.stringify({ source: 'KFGQPC Hafs v18', basmala: basmalaWords, ayahs: ayahs.map((a) => a.words) }),
);

// ---------- meta.generated.ts ----------
const ayahStart = [];
let acc = 0;
for (const s of suras) {
  ayahStart.push(acc);
  acc += s.ayahs;
}
const ts = `// Automatisch erzeugt von scripts/build-data.mjs – nicht von Hand ändern.
export type EditionId = '1405' | '1441';

export interface SuraMeta {
  n: number;
  /** Arabischer Name (KFGQPC), für die Hafs-Schrift */
  ar: string;
  /** Umschrift (KFGQPC) */
  tr: string;
  ayahs: number;
}

export interface EditionMeta {
  /** [sura, ajah] der ersten Ajah je Seite (Index = Seite - 1) */
  pageFirst: [number, number][];
  pageLast: [number, number][];
  pageJuz: number[];
  pageLines: number[];
  /** Bitmaske der Textzeilen (Bit 0 = Zeile 1) */
  pageTextMask: number[];
  /** [erste, letzte] Seite je Sura */
  suraPages: [number, number][];
  /** [erste, letzte] Seite je Juz */
  juzPages: [number, number][];
}

export const SURAS: SuraMeta[] = ${JSON.stringify(suras)};

/** Globaler Index der ersten Ajah je Sura */
export const SURA_AYAH_START: number[] = ${JSON.stringify(ayahStart)};

export const EDITION_META: Record<EditionId, EditionMeta> = ${JSON.stringify(metaByEdition)};
`;
writeFileSync(join(root, 'src/data/meta.generated.ts'), ts);
console.log('Fertig.');
