import { describe, expect, it } from 'vitest';
import { suraEndLine, suraPages, suraStartLine } from './quran';

describe('Sura-Anfang und -Ende auf der Seite', () => {
  it('findet Kopfzeilen auch mitten auf der Seite', () => {
    // al-ʿAnkabūt beginnt mitten auf S. 396, nach dem Ende von al-Qaṣaṣ
    expect(suraPages('1405', 29)[0]).toBe(396);
    expect(suraStartLine('1405', 29)).toBeGreaterThan(1);
    expect(suraEndLine('1405', 28)).toBe(suraStartLine('1405', 29) - 1);
    // al-Baqara beginnt oben auf S. 2
    expect(suraStartLine('1405', 2)).toBe(1);
    // kurze Suren am Ende: an-Nās ist die letzte Sura auf S. 604
    expect(suraEndLine('1405', 114)).toBe(15);
    expect(suraStartLine('1405', 113)).toBeLessThan(suraStartLine('1405', 114));
  });
});
