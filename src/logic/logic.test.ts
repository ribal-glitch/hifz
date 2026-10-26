import { describe, expect, it } from 'vitest';
import { addDays, formatMonthYear, logicalToday, type ISODate } from './dates';
import {
  cardStatus,
  darsPage,
  darsTask,
  effectiveBestand,
  ensureDay,
  freshPages,
  nextMurajaPreview,
  ratePage,
  logFreeReview,
  removeFreeReview,
  reviewedCount,
  rotationInfo,
  rotationPool,
  setDarsDone,
  setDarsEnabled,
  setDarsPage,
  setDarsWeekday,
  toggleFresh,
} from './plan';
import { createProfile, ribalPreset, type Profile, type Rating } from './profile';
import { addQuestion, newQuestion, rateQuestion } from './quiz';
import { meta, pageRangeLabel, range, textLines } from './quran';
import { calendar, hafizEstimate, juzStatus, markMilestonesSeen, newMilestones, progress, reachedMilestones, streak, suraStatus } from './stats';
import { claudeSummary } from './summary';

const START: ISODate = '2026-10-25'; // Sonntag

/** Einfacher, reproduzierbarer Zufall für die Tests */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function doEverything(p: Profile, date: ISODate, rating: (page: number) => Rating = () => 'sitzt'): Profile {
  p = ensureDay(p, date);
  if (darsTask(p, date)) p = setDarsDone(p, date, true);
  for (const f of freshPages(p, date)) p = toggleFresh(p, date, f);
  const m = p.days[date].muraja!;
  for (const page of [...m.pages, ...m.extra]) p = ratePage(p, date, page, rating(page));
  return p;
}

describe('Quran-Daten', () => {
  const ed = meta('1405');
  it('S. 293: Ende al-Isrāʾ, dann Beginn al-Kahf', () => {
    expect(ed.pageFirst[292]).toEqual([17, 105]);
    expect(ed.pageLast[292]).toEqual([18, 4]);
    expect(ed.suraPages[17][0]).toBe(293);
  });
  it('al-ʿAnkabūt beginnt auf S. 396, S. 397 = 29:7–14', () => {
    expect(ed.suraPages[28][0]).toBe(396);
    expect(pageRangeLabel('1405', 397)).toBe('Al-‘Ankabūt 7–14');
  });
  it('Juz 25 beginnt auf S. 482 (41:47), S. 604 endet mit an-Nās', () => {
    expect(ed.juzPages[24][0]).toBe(482);
    expect(ed.pageFirst[481]).toEqual([41, 47]);
    expect(ed.pageLast[603]).toEqual([114, 6]);
  });
  it('15 Zeilen je Seite, außer S. 1 und 2', () => {
    expect(ed.pageLines.filter((n) => n === 15).length).toBe(602);
    expect(textLines('1405', 396)).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15]); // Z. 8–9: Kopf + Basmala al-ʿAnkabūt
  });
});

describe('Lerntag', () => {
  it('beginnt um 3 Uhr', () => {
    expect(logicalToday(new Date(2026, 9, 26, 1, 30))).toBe('2026-10-25');
    expect(logicalToday(new Date(2026, 9, 26, 3, 1))).toBe('2026-10-26');
  });
});

