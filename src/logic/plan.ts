import { addDays, daysBetween, weekday, type ISODate } from './dates';
import {
  FRESH_COUNT,
  MAX_EXTRA_PER_DAY,
  type DayRecord,
  type Profile,
  type Rating,
} from './profile';
import { PAGE_COUNT, pageLineCount, range } from './quran';

// ---------- Dars ----------

/** Erster Tag der Dars-Woche (der Tag nach dem Vortrag), in der `date` liegt. */
export function cycleStart(date: ISODate, lectureWeekday: number): ISODate {
  const startDow = (lectureWeekday + 1) % 7;
  const back = (weekday(date) - startDow + 7) % 7;
  return addDays(date, -back);
}

/** 0 = erster Tag nach dem Vortrag … 6 = Vortragstag */
export function cycleDay(date: ISODate, lectureWeekday: number): number {
  return daysBetween(cycleStart(date, lectureWeekday), date);
}

/** Aktuelle Dars-Seite: rückt nach jedem Vortragstag eine Seite weiter. */
export function darsPage(profile: Profile, date: ISODate): number {
  const { page, since, weekday: wd, startPage } = profile.dars;
  const weeks = Math.round(daysBetween(cycleStart(since, wd), cycleStart(date, wd)) / 7);
  return Math.max(startPage, Math.min(PAGE_COUNT, page + weeks));
}

export type DarsTask =
  | { kind: 'portion'; page: number; day: number; from: number; to: number }
  | { kind: 'rehearsal'; page: number; day: number }
  | { kind: 'lecture'; page: number; day: number };

/** Zeilen der Portion k (0–4) einer Seite mit n Zeilen: 15 Zeilen → 1–3, 4–6, 7–9, 10–12, 13–15. */
export function portionLines(n: number, k: number): [number, number] {
  return [Math.floor((k * n) / 5) + 1, Math.floor(((k + 1) * n) / 5)];
}

export function darsTask(profile: Profile, date: ISODate): DarsTask | null {
  if (!profile.dars.enabled) return null;
  const page = darsPage(profile, date);
  const day = cycleDay(date, profile.dars.weekday);
  if (day <= 4) {
    const [from, to] = portionLines(pageLineCount(profile.edition, page), day);
    return { kind: 'portion', page, day, from, to };
  }
  if (day === 5) return { kind: 'rehearsal', page, day };
  return { kind: 'lecture', page, day };
}

/** Alle bisher im Dars gelernten Seiten (vor der aktuellen Dars-Seite). */
export function learnedDarsPages(profile: Profile, date: ISODate): number[] {
  if (!profile.dars.enabled) return [];
  return range(profile.dars.startPage, darsPage(profile, date) - 1);
}

/** Die letzten vier im Dars gelernten Seiten: täglich einmal aufsagen. */
export function freshPages(profile: Profile, date: ISODate): number[] {
  return learnedDarsPages(profile, date).slice(-FRESH_COUNT);
}

/** Bestand einschließlich der im Dars gelernten Seiten. */
export function effectiveBestand(profile: Profile, date: ISODate): Set<number> {
  const set = new Set(profile.bestand);
  for (const p of learnedDarsPages(profile, date)) set.add(p);
  return set;
}

// ---------- Murājaʿa ----------

/** Seiten, die in der Rotation laufen: Bestand ohne frische Dars-Seiten und ohne aktuelle Dars-Seite. */
export function rotationPool(profile: Profile, date: ISODate): number[] {
  const set = effectiveBestand(profile, date);
  for (const p of freshPages(profile, date)) set.delete(p);
  if (profile.dars.enabled) set.delete(darsPage(profile, date));
  return [...set].sort((a, b) => a - b);
}

/** N zusammenhängende Seiten des Pools ab `startAt` (mit Umbruch ans Ende). */
export function murajaBlock(pool: number[], startAt: number, n: number): number[] {
  if (!pool.length) return [];
  let i = pool.findIndex((p) => p >= startAt);
  if (i < 0) i = 0;
  const out: number[] = [];
  for (let k = 0; k < Math.min(n, pool.length); k++) out.push(pool[(i + k) % pool.length]);
  return out;
}

export function isWeak(r: Rating | undefined): boolean {
  return r === 'wackelt' || r === 'fehler';
}

/** Schwachstellen, die zusätzlich drankommen: zuerst „Fehler“, dann die am längsten zurückliegenden. */
export function weakPages(profile: Profile, date: ISODate): number[] {
  const bestand = effectiveBestand(profile, date);
  return Object.entries(profile.pages)
    .map(([p, s]) => ({ page: Number(p), ...s }))
    .filter((s) => isWeak(s.r) && bestand.has(s.page))
    .sort((a, b) => (a.r === b.r ? (a.d < b.d ? -1 : a.d > b.d ? 1 : a.page - b.page) : a.r === 'fehler' ? -1 : 1))
    .map((s) => s.page);
}

function planMuraja(profile: Profile, date: ISODate): { pages: number[]; extra: number[] } {
  const pool = rotationPool(profile, date);
  const pages = murajaBlock(pool, profile.murajaNext, profile.murajaPerDay);
  const excluded = new Set([...pages, ...freshPages(profile, date)]);
  if (profile.dars.enabled) excluded.add(darsPage(profile, date));
  const extra = weakPages(profile, date)
    .filter((p) => !excluded.has(p) && (profile.pages[p]?.d ?? '') < date)
    .slice(0, MAX_EXTRA_PER_DAY);
  return { pages, extra };
}

