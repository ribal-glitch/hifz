import { addDays, weekday, type ISODate } from './dates';
import { darsPage, effectiveBestand } from './plan';
import type { Profile } from './profile';
import { JUZ_COUNT, PAGE_COUNT, SURAS, juzPages, range, suraPages } from './quran';

export interface Progress {
  pages: number;
  percent: number;
  /** Juz-Äquivalent (Seiten ÷ 20), auf eine Stelle gerundet */
  juz: number;
}

export function progress(profile: Profile, date: ISODate): Progress {
  const pages = effectiveBestand(profile, date).size;
  return { pages, percent: (pages / PAGE_COUNT) * 100, juz: Math.round(pages / 2) / 10 };
}

export type TileState = 'full' | 'partial' | 'open';

export function juzStatus(profile: Profile, date: ISODate): { juz: number; state: TileState; done: number; total: number }[] {
  const set = effectiveBestand(profile, date);
  return range(1, JUZ_COUNT).map((juz) => {
    const [a, b] = juzPages(profile.edition, juz);
    const pages = range(a, b);
    const done = pages.filter((p) => set.has(p)).length;
    return { juz, done, total: pages.length, state: done === pages.length ? 'full' : done ? 'partial' : 'open' };
  });
}

export type SuraState = 'auswendig' | 'dars' | 'teilweise' | 'offen';

export function suraStatus(
  profile: Profile,
  date: ISODate,
): { sura: number; state: SuraState; done: number; total: number; from: number; to: number }[] {
  const set = effectiveBestand(profile, date);
  const dp = profile.dars.enabled ? darsPage(profile, date) : -1;
  return SURAS.map((s) => {
    const [from, to] = suraPages(profile.edition, s.n);
    const pages = range(from, to);
    const done = pages.filter((p) => set.has(p)).length;
    let state: SuraState = done === pages.length ? 'auswendig' : done ? 'teilweise' : 'offen';
    if (state !== 'auswendig' && dp >= from && dp <= to) state = 'dars';
    return { sura: s.n, state, done, total: pages.length, from, to };
  });
}

/**
 * Sura als auswendig eintragen (alle ihre Seiten in den Bestand) oder wieder austragen.
 * Beim Austragen bleiben Seiten stehen, die eine andere, weiterhin auswendige Sura mitbenutzt.
 */
export function setSuraMemorized(profile: Profile, date: ISODate, sura: number, on: boolean): Profile {
  const [from, to] = suraPages(profile.edition, sura);
  const pages = range(from, to);
  const set = new Set(profile.bestand);
  if (on) {
    for (const p of pages) set.add(p);
  } else {
    const keep = new Set<number>();
    for (const s of suraStatus(profile, date)) {
      if (s.sura === sura || s.state !== 'auswendig') continue;
      for (let p = s.from; p <= s.to; p++) keep.add(p);
    }
    for (const p of pages) if (!keep.has(p)) set.delete(p);
  }
  return { ...profile, bestand: [...set].sort((a, b) => a - b) };
}

export function consolidation(profile: Profile, date: ISODate) {
  const set = effectiveBestand(profile, date);
  let sitzt = 0;
  let wackelt = 0;
  let fehler = 0;
  for (const p of set) {
    const r = profile.pages[p]?.r;
    if (r === 'sitzt') sitzt++;
    else if (r === 'wackelt') wackelt++;
    else if (r === 'fehler') fehler++;
  }
  return { total: set.size, sitzt, wackelt, fehler, unrated: set.size - sitzt - wackelt - fehler };
}

/** Tage am Stück mit vollständig erledigter Einheit. Ein noch offener heutiger Tag unterbricht die Serie nicht. */
export function streak(profile: Profile, date: ISODate): number {
  let d = profile.days[date]?.complete ? date : addDays(date, -1);
  let n = 0;
  while (profile.days[d]?.complete) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export type CalendarCell = { date: ISODate; state: 'complete' | 'partial' | 'none' | 'future'; today: boolean };

/** Die letzten 4 Wochen als Raster Montag–Sonntag; die letzte Zeile enthält heute. */
export function calendar(profile: Profile, date: ISODate): CalendarCell[][] {
  const mondayOffset = (weekday(date) + 6) % 7;
  const start = addDays(date, -mondayOffset - 21);
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < 4; w++) {
    const row: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i);
      const rec = profile.days[d];
      const state = d > date ? 'future' : rec?.complete ? 'complete' : rec?.touched ? 'partial' : 'none';
      row.push({ date: d, state, today: d === date });
    }
    weeks.push(row);
  }
  return weeks;
}

export const MILESTONES: { percent: number; label: string }[] = [
  { percent: 10, label: '10 %' },
  { percent: 20, label: '20 %' },
  { percent: 25, label: 'Ein Viertel' },
  { percent: 30, label: '30 %' },
  { percent: 40, label: '40 %' },
  { percent: 50, label: 'Halber Quran' },
  { percent: 60, label: '60 %' },
  { percent: 70, label: '70 %' },
  { percent: 75, label: 'Drei Viertel' },
  { percent: 80, label: '80 %' },
  { percent: 90, label: '90 %' },
  { percent: 100, label: 'Ganzer Quran' },
];

/** Seiten, die für einen Meilenstein nötig sind. */
export function pagesForMilestone(percent: number): number {
  return Math.ceil((percent / 100) * PAGE_COUNT);
}

export function reachedMilestones(profile: Profile, date: ISODate): number[] {
  const { pages } = progress(profile, date);
  return MILESTONES.filter((m) => pages >= pagesForMilestone(m.percent)).map((m) => m.percent);
}

/** Erreicht, aber noch nicht gefeiert. */
export function newMilestones(profile: Profile, date: ISODate): number[] {
  return reachedMilestones(profile, date).filter((m) => !profile.milestonesSeen.includes(m));
}

export function markMilestonesSeen(profile: Profile, date: ISODate): Profile {
  const seen = new Set([...profile.milestonesSeen, ...reachedMilestones(profile, date)]);
  return { ...profile, milestonesSeen: [...seen].sort((a, b) => a - b) };
}

export const PACE_OPTIONS = [0.5, 1, 2, 3, 5, 7];

/** Wann wäre der ganze Quran auswendig, bei gleichbleibendem Tempo (neue Seiten pro Woche)? */
export function hafizEstimate(profile: Profile, date: ISODate, pagesPerWeek: number): { left: number; weeks: number; date: ISODate } {
  const left = PAGE_COUNT - effectiveBestand(profile, date).size;
  const weeks = left > 0 ? Math.ceil(left / pagesPerWeek) : 0;
  return { left, weeks, date: addDays(date, weeks * 7) };
}

/** Standard-Tempo: gewählter Wert, sonst 1 Seite pro Woche (Dars-Rhythmus). */
export function defaultPace(profile: Profile): number {
  return profile.goalPace ?? 1;
}