describe('Dars-Portionen', () => {
  const p = ribalPreset(START);
  const expected: [ISODate, string][] = [
    ['2026-10-23', 'portion 1-3'], // Fr
    ['2026-10-24', 'portion 4-6'], // Sa
    ['2026-10-25', 'portion 7-9'], // So
    ['2026-10-26', 'portion 10-12'], // Mo
    ['2026-10-27', 'portion 13-15'], // Di
    ['2026-10-28', 'rehearsal'], // Mi
    ['2026-10-29', 'lecture'], // Do
  ];
  it.each(expected)('%s → %s auf S. 397', (date, want) => {
    const t = darsTask(p, date)!;
    expect(t.page).toBe(397);
    expect(t.kind === 'portion' ? `portion ${t.from}-${t.to}` : t.kind).toBe(want);
  });

  it('rückt nach Donnerstag eine Seite weiter', () => {
    expect(darsPage(p, '2026-10-29')).toBe(397);
    expect(darsPage(p, '2026-10-30')).toBe(398);
    expect(darsTask(p, '2026-10-30')).toMatchObject({ kind: 'portion', page: 398, from: 1, to: 3 });
    expect(darsTask(p, '2026-11-05')).toMatchObject({ kind: 'lecture', page: 398 });
    expect(darsPage(p, '2026-11-06')).toBe(399);
  });

  it('verschiebt die Portionen mit dem Dars-Tag', () => {
    const mon = setDarsWeekday(p, START, 1); // ab jetzt Vortrag montags
    expect(darsTask(mon, START)).toMatchObject({ kind: 'rehearsal', page: 397 }); // So
    expect(darsTask(mon, '2026-10-26')).toMatchObject({ kind: 'lecture', page: 397 }); // Mo
    expect(darsTask(mon, '2026-10-27')).toMatchObject({ kind: 'portion', page: 398, from: 1, to: 3 }); // Di
    expect(darsTask(mon, '2026-10-31')).toMatchObject({ kind: 'portion', from: 13, to: 15 }); // Sa
    expect(darsTask(mon, '2026-11-01')).toMatchObject({ kind: 'rehearsal' }); // So
    expect(darsTask(mon, '2026-11-02')).toMatchObject({ kind: 'lecture', page: 398 }); // Mo
    expect(darsPage(mon, '2026-11-03')).toBe(399);
  });

  it('lässt sich korrigieren', () => {
    const fixed = setDarsPage(p, '2026-11-08', 401);
    expect(darsPage(fixed, '2026-11-08')).toBe(401);
    expect(darsPage(fixed, '2026-11-13')).toBe(402);
    expect(freshPages(fixed, '2026-11-08')).toEqual([397, 398, 399, 400]);
  });
});

describe('Frische Dars-Seiten und Bestand', () => {
  const p = ribalPreset(START);
  it('wachsen mit jedem Vortrag, maximal 4', () => {
    expect(freshPages(p, START)).toEqual([396]);
    expect(freshPages(p, '2026-10-30')).toEqual([396, 397]);
    expect(freshPages(p, '2026-11-27')).toEqual([398, 399, 400, 401]);
  });
  it('ältere Dars-Seiten wandern in die Rotation', () => {
    const pool = rotationPool(p, '2026-11-27');
    expect(pool).toContain(396);
    expect(pool).toContain(397);
    expect(pool).not.toContain(398);
    expect(pool).not.toContain(402); // aktuelle Dars-Seite
  });
  it('Fortschritt zählt gelernte Dars-Seiten mit', () => {
    expect(progress(p, START)).toEqual({ pages: 227, percent: (227 / 604) * 100, juz: 11.4 });
    expect(progress(p, '2026-10-30').pages).toBe(228);
  });
  it('Dars ausschalten behält die gelernten Seiten', () => {
    const off = setDarsEnabled(p, '2026-11-27', false);
    expect(effectiveBestand(off, '2026-11-27').size).toBe(232);
    expect(darsTask(off, '2026-11-27')).toBeNull();
    expect(freshPages(off, '2026-11-27')).toEqual([]);
  });
});

describe('Murājaʿa-Rotation', () => {
  it('läuft fortlaufend über mehrere Tage und springt am Ende an den Anfang', () => {
    let p = ribalPreset(START);
    const blocks: number[][] = [];
    let d = START;
    for (let i = 0; i < 3; i++) {
      p = doEverything(p, d);
      blocks.push(p.days[d].muraja!.pages);
      d = addDays(d, 1);
    }
    expect(blocks).toEqual([range(293, 297), range(298, 302), range(303, 307)]);

    p = { ...p, murajaNext: 601 };
    p = ensureDay(p, d);
    expect(p.days[d].muraja!.pages).toEqual([601, 602, 603, 604, 293]);
    p = doEverything(p, d);
    expect(p.murajaNext).toBe(294);
  });

  it('überspringt die frische Dars-Seite und die aktuelle Dars-Seite', () => {
    let p = { ...ribalPreset(START), murajaNext: 393 };
    p = ensureDay(p, START);
    expect(p.days[START].muraja!.pages).toEqual([393, 394, 395, 482, 483]);
  });

  it('wiederholt nicht bewertete Seiten am nächsten Tag', () => {
    let p = ensureDay(ribalPreset(START), START);
    p = ratePage(p, START, 293, 'sitzt');
    p = ratePage(p, START, 294, 'sitzt');
    const next = addDays(START, 1);
    p = ensureDay(p, next);
    expect(p.days[next].muraja!.pages).toEqual(range(295, 299));
  });

  it('Anzahl pro Tag ist einstellbar', () => {
    const p = ensureDay({ ...ribalPreset(START), murajaPerDay: 10 }, START);
    expect(p.days[START].muraja!.pages).toEqual(range(293, 302));
    expect(nextMurajaPreview(doEverything(p, START), START)).toEqual(range(303, 312));
  });
});

