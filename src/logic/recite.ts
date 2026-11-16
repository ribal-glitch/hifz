/**
 * Rezitation mitverfolgen: Die Spracherkennung liefert arabischen Text in heutiger Schreibweise
 * und ohne Vokalzeichen. Der wird Wort für Wort mit dem Mushaf-Text abgeglichen, um
 *  1. die Stelle im Quran zu finden und
 *  2. ausgelassene und falsche Wörter zu markieren.
 * Verglichen wird nur das Buchstabengerüst: Vokal- und Tajwīd-Fehler erkennt das nicht.
 */

import { ayahKey } from '../data/quranData';

const MUQATTAAT = new Set(['لم', 'لمص', 'لر', 'لمر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'ص', 'حم', 'عسق', 'ق', 'ن']);

/** Ein gesprochenes Wort im Quran: Ayah-Index und Wort in der Ayah. */
export interface FlatWord {
  a: number;
  w: number;
  /** Buchstabengerüst zum Vergleichen */
  k: string;
  /** Einzelbuchstaben am Sura-Anfang (الٓمٓ …): werden buchstabiert gesprochen und nicht bewertet */
  free?: boolean;
}

export type WordStatus = 'ok' | 'wrong' | 'missed';

/**
 * Buchstabengerüst eines Wortes: ohne Vokal- und Lesezeichen, Alif-/Hamza-Formen vereinheitlicht
 * und ohne Alif, weil der Mushaf viele lange ā ohne Alif schreibt (ٱلۡكِتَٰبُ = الكتاب).
 */
export function skeleton(word: string): string {
  let out = '';
  for (const ch of word) {
    const c = ch.codePointAt(0)!;
    if (c === 0x622 || c === 0x623 || c === 0x625 || c === 0x627 || c === 0x671 || c === 0x621) continue; // Alif-Formen, Hamza
    if (c === 0x624) out += 'و';
    else if (c === 0x626 || c === 0x649) out += 'ي';
    else if (c === 0x629) out += 'ه';
    else if (c >= 0x628 && c <= 0x64a && c !== 0x640) out += ch;
    // alles andere (Vokalzeichen, Lesezeichen, Ziffern, Satzzeichen) entfällt
  }
  return out;
}

/** Erkannten Text in Wörter (Buchstabengerüste) zerlegen. */
export function spokenWords(text: string): string[] {
  return text
    .split(/[^ء-يٰٱً-ْ]+/)
    .map(skeleton)
    .filter(Boolean);
}

/** Alle gesprochenen Wörter des Qurans in Lesereihenfolge (ohne die Ayah-Nummern). */
export function flatten(ayahs: string[][]): FlatWord[] {
  const out: FlatWord[] = [];
  ayahs.forEach((words, a) => {
    for (let w = 0; w < words.length - 1; w++) {
      const k = skeleton(words[w]);
      // Einzelbuchstaben stehen am Anfang der ersten (42: zweiten) Ayah und tragen ein Madda-Zeichen (außer طه)
      const free = w === 0 && ayahKey(a)[1] <= 2 && MUQATTAAT.has(k) && (words[w].includes('\u0653') || k === 'طه');
      out.push(free ? { a, w, k, free } : { a, w, k });
    }
  });
  return out;
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const matchCache = new Map<string, boolean>();

/** Gleiches Wort? Kleine Abweichungen (Schreibweise, Hörfehler der Erkennung) werden toleriert. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  const tol = len <= 3 ? 0 : len <= 5 ? 1 : 2;
  if (!tol) return false;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  let v = matchCache.get(key);
  if (v === undefined) {
    v = editDistance(a, b, tol) <= tol;
    if (matchCache.size > 50_000) matchCache.clear();
    matchCache.set(key, v);
  }
  return v;
}

export type Index = Map<string, number[]>;

/** Verzeichnis aller Dreier-Wortfolgen, um eine Stelle schnell zu finden. */
export function buildIndex(flat: FlatWord[]): Index {
  const idx: Index = new Map();
  for (let i = 0; i + 2 < flat.length; i++) {
    const key = `${flat[i].k} ${flat[i + 1].k} ${flat[i + 2].k}`;
    const arr = idx.get(key);
    if (arr) arr.push(i);
    else idx.set(key, [i]);
  }
  return idx;
}

/**
 * Wo im Quran beginnt das Gesprochene? Jede erkannte Dreier-Wortfolge stimmt für eine Startposition.
 * `prefer` (z. B. der Bestand oder die offene Seite) entscheidet bei Gleichstand.
 * Liefert die Position des ersten gesprochenen Wortes oder null, solange es nicht eindeutig ist.
 */
export function locate(index: Index, spoken: string[], prefer?: (pos: number) => boolean): number | null {
  const votes = new Map<number, number>();
  for (let i = 0; i + 2 < spoken.length; i++) {
    const hits = index.get(`${spoken[i]} ${spoken[i + 1]} ${spoken[i + 2]}`);
    if (!hits || hits.length > 40) continue;
    for (const h of hits) votes.set(h - i, (votes.get(h - i) ?? 0) + 1);
  }
  if (!votes.size) return null;
  const ranked = [...votes.entries()]
    .map(([pos, n]) => ({ pos, n, pref: prefer?.(Math.max(0, pos)) ? 1 : 0 }))
    .sort((x, y) => y.n - x.n || y.pref - x.pref);
  const [best, second] = ranked;
  // eindeutig: klar die meisten Stimmen, oder bei Gleichstand genau ein bevorzugter Treffer
  if (second && second.n === best.n && second.pref === best.pref) return null;
  if (best.n < 2 && second && !best.pref) return null;
  return Math.max(0, best.pos);
}

export interface Alignment {
  /** Status je erwartetem Wort ab `start` (Länge = wie weit rezitiert wurde) */
  status: WordStatus[];
  /** Anzahl der erwarteten Wörter, die abgedeckt sind */
  reached: number;
  /** wie viele der letzten gesprochenen Wörter nichts getroffen haben (Hinweis: an anderer Stelle weiter) */
  tailMisses: number;
}

const INS = 0.6;

/**
 * Gesprochene Wörter mit dem erwarteten Text ab `start` abgleichen.
 * Ausgelassene Wörter gelten als „missed“, ersetzte als „wrong“; zusätzlich Gesprochenes
 * (Wiederholen, Basmala, Istiʿādha) wird ignoriert. Zwei gesprochene Wörter dürfen ein
 * Mushaf-Wort bilden (يا أيها = يَٰٓأَيُّهَا) und umgekehrt.
 */
export function align(flat: FlatWord[], start: number, spoken: string[]): Alignment {
  const n = spoken.length;
  const m = Math.min(flat.length - start, Math.ceil(n * 1.4) + 12);
  if (!n || m <= 0) return { status: [], reached: 0, tailMisses: 0 };
  const W = m + 1;
  const cost = new Float32Array((n + 1) * W);
  const op = new Uint8Array((n + 1) * W); // 1 Treffer, 2 ersetzt, 3 ausgelassen, 4 zusätzlich, 5 zwei gesprochen = eins, 6 eins gesprochen = zwei
  for (let j = 1; j <= m; j++) {
    cost[j] = j;
    op[j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    cost[i * W] = i * INS;
    op[i * W] = 4;
    const s = spoken[i - 1];
    for (let j = 1; j <= m; j++) {
      const e = flat[start + j - 1];
      const hit = e.free || sameWord(s, e.k);
      let c = cost[(i - 1) * W + j - 1] + (hit ? 0 : 1);
      let o = hit ? 1 : 2;
      const del = cost[i * W + j - 1] + 1;
      if (del < c) {
        c = del;
        o = 3;
      }
      const ins = cost[(i - 1) * W + j] + (e.free ? 0 : INS);
      if (ins < c) {
        c = ins;
        o = 4;
      }
      if (i >= 2 && !e.free && spoken[i - 2] + s === e.k) {
        const v = cost[(i - 2) * W + j - 1];
        if (v < c) {
          c = v;
          o = 5;
        }
      }
      if (j >= 2 && s === flat[start + j - 2].k + e.k) {
        const v = cost[(i - 1) * W + j - 2];
        if (v < c) {
          c = v;
          o = 6;
        }
      }
      cost[i * W + j] = c;
      op[i * W + j] = o;
    }
  }
  // Ende frei: die beste Stelle, bis zu der das Gesprochene reicht (bei Gleichstand die weiteste mit Treffer)
  let bestJ = 0;
  for (let j = 1; j <= m; j++) {
    const c = cost[n * W + j];
    const b = cost[n * W + bestJ];
    if (c < b || (c === b && op[n * W + j] !== 3)) bestJ = j;
  }
  const status: WordStatus[] = new Array(bestJ);
  let i = n;
  let j = bestJ;
  let tailMisses = 0;
  let tailOpen = true;
  while (i > 0 || j > 0) {
    const o = op[i * W + j];
    if (o === 1 || o === 2) {
      status[j - 1] = o === 1 ? 'ok' : 'wrong';
      if (o === 1) tailOpen = false;
      else if (tailOpen) tailMisses++;
      i--;
      j--;
    } else if (o === 3) {
      status[j - 1] = 'missed';
      j--;
    } else if (o === 4) {
      if (tailOpen) tailMisses++;
      i--;
    } else if (o === 5) {
      status[j - 1] = 'ok';
      tailOpen = false;
      i -= 2;
      j--;
    } else {
      status[j - 1] = 'ok';
      status[j - 2] = 'ok';
      tailOpen = false;
      i--;
      j -= 2;
    }
  }
  return { status, reached: bestJ, tailMisses };
}

/** Bewertung einer Seite aus der Zahl der Fehler. */
export function ratingFor(errors: number): 'sitzt' | 'wackelt' | 'fehler' {
  return errors === 0 ? 'sitzt' : errors <= 2 ? 'wackelt' : 'fehler';
}
