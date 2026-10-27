import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURA_AYAH_START } from '../data/meta.generated';
import { tajweedAyah, type Tj } from './tajweed';

const text = JSON.parse(readFileSync(new URL('../../public/data/text.json', import.meta.url), 'utf8')) as { ayahs: string[][] };
const words = (s: number, a: number) => text.ayahs[SURA_AYAH_START[s - 1] + a - 1].slice(0, -1);

/** Farbige Teile einer Ayah als „Buchstaben:Klasse“, ohne ZWJ */
function colored(s: number, a: number): string[] {
  return tajweedAyah(words(s, a))
    .flat()
    .filter((p) => p.c)
    .map((p) => `${p.t.replace(/‍/g, '')}:${p.c}`);
}
const has = (list: string[], c: Tj, startsWith: string) => list.some((x) => x.endsWith(`:${c}`) && x.startsWith(startsWith));

describe('Tajwīd', () => {
  it('lässt den Text unverändert (bis auf Verbinder an Farbgrenzen)', () => {
    for (const [s, a] of [
      [1, 7],
      [2, 2],
      [29, 10],
      [114, 6],
    ]) {
      const w = words(s, a);
      const back = tajweedAyah(w).map((ps) => ps.map((p) => p.t).join('').replace(/‍/g, ''));
      expect(back).toEqual(w);
    }
  });

  it('Madd auf dem Alif mit Madda (ٱلضَّآلِّينَ)', () => {
    expect(has(colored(1, 7), 'madd', 'ا\u0653')).toBe(true);
  });

  it('Hamzat al-Wasl und Lām schamsiyya stumm, außer am Ayah-Anfang', () => {
    const c = colored(1, 3); // ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
    expect(c.filter((x) => x.endsWith(':silent'))).toEqual(['ل:silent', 'ٱل:silent']);
  });

  it('Ghunna bei نّ und مّ (إِنَّ)', () => {
    expect(has(colored(2, 6), 'ghunna', 'نّ')).toBe(true);
  });

  it('Iqlāb: Nūn mit kleinem Mīm (أَنۢبِـُٔونِي)', () => {
    expect(has(colored(2, 31), 'ghunna', 'نۢ')).toBe(true);
  });

  it('Qalqala am Ayah-Ende (أَحَدٌ) und bei Sukūn', () => {
    expect(colored(112, 1).at(-1)).toMatch(/^دٌ?:qalqala$/);
    expect(has(colored(112, 3), 'qalqala', 'دۡ')).toBe(true); // لَمۡ يَلِدۡ
  });

  it('stumme Buchstaben mit Kreis (كَفَرُواْ)', () => {
    expect(has(colored(2, 6), 'silent', 'اْ')).toBe(true);
  });

  it('Idghām ohne Ghunna: Nūn vor Rāʾ wird nicht gesprochen (مِن رَّبِّهِمۡ)', () => {
    expect(has(colored(2, 5), 'silent', 'ن')).toBe(true);
  });
});