describe('Schwachstellen', () => {
  it('kommen zusätzlich dran (max. 2) und verschwinden nach „sitzt“', () => {
    let p = ribalPreset(START);
    const rate1: Record<number, Rating> = { 294: 'wackelt', 295: 'fehler', 296: 'wackelt' };
    p = doEverything(p, START, (page) => rate1[page] ?? 'sitzt');

    const d2 = addDays(START, 1);
    p = ensureDay(p, d2);
    expect(p.days[d2].muraja).toEqual({ pages: range(298, 302), extra: [295, 294] });
    // 295 sitzt wieder, 294 wackelt weiter
    p = doEverything(p, d2, (page) => (page === 294 ? 'wackelt' : 'sitzt'));
    expect(cardStatus(p, d2).muraja).toBe(true);

    const d3 = addDays(START, 2);
    p = ensureDay(p, d3);
    expect(p.days[d3].muraja!.extra).toEqual([296, 294]);
    p = doEverything(p, d3);

    const d4 = addDays(START, 3);
    p = ensureDay(p, d4);
    expect(p.days[d4].muraja!.extra).toEqual([]);
  });

  it('Seiten im heutigen Block kommen nicht doppelt', () => {
    let p = doEverything(ribalPreset(START), START, (page) => (page === 293 ? 'fehler' : 'sitzt'));
    p = { ...p, murajaNext: 293 };
    const d2 = addDays(START, 1);
    p = ensureDay(p, d2);
    expect(p.days[d2].muraja).toEqual({ pages: range(293, 297), extra: [] });
  });
});

describe('Nachprüfung ehemaliger Schwachstellen', () => {
  it('kommt nach 3 und nach 7 Tagen wieder, dann ist die Seite fest', () => {
    let p = doEverything(ribalPreset(START), START, (page) => (page === 294 ? 'fehler' : 'sitzt'));
    const d1 = addDays(START, 1);
    p = ensureDay(p, d1);
    expect(p.days[d1].muraja!.extra).toEqual([294]);
    p = doEverything(p, d1); // 294 sitzt wieder
    expect(p.pages[294]).toMatchObject({ r: 'sitzt', due: addDays(d1, 3), step: 1 });

    for (let i = 2; i <= 3; i++) {
      const d = addDays(START, i);
      p = ensureDay(p, d);
      expect(p.days[d].muraja!.extra).toEqual([]);
      p = doEverything(p, d);
    }
    const d4 = addDays(START, 4); // 3 Tage nach d1
    p = ensureDay(p, d4);
    expect(p.days[d4].muraja!.extra).toEqual([294]);
    p = doEverything(p, d4);
    expect(p.pages[294]).toMatchObject({ due: addDays(d4, 7), step: 2 });

    const d11 = addDays(d4, 7);
    p = ensureDay(p, d11);
    expect(p.days[d11].muraja!.extra).toContain(294);
    p = doEverything(p, d11);
    expect(p.pages[294].due).toBeUndefined();
  });

  it('echte Schwachstellen haben Vorrang, zusammen höchstens 2', () => {
    let p = ribalPreset(START);
    p = {
      ...p,
      pages: {
        500: { r: 'sitzt', d: '2026-10-20', due: '2026-10-23', step: 1 },
        501: { r: 'wackelt', d: '2026-10-24' },
        502: { r: 'fehler', d: '2026-10-24' },
      },
    };
    p = ensureDay(p, START);
    expect(p.days[START].muraja!.extra).toEqual([502, 501]);
  });

  it('eine Korrektur am selben Tag rechnet mit dem Stand von vorher', () => {
    let p = ensureDay({ ...ribalPreset(START), pages: { 293: { r: 'fehler', d: '2026-10-20' } } }, START);
    p = ratePage(p, START, 293, 'wackelt');
    p = ratePage(p, START, 293, 'sitzt');
    expect(p.pages[293]).toMatchObject({ r: 'sitzt', due: addDays(START, 3), step: 1 });
  });
});

