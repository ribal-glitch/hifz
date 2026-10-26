/**
 * Tajwīd-Farben für den KFGQPC-Text (Hafs ʿan ʿĀṣim).
 *
 * Der Uthmani-Text des Madina-Mushaf schreibt die Aussprache mit eigenen Zeichen aus,
 * daraus lassen sich die wichtigsten Regeln direkt ablesen – ohne Text zu verändern:
 *  - Sukūn (ۡ) = deutlich gesprochen; Nūn/Mīm ohne Zeichen = Ikhfāʾ oder Idghām
 *  - versetztes Tanwīn (ٗ ٖ ٞ) = Ikhfāʾ/Idghām, kleines Mīm (ۢ ۭ) = Iqlāb
 *  - Madda (ٓ) = langer Madd (4–6), Kreis (ْ ۠) = nicht gesprochener Buchstabe
 * Gefärbt wird immer der ganze Buchstabe samt seinen Zeichen.
 */
export type Tj = 'madd' | 'ghunna' | 'qalqala' | 'silent';

export interface Piece {
  t: string;
  c?: Tj;
}

export const TAJWEED_LEGEND: { c: Tj; label: string; hint: string }[] = [
  { c: 'madd', label: 'Madd', hint: 'lang dehnen, 4–6 Zählzeiten' },
  { c: 'ghunna', label: 'Ghunna', hint: 'Nasal: Ghunna, Ikhfāʾ, Idghām, Iqlāb' },
  { c: 'qalqala', label: 'Qalqala', hint: 'nachschwingen: ق ط ب ج د' },
  { c: 'silent', label: 'stumm', hint: 'nicht gesprochen' },
];

const SUKUN = 'ۡ';
const SILENT_MARKS = ['ْ', '۠'];
const SHADDA = 'ّ';
const MADDA = ['ٓ', 'ۤ'];
const OPEN_TANWEEN = ['ٖ', 'ٗ', 'ٞ'];
const SMALL_MEEM = ['ۢ', 'ۭ'];
const VOWELS = /[ً-ْٰٖٗٞۡ]/;
const QALQALA = 'قطبجد';
const IKHFA = 'تثجدذزسشصضطظفقك';
const IDGHAM_GHUNNA = 'ينمو';
const IDGHAM_NO_GHUNNA = 'لر';
const WASLA = 'ٱ';

/** zählt zum vorigen Buchstaben: Vokal- und Pausenzeichen, kleine Buchstaben */
const isMark = (ch: string) => /\p{M}/u.test(ch) || ch === 'ۥ' || ch === 'ۦ';
const isLetter = (ch: string) => /[ء-يٱ]/.test(ch);

/** Buchstaben, die nur nach rechts (zum vorigen) verbinden, und Hamza, das gar nicht verbindet */
const RIGHT_ONLY = 'اأإآٱدذرزوؤة';
const joinsNext = (ch: string) => (isLetter(ch) && !RIGHT_ONLY.includes(ch) && ch !== 'ء') || ch === 'ـ';
const joinsPrev = (ch: string) => (isLetter(ch) && ch !== 'ء') || ch === 'ـ';

interface Cluster {
  base: string;
  text: string;
  word: number;
  c?: Tj;
}

function clusters(words: string[]): Cluster[] {
  const out: Cluster[] = [];
  words.forEach((w, wi) => {
    for (const ch of w) {
      const last = out[out.length - 1];
      if (isMark(ch) && last && last.word === wi) last.text += ch;
      else out.push({ base: ch, text: ch, word: wi });
    }
  });
  return out;
}

/** Tajwīd-Klassen für eine Ajah; liefert je Wort die farbigen Teile. */
export function tajweedAyah(words: string[]): Piece[][] {
  const cl = clusters(words);
  const letters = cl.filter((c) => isLetter(c.base));
  letters.forEach((c, i) => {
    const marks = c.text.slice(c.base.length);
    const next = letters[i + 1];
    const has = (list: string[] | string) => [...list].some((m) => marks.includes(m));
    const bare = !VOWELS.test(marks);
    let tj: Tj | undefined;

    if (has(SILENT_MARKS)) tj = 'silent';
    else if (c.base === WASLA && i > 0) tj = 'silent';
    else if (c.base === 'ل' && bare && next?.text.includes(SHADDA) && next.word === c.word) tj = 'silent';
    else if (has(MADDA)) tj = 'madd';
    else if ((c.base === 'ن' || c.base === 'م') && marks.includes(SHADDA)) tj = 'ghunna';
    else if (has(SMALL_MEEM)) tj = 'ghunna';
    else if (next && (has(OPEN_TANWEEN) || (c.base === 'ن' && bare))) {
      const nb = next.base;
      if (IDGHAM_GHUNNA.includes(nb) || IKHFA.includes(nb) || nb === 'ب') tj = 'ghunna';
      else if (IDGHAM_NO_GHUNNA.includes(nb) && c.base === 'ن' && bare) tj = 'silent';
    } else if (c.base === 'م' && bare && next && (next.base === 'ب' || next.base === 'م')) tj = 'ghunna';
    else if (QALQALA.includes(c.base) && (marks.includes(SUKUN) || i === letters.length - 1)) tj = 'qalqala';

    c.c = tj;
  });

  // je Wort zusammenhängende Teile gleicher Farbe bilden
  const out: Piece[][] = words.map(() => []);
  for (const c of cl) {
    const pieces = out[c.word];
    const last = pieces[pieces.length - 1];
    if (last && last.c === c.c) last.t += c.text;
    else pieces.push({ t: c.text, c: c.c });
  }
  // An Farbgrenzen innerhalb eines Wortes die Verbindung der Buchstaben sichern (ZWJ)
  for (const pieces of out) {
    for (let i = 0; i + 1 < pieces.length; i++) {
      const left = [...pieces[i].t].reverse().find((ch) => !isMark(ch)) ?? '';
      const right = [...pieces[i + 1].t].find((ch) => !isMark(ch)) ?? '';
      if (joinsNext(left) && joinsPrev(right)) {
        pieces[i].t += '‍';
        pieces[i + 1].t = '‍' + pieces[i + 1].t;
      }
    }
  }
  return out;
}