export function emptyDay(date: ISODate): DayRecord {
  return {
    date,
    darsDone: false,
    freshDone: [],
    muraja: null,
    ratings: {},
    note: '',
    quiz: [],
    complete: false,
    touched: false,
  };
}

/** Legt den Plan des Tages beim ersten Öffnen fest (danach bleibt er stabil). */
export function ensureDay(profile: Profile, date: ISODate): Profile {
  const existing = profile.days[date];
  if (existing?.muraja) return profile;
  const day = existing ? { ...existing } : emptyDay(date);
  day.muraja = planMuraja(profile, date);
  return { ...profile, days: { ...profile.days, [date]: day } };
}

/** Plant die Murājaʿa des Tages neu, solange noch nichts bewertet wurde (z. B. nach Änderung der Einstellungen). */
export function replanIfUntouched(profile: Profile, date: ISODate): Profile {
  const day = profile.days[date];
  if (!day || Object.keys(day.ratings).length) return profile;
  return ensureDay({ ...profile, days: { ...profile.days, [date]: { ...day, muraja: null } } }, date);
}

export interface CardStatus {
  dars: boolean | null;
  fresh: boolean | null;
  muraja: boolean | null;
}

/** Status der drei Karten; null = Karte entfällt heute. */
export function cardStatus(profile: Profile, date: ISODate): CardStatus {
  const day = profile.days[date] ?? emptyDay(date);
  const dars = darsTask(profile, date);
  const fresh = freshPages(profile, date);
  const m = day.muraja;
  const mPages = m ? [...m.pages, ...m.extra] : [];
  return {
    dars: dars ? day.darsDone : null,
    fresh: fresh.length ? fresh.every((p) => day.freshDone.includes(p)) : null,
    muraja: mPages.length ? mPages.every((p) => day.ratings[p]) : null,
  };
}

function withStatus(profile: Profile, date: ISODate): Profile {
  const s = cardStatus(profile, date);
  const vals = [s.dars, s.fresh, s.muraja].filter((v) => v !== null);
  const day = profile.days[date];
  const touched =
    day.darsDone || day.freshDone.length > 0 || Object.keys(day.ratings).length > 0 || day.quiz.some((q) => q.ok !== null);
  return {
    ...profile,
    days: { ...profile.days, [date]: { ...day, complete: vals.length > 0 && vals.every(Boolean), touched } },
  };
}

export function updateDayRecord(profile: Profile, date: ISODate, fn: (d: DayRecord) => DayRecord): Profile {
  const p = ensureDay(profile, date);
  return withStatus({ ...p, days: { ...p.days, [date]: fn(p.days[date]) } }, date);
}

export function setDarsDone(profile: Profile, date: ISODate, done: boolean): Profile {
  return updateDayRecord(profile, date, (d) => ({ ...d, darsDone: done }));
}

export function toggleFresh(profile: Profile, date: ISODate, page: number): Profile {
  return updateDayRecord(profile, date, (d) => ({
    ...d,
    freshDone: d.freshDone.includes(page) ? d.freshDone.filter((p) => p !== page) : [...d.freshDone, page],
  }));
}

/**
 * Bewertet eine Murājaʿa-Seite. Die Rotation rückt bis zur ersten noch offenen
 * Seite des heutigen Blocks vor; ist der Block fertig, beginnt der nächste dahinter.
 */
export function ratePage(profile: Profile, date: ISODate, page: number, r: Rating): Profile {
  let p = updateDayRecord(profile, date, (d) => ({ ...d, ratings: { ...d.ratings, [page]: r } }));
  p = { ...p, pages: { ...p.pages, [page]: { r, d: date } } };
  const block = p.days[date].muraja?.pages ?? [];
  if (block.includes(page)) {
    const open = block.find((x) => !p.days[date].ratings[x]);
    p = { ...p, murajaNext: open ?? block[block.length - 1] + 1 };
  }
  return p;
}

export function setNote(profile: Profile, date: ISODate, note: string): Profile {
  return updateDayRecord(profile, date, (d) => ({ ...d, note }));
}

/** Vorschau: der Block, der nach dem heutigen Stand als Nächstes drankommt. */
export function nextMurajaPreview(profile: Profile, date: ISODate): number[] {
  const tomorrow = addDays(date, 1);
  return murajaBlock(rotationPool(profile, tomorrow), profile.murajaNext, profile.murajaPerDay);
}

// ---------- Einstellungen, die Folgen für den Bestand haben ----------

/** Dars-Seite korrigieren: gilt ab der Woche von `date`. */
export function setDarsPage(profile: Profile, date: ISODate, page: number): Profile {
  const startPage = Math.min(profile.dars.startPage, page);
  return { ...profile, dars: { ...profile.dars, page, since: date, startPage } };
}

/** Dars-Tag ändern, ohne dass sich die aktuelle Seite verschiebt. */
export function setDarsWeekday(profile: Profile, date: ISODate, wd: number): Profile {
  const page = darsPage(profile, date);
  return { ...profile, dars: { ...profile.dars, weekday: wd, page, since: date } };
}

/** Dars aus-/einschalten. Beim Ausschalten bleiben die gelernten Dars-Seiten im Bestand. */
export function setDarsEnabled(profile: Profile, date: ISODate, enabled: boolean, page?: number): Profile {
  if (!enabled) {
    const bestand = [...effectiveBestand(profile, date)].sort((a, b) => a - b);
    return { ...profile, bestand, dars: { ...profile.dars, enabled: false } };
  }
  const start = page ?? profile.dars.page;
  return { ...profile, dars: { ...profile.dars, enabled: true, page: start, since: date, startPage: start } };
}