describe('Wiederholung außerhalb des Plans', () => {
  it('zählt für Schwachstellen und Festigung, verschiebt die Rotation nicht', () => {
    let p = ensureDay(ribalPreset(START), START);
    p = logFreeReview(p, START, [500, 501, 502], 'sitzt');
    p = logFreeReview(p, START, [503], 'wackelt');
    expect(p.days[START].free).toHaveLength(4);
    expect(p.pages[503]).toMatchObject({ r: 'wackelt' });
    expect(p.murajaNext).toBe(293);
    expect(reviewedCount(p, START)).toEqual({ plan: 0, free: 4 });
    expect(p.days[START].touched).toBe(true);
    expect(p.days[START].complete).toBe(false);
    const d2 = addDays(START, 1);
    p = ensureDay(p, d2);
    expect(p.days[d2].muraja!.extra).toEqual([503]);
  });

  it('Entfernen stellt den vorherigen Stand wieder her', () => {
    let p = ensureDay({ ...ribalPreset(START), pages: { 510: { r: 'wackelt', d: '2026-10-20' } } }, START);
    p = logFreeReview(p, START, [510], 'sitzt');
    expect(p.pages[510]).toMatchObject({ r: 'sitzt', step: 1 });
    p = removeFreeReview(p, START, 510);
    expect(p.pages[510]).toEqual({ r: 'wackelt', d: '2026-10-20' });
    expect(p.days[START].free).toEqual([]);
  });
});

describe('Durchgang', () => {
  it('zeigt Position und Dauer eines Durchgangs', () => {
    let p = ensureDay(ribalPreset(START), START);
    expect(rotationInfo(p, START)).toEqual({ size: 226, position: 1, cycleDays: 46 });
    p = doEverything(p, START);
    const d2 = addDays(START, 1);
    p = ensureDay(p, d2);
    expect(rotationInfo(p, d2).position).toBe(6);
  });
});

describe('Erledigt, Serie und Kalender', () => {
  it('Tag ist erst erledigt, wenn alle Karten erledigt sind', () => {
    let p = ensureDay(ribalPreset(START), START);
    expect(cardStatus(p, START)).toEqual({ dars: false, fresh: false, muraja: false });
    p = setDarsDone(p, START, true);
    p = toggleFresh(p, START, 396);
    expect(p.days[START].complete).toBe(false);
    for (const page of range(293, 297)) p = ratePage(p, START, page, 'sitzt');
    expect(p.days[START].complete).toBe(true);
  });

  it('zählt Tage am Stück, ein offener heutiger Tag unterbricht nicht', () => {
    let p = ribalPreset(START);
    let d = START;
    for (let i = 0; i < 4; i++) {
      p = doEverything(p, d);
      d = addDays(d, 1);
    }
    expect(streak(p, addDays(START, 3))).toBe(4);
    expect(streak(p, addDays(START, 4))).toBe(4); // heute noch offen
    expect(streak(p, addDays(START, 5))).toBe(0); // gestern verpasst
    const cal = calendar(p, addDays(START, 4));
    expect(cal).toHaveLength(4);
    expect(cal[3].some((c) => c.today)).toBe(true);
    expect(cal.flat().filter((c) => c.state === 'complete')).toHaveLength(4);
  });

  it('Profil ohne Dars hat nur die Murājaʿa', () => {
    const friend = createProfile({ name: 'Yusuf', today: START, bestand: range(582, 604), dars: { enabled: false } });
    const p = ensureDay(friend, START);
    expect(cardStatus(p, START)).toEqual({ dars: null, fresh: null, muraja: false });
  });
});

