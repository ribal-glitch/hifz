import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { align, buildIndex, flatten, locate, ratingFor, skeleton, spokenWords } from './recite';
import { SURA_AYAH_START } from '../data/meta.generated';

const text = JSON.parse(readFileSync('public/data/text.json', 'utf8')) as { ayahs: string[][] };
const flat = flatten(text.ayahs);
const index = buildIndex(flat);
const posOf = (sura: number, ayah: number) => flat.findIndex((f) => f.a === SURA_AYAH_START[sura - 1] + ayah - 1);

/** So etwa liefert die Spracherkennung: ohne Zeichen, in heutiger Schreibweise */
const plain = (from: number, n: number) => flat.slice(from, from + n).map((f) => f.k);

describe('Rezitation abgleichen', () => {
  it('Mushaf-Schreibweise und heutige Schreibweise ergeben dasselbe Gerüst', () => {
    expect(skeleton(text.ayahs[1][0])).toBe(skeleton('الحمد'));
    expect(skeleton(text.ayahs[1][3])).toBe(skeleton('العالمين'));
    expect(spokenWords('الحمد لله رب العالمين')).toHaveLength(4);
  });

  it('findet die Stelle aus wenigen Wörtern', () => {
    // Āyat al-Kursī, in heutiger Schreibweise wie von der Erkennung
    const p = locate(index, spokenWords('الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم'));
    expect(p).toBe(posOf(2, 255));
  });

  it('bei mehrfach vorkommenden Stellen entscheidet die Vorliebe', () => {
    const a = posOf(55, 13);
    const spoken = plain(a, 4);
    expect(locate(index, spoken)).toBeNull();
    const want = posOf(55, 30);
    expect(locate(index, spoken, (pos) => pos === want)).toBe(want);
  });

  it('fehlerfrei rezitiert: alles ok', () => {
    const s = posOf(18, 1);
    const r = align(flat, s, plain(s, 40));
    expect(r.reached).toBe(40);
    expect(r.status.every((x) => x === 'ok')).toBe(true);
  });

  it('ausgelassene und falsche Wörter werden markiert, Wiederholtes nicht', () => {
    const s = posOf(18, 1);
    const spoken = plain(s, 30);
    spoken.splice(10, 2); // zwei Wörter ausgelassen
    spoken[20] = 'كتب'; // ein falsches Wort (erwartet: Position 22)
    spoken.splice(5, 0, spoken[3], spoken[4]); // zwei Wörter wiederholt
    const r = align(flat, s, spoken);
    expect(r.reached).toBe(30);
    expect(r.status[10]).toBe('missed');
    expect(r.status[11]).toBe('missed');
    expect(r.status[22]).toBe('wrong');
    expect(r.status.filter((x) => x !== 'ok')).toHaveLength(3);
  });

  it('يا أيها als zwei Wörter und Einzelbuchstaben am Sura-Anfang zählen nicht als Fehler', () => {
    const s = posOf(2, 21);
    const r = align(flat, s, spokenWords('يا أيها الناس اعبدوا ربكم الذي خلقكم'));
    expect(r.status.slice(0, 5).every((x) => x === 'ok')).toBe(true);
    const b = posOf(2, 1);
    const r2 = align(flat, b, spokenWords('بسم الله الرحمن الرحيم ألف لام ميم ذلك الكتاب لا ريب فيه هدى للمتقين'));
    expect(r2.status.filter((x) => x !== 'ok')).toHaveLength(0);
    expect(r2.reached).toBe(8);
    // أَلَمۡ نَشۡرَحۡ ist dagegen ein normales Wort
    expect(flat[posOf(94, 1)].free).toBeUndefined();
  });

  it('Bewertung aus der Fehlerzahl', () => {
    expect([0, 2, 3].map(ratingFor)).toEqual(['sitzt', 'wackelt', 'fehler']);
  });
});
