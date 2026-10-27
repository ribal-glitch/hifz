import { EDITION_META, SURAS, type EditionId } from '../data/meta.generated';

export { SURAS };
export type { EditionId };

export const PAGE_COUNT = 604;
export const JUZ_COUNT = 30;

export const EDITIONS: { id: EditionId; label: string; hint: string }[] = [
  { id: '1405', label: 'Klassische Ausgabe (1405 H)', hint: 'Der weit verbreitete Madina-Mushaf' },
  { id: '1441', label: 'Neue Ausgabe (1441 H)', hint: 'Aktueller Druck des King-Fahd-Komplexes' },
];

export const meta = (ed: EditionId) => EDITION_META[ed];

export function suraName(n: number): string {
  return SURAS[n - 1].tr;
}

export function pageJuz(ed: EditionId, page: number): number {
  return meta(ed).pageJuz[page - 1];
}

export function pageLineCount(ed: EditionId, page: number): number {
  return meta(ed).pageLines[page - 1];
}

/** Zeilennummern mit Quran-Text (ohne Sura-Kopf und Basmala). */
export function textLines(ed: EditionId, page: number): number[] {
  const mask = meta(ed).pageTextMask[page - 1];
  const out: number[] = [];
  for (let l = 1; l <= pageLineCount(ed, page); l++) if (mask & (1 << (l - 1))) out.push(l);
  return out;
}

export function surasOnPage(ed: EditionId, page: number): number[] {
  const [s1] = meta(ed).pageFirst[page - 1];
  const [s2] = meta(ed).pageLast[page - 1];
  const out: number[] = [];
  for (let s = s1; s <= s2; s++) out.push(s);
  return out;
}

/** „Al-‘Ankabūt 7–14“ oder „Al-Qaṣaṣ 85 – Al-‘Ankabūt 6“ */
export function pageRangeLabel(ed: EditionId, page: number): string {
  const [s1, a1] = meta(ed).pageFirst[page - 1];
  const [s2, a2] = meta(ed).pageLast[page - 1];
  if (s1 === s2) return a1 === a2 ? `${suraName(s1)} ${a1}` : `${suraName(s1)} ${a1}–${a2}`;
  return `${suraName(s1)} ${a1} – ${suraName(s2)} ${a2}`;
}

/** Kurzer Name der Sura, in der die Seite überwiegend liegt (letzte Sura der Seite). */
export function pageMainSura(ed: EditionId, page: number): number {
  return meta(ed).pageLast[page - 1][0];
}

export function suraPages(ed: EditionId, sura: number): [number, number] {
  return meta(ed).suraPages[sura - 1];
}

export function juzPages(ed: EditionId, juz: number): [number, number] {
  return meta(ed).juzPages[juz - 1];
}

export function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Fasst Seiten zu Bereichen zusammen: [293..396, 482..604] → „293–396, 482–604“ */
export function toRanges(pages: Iterable<number>): [number, number][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else out.push([p, p]);
  }
  return out;
}

export function formatRanges(pages: Iterable<number>): string {
  return toRanges(pages)
    .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
    .join(', ');
}

/** Deutsche Zahl mit Komma, z. B. 37,6 */
export function formatDecimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

/**
 * Zeile, mit der eine Sura auf ihrer ersten Seite beginnt (Sura-Kopf).
 * Die Lücken ohne Quran-Text (Kopf und Basmala) gehören der Reihe nach zu den Suren, die auf der Seite beginnen.
 */
export function suraStartLine(ed: EditionId, sura: number): number {
  const [page] = suraPages(ed, sura);
  const starting = SURAS.filter((s) => suraPages(ed, s.n)[0] === page && (s.n === sura || !continuesOnto(ed, s.n, page))).map((s) => s.n);
  const text = new Set(textLines(ed, page));
  const gaps: number[] = [];
  for (let l = 1; l <= pageLineCount(ed, page); l++) if (!text.has(l) && (l === 1 || text.has(l - 1))) gaps.push(l);
  const k = starting.indexOf(sura);
  return gaps[k] ?? 1;
}

/** Sura läuft von einer früheren Seite auf diese weiter (beginnt also nicht hier). */
function continuesOnto(ed: EditionId, sura: number, page: number): boolean {
  return suraPages(ed, sura)[0] < page;
}

/** Letzte Zeile einer Sura auf ihrer letzten Seite. */
export function suraEndLine(ed: EditionId, sura: number): number {
  const [, page] = suraPages(ed, sura);
  if (sura < SURAS.length && suraPages(ed, sura + 1)[0] === page) return suraStartLine(ed, sura + 1) - 1;
  return pageLineCount(ed, page);
}