describe('Mini-Prüfung', () => {
  it('wählt Stellen aus dem Bestand; Übergänge nur zwischen zwei gelernten Seiten', () => {
    const p = ribalPreset(START);
    const rng = seeded(7);
    const set = effectiveBestand(p, START);
    let transitions = 0;
    for (let i = 0; i < 300; i++) {
      const q = newQuestion(p, START, rng)!;
      expect(set.has(q.page)).toBe(true);
      if (q.kind === 'transition') {
        transitions++;
        expect(set.has(q.page + 1)).toBe(true);
      } else {
        expect(textLines('1405', q.page)).toContain(q.line);
      }
    }
    expect(transitions).toBeGreaterThan(90);
  });

  it('Schwachstellen kommen öfter dran, Fehler markieren die Seite', () => {
    let p = ribalPreset(START);
    p = { ...p, pages: { 341: { r: 'fehler', d: '2026-10-20' } } };
    const rng = seeded(3);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const q = newQuestion(p, START, rng)!;
      if (q.page === 341 || (q.kind === 'transition' && q.page === 340)) hits++;
    }
    expect(hits).toBeGreaterThan(6); // ohne Gewichtung ≈ 2–3

    p = addQuestion(p, START, { kind: 'start', page: 512, line: 8, ok: null });
    p = rateQuestion(p, START, 0, false);
    expect(p.pages[512]).toEqual({ r: 'wackelt', d: START });
  });
});

describe('Fortschritt', () => {
  const p = ribalPreset(START);
  it('Juz-Kacheln: 16–19 und 25–30 voll, 15 und 20 teilweise', () => {
    const j = juzStatus(p, START);
    expect(j.filter((x) => x.state === 'full').map((x) => x.juz)).toEqual([16, 17, 18, 19, 25, 26, 27, 28, 29, 30]);
    expect(j.filter((x) => x.state === 'partial').map((x) => x.juz)).toEqual([15, 20]);
  });
  it('Suren 18–28 auswendig, al-ʿAnkabūt im Dars', () => {
    const s = suraStatus(p, START);
    expect(s.filter((x) => x.state === 'auswendig').map((x) => x.sura)).toEqual([...range(18, 28), ...range(42, 114)]);
    expect(s[28].state).toBe('dars');
    expect(s[16].state).toBe('teilweise');
  });
  it('Meilensteine', () => {
    expect(reachedMilestones(p, START)).toEqual([10, 20, 25, 30]);
    const seen = markMilestonesSeen(p, START);
    expect(newMilestones(seen, START)).toEqual([]);
    const more = { ...seen, bestand: [...seen.bestand, ...range(400, 420)] };
    expect(newMilestones(more, START)).toEqual([40]);
  });
});

describe('Ziel-Rechner', () => {
  it('schätzt das Datum, an dem der ganze Quran sitzt', () => {
    const p = ribalPreset(START);
    expect(hafizEstimate(p, START, 1)).toEqual({ left: 377, weeks: 377, date: addDays(START, 377 * 7) });
    expect(hafizEstimate(p, START, 2).weeks).toBe(189);
    expect(hafizEstimate(p, START, 0.5).weeks).toBe(754);
    expect(formatMonthYear(hafizEstimate(p, START, 1).date)).toBe('Januar 2034');
  });
});

describe('Stand für Claude', () => {
  it('enthält Datum, Dars-Seite, gestern, Serie, Schwachstellen und nächste Seiten', () => {
    let p = ribalPreset(START);
    const yesterday = addDays(START, -1);
    p = doEverything(p, yesterday, (page) => (page === 295 ? 'wackelt' : 'sitzt'));
    p = ensureDay(p, START);
    const text = claudeSummary(p, START);
    expect(text).toContain('Hifz-Stand von Ribal · So, 25.10.2026');
    expect(text).toContain('Bestand: 227 von 604 Seiten (37,6 %, ca. 11,4 Juz) · S. 293–396, 482–604');
    expect(text).toContain('Dars: S. 397 (Al-‘Ankabūt 7–14) · heute Zeilen 7–9 · Vortrag Do');
    expect(text).toContain('Gestern – Sa, 24.10.: Dars ✓ · Frische Seiten 1/1 · Murājaʿa 5/5 (4× sitzt, 1× wackelt)');
    expect(text).toContain('Serie: 1 Tag am Stück');
    expect(text).toContain('Schwachstellen: S. 295 (wackelt, 24.10.)');
    expect(text).toContain('Murājaʿa heute: S. 298–302');
  });
});
