import { addDays, type ISODate } from './dates';
import {
  FRESH_COUNT,
  MAX_EXTRA_PER_DAY,
  type DayRecord,
  type PageState,
  type Profile,
  type Rating,
} from './profile';
import { learnedPlanPages, planTask, planUnits, cycleStart, type LearnPlan, type PlanTask } from './learn';
import { meta, suraEndLine, suraPages, suraStartLine } from './quran';

// ---------- Lernpläne (Dars) ----------

export { cycleDay, cycleStart } from './learn';

/** Pläne des Profils; ein alter, eingeschalteter Dars wird als Plan bis zum Ende seiner Sura übernommen. */
export function plansOf(profile: Profile): LearnPlan[] {
  if (profile.plans) return profile.plans;
  if (!profile.dars.enabled) return [];
  const { page, since, weekday: wd, startPage } = profile.dars;
  const ed = profile.edition;
  const sura = meta(ed).pageLast[page - 1][0];
  // beginnt die Sura auf der ersten Dars-Seite, dann ab ihrem Kopf
  const fromLine = suraPages(ed, sura)[0] === startPage ? suraStartLine(ed, sura) : 1;
  return [
    {
      id: 'dars',
      fromPage: startPage,
      fromLine,
      toPage: suraPages(ed, sura)[1],
      toLine: suraEndLine(ed, sura),
      perWeek: 1,
      weekday: wd,
      start: addDays(cycleStart(since, wd), -7 * (page - startPage)),
    },
  ];
}

/** Heute dran: je laufendem Plan eine Aufgabe. */
export function learnTasks(profile: Profile, date: ISODate): PlanTask[] {
  return plansOf(profile)
    .map((pl) => planTask(profile.edition, pl, date))
    .filter((t): t is PlanTask => t !== null);
}

const doneKey = (planId: string) => `${planId}:done`;

/** Aufgabe eines Plans heute erledigt („Portion sitzt“ oder alle Schritte abgehakt). */
export function taskDone(profile: Profile, date: ISODate, planId: string): boolean {
  const d = profile.days[date];
  if (!d) return false;
  return (d.steps ?? []).includes(doneKey(planId)) || (planId === 'dars' && d.darsDone);
}

export function setTaskDone(profile: Profile, date: ISODate, planId: string, done: boolean): Profile {
  return updateDayRecord(profile, date, (d) => {
    const steps = (d.steps ?? []).filter((s) => s !== doneKey(planId));
    return { ...d, steps: done ? [...steps, doneKey(planId)] : steps, darsDone: planId === 'dars' ? done : d.darsDone };
  });
}

/** Seiten, die ein Plan schon gelernt hat (bei weggelegten Plänen alle). */
function planLearned(profile: Profile, pl: LearnPlan, date: ISODate): number[] {
  return pl.archived ? planUnits(profile.edition, pl).map((u) => u.page) : learnedPlanPages(profile.edition, pl, date);
}

/** Alle in Lernplänen gelernten Seiten. */
export function learnedDarsPages(profile: Profile, date: ISODate): number[] {
  return [...new Set(plansOf(profile).flatMap((pl) => planLearned(profile, pl, date)))].sort((a, b) => a - b);
}

/** Die zuletzt gelernten Seiten jedes laufenden Plans: täglich einmal aufsagen. */
export function freshPages(profile: Profile, date: ISODate): number[] {
  const out = plansOf(profile)
    .filter((pl) => !pl.archived)
    .flatMap((pl) => learnedPlanPages(profile.edition, pl, date).slice(-FRESH_COUNT));
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Seiten, die heute in einem Plan gelernt werden (nicht zugleich in der Wiederholung). */
function currentPlanPages(profile: Profile, date: ISODate): number[] {
  return learnTasks(profile, date).flatMap((t) => t.week.map((s) => s.page));
}

/** Bestand einschließlich der in Plänen gelernten Seiten. */
export function effectiveBestand(profile: Profile, date: ISODate): Set<number> {
  const set = new Set(profile.bestand);
  for (const p of learnedDarsPages(profile, date)) set.add(p);
  return set;
}

/** Plan anlegen oder ändern. */
export function upsertPlan(profile: Profile, plan: LearnPlan): Profile {
  const plans = plansOf(profile);
  const exists = plans.some((p) => p.id === plan.id);
  return { ...profile, plans: exists ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan] };
}

/** Fertigen Plan weglegen: seine Seiten kommen fest in den Bestand und laufen in der Wiederholung. */
export function archivePlan(profile: Profile, id: string): Profile {
  const pl = plansOf(profile).find((p) => p.id === id);
  if (!pl) return profile;
  const pages = planUnits(profile.edition, pl).map((u) => u.page);
  const bestand = [...new Set([...profile.bestand, ...pages])].sort((a, b) => a - b);
  return { ...profile, bestand, plans: plansOf(profile).map((p) => (p.id === id ? { ...p, archived: true } : p)) };
}

/** Plan löschen; bis dahin Gelerntes bleibt im Bestand. */
export function removePlan(profile: Profile, id: string, date: ISODate): Profile {
  const pl = plansOf(profile).find((p) => p.id === id);
  if (!pl) return profile;
  const bestand = [...new Set([...profile.bestand, ...planLearned(profile, pl, date)])].sort((a, b) => a - b);
  return { ...profile, bestand, plans: plansOf(profile).filter((p) => p.id !== id) };
}

// ---------- Murājaʿa ----------

/** Seiten, die in der Rotation laufen: Bestand ohne frische Dars-Seiten und ohne aktuelle Dars-Seite. */
export function rotationPool(profile: Profile, date: ISODate): number[] {
  const set = effectiveBestand(profile, date);
  for (const p of freshPages(profile, date)) set.delete(p);
  for (const p of currentPlanPages(profile, date)) set.delete(p);
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

/** Abstände der Nachprüfung, nachdem eine Schwachstelle wieder „sitzt“: nach 3, dann nach 7 Tagen. */
export const FOLLOW_UP_DAYS = [3, 7];

/** Ehemalige Schwachstellen, deren Nachprüfung fällig ist (älteste zuerst). */
export function dueFollowUps(profile: Profile, date: ISODate): number[] {
  const bestand = effectiveBestand(profile, date);
  return Object.entries(profile.pages)
    .map(([p, s]) => ({ page: Number(p), ...s }))
    .filter((s) => s.r === 'sitzt' && s.due && s.due <= date && bestand.has(s.page))
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.page - b.page))
    .map((s) => s.page);
}

function planMuraja(profile: Profile, date: ISODate): { pages: number[]; extra: number[] } {
  const pool = rotationPool(profile, date);
  const pages = murajaBlock(pool, profile.murajaNext, profile.murajaPerDay);
  const excluded = new Set([...pages, ...freshPages(profile, date), ...currentPlanPages(profile, date)]);
  // Zuerst echte Schwachstellen, dann fällige Nachprüfungen – zusammen höchstens 2 pro Tag.
  const extra = [...weakPages(profile, date), ...dueFollowUps(profile, date)]
    .filter((p) => !excluded.has(p) && (profile.pages[p]?.d ?? '') < date)
    .slice(0, MAX_EXTRA_PER_DAY);
  return { pages, extra };
}

/** Wo die Rotation steht und wie lange ein Durchgang durch den ganzen Bestand dauert. */
export function rotationInfo(profile: Profile, date: ISODate): { size: number; position: number; cycleDays: number } {
  const pool = rotationPool(profile, date);
  const start = profile.days[date]?.muraja?.pages[0] ?? murajaBlock(pool, profile.murajaNext, 1)[0];
  const idx = Math.max(0, pool.indexOf(start));
  return {
    size: pool.length,
    position: idx + 1,
    cycleDays: pool.length ? Math.ceil(pool.length / Math.max(1, profile.murajaPerDay)) : 0,
  };
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
  const tasks = learnTasks(profile, date);
  const fresh = freshPages(profile, date);
  const m = day.muraja;
  const mPages = m ? [...m.pages, ...m.extra] : [];
  return {
    dars: tasks.length ? tasks.every((t) => taskDone(profile, date, t.plan.id)) : null,
    fresh: fresh.length ? fresh.every((p) => day.freshDone.includes(p)) : null,
    muraja: mPages.length ? mPages.every((p) => day.ratings[p]) : null,
  };
}

function withStatus(profile: Profile, date: ISODate): Profile {
  const s = cardStatus(profile, date);
  const vals = [s.dars, s.fresh, s.muraja].filter((v) => v !== null);
  const day = profile.days[date];
  const touched =
    day.darsDone ||
    (day.steps?.length ?? 0) > 0 ||
    day.freshDone.length > 0 ||
    Object.keys(day.ratings).length > 0 ||
    day.quiz.some((q) => q.ok !== null) ||
    (day.free?.length ?? 0) > 0;
  return {
    ...profile,
    days: { ...profile.days, [date]: { ...day, complete: vals.length > 0 && vals.every(Boolean), touched } },
  };
}

export function updateDayRecord(profile: Profile, date: ISODate, fn: (d: DayRecord) => DayRecord): Profile {
  const p = ensureDay(profile, date);
  return withStatus({ ...p, days: { ...p.days, [date]: fn(p.days[date]) } }, date);
}


/** Einzelnen Lernschritt abhaken oder wieder öffnen. */
export function toggleStep(profile: Profile, date: ISODate, id: string): Profile {
  return updateDayRecord(profile, date, (d) => {
    const steps = d.steps ?? [];
    return { ...d, steps: steps.includes(id) ? steps.filter((s) => s !== id) : [...steps, id] };
  });
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
/** Neuer Seitenstand nach einer Bewertung; eine zweite Bewertung am selben Tag rechnet mit dem Stand davor. */
function applyRating(profile: Profile, date: ISODate, page: number, r: Rating): Profile {
  const before = profile.pages[page];
  const prev = before?.d === date ? before.prev : before && withoutPrev(before);
  return { ...profile, pages: { ...profile.pages, [page]: { ...nextPageState(prev, r, date), prev } } };
}

export function ratePage(profile: Profile, date: ISODate, page: number, r: Rating): Profile {
  let p = updateDayRecord(profile, date, (d) => ({ ...d, ratings: { ...d.ratings, [page]: r } }));
  p = applyRating(p, date, page, r);
  const block = p.days[date].muraja?.pages ?? [];
  if (block.includes(page)) {
    const open = block.find((x) => !p.days[date].ratings[x]);
    p = { ...p, murajaNext: open ?? block[block.length - 1] + 1 };
  }
  return p;
}

/** Frische Seite bewerten: zählt als aufgesagt und fließt wie eine Murājaʿa-Bewertung in den Seitenstand ein. */
export function rateFresh(profile: Profile, date: ISODate, page: number, r: Rating): Profile {
  const p = updateDayRecord(profile, date, (d) => ({
    ...d,
    freshDone: d.freshDone.includes(page) ? d.freshDone : [...d.freshDone, page],
    ratings: { ...d.ratings, [page]: r },
  }));
  return applyRating(p, date, page, r);
}

function withoutPrev({ prev: _ignored, ...rest }: PageState): PageState {
  return rest;
}

/**
 * Neuer Stand einer Seite nach einer Bewertung. Eine Schwachstelle, die wieder sitzt,
 * wird nach 3 und nach 7 Tagen nachgeprüft (wachsende Abstände festigen am besten).
 */
export function nextPageState(prev: PageState | undefined, r: Rating, date: ISODate): PageState {
  if (r !== 'sitzt') return { r, d: date };
  if (prev && isWeak(prev.r)) return { r, d: date, due: addDays(date, FOLLOW_UP_DAYS[0]), step: 1 };
  if (prev?.due && prev.step && prev.due <= date) {
    const next = FOLLOW_UP_DAYS[prev.step];
    return next ? { r, d: date, due: addDays(date, next), step: prev.step + 1 } : { r, d: date };
  }
  return prev?.due ? { r, d: date, due: prev.due, step: prev.step } : { r, d: date };
}

/**
 * Wiederholung außerhalb des Plans eintragen (eine oder mehrere Seiten mit derselben Bewertung).
 * Sie zählt für Festigung und Schwachstellen wie eine Bewertung im Plan, verschiebt aber die Rotation nicht.
 */
export function logFreeReview(profile: Profile, date: ISODate, pages: number[], r: Rating): Profile {
  let p = updateDayRecord(profile, date, (d) => {
    const others = (d.free ?? []).filter((f) => !pages.includes(f.page));
    return { ...d, free: [...others, ...pages.map((page) => ({ page, r }))] };
  });
  for (const page of pages) p = applyRating(p, date, page, r);
  return p;
}

/** Eintrag wieder entfernen; der Seitenstand von vor dem Eintrag wird wiederhergestellt. */
export function removeFreeReview(profile: Profile, date: ISODate, page: number): Profile {
  let p = updateDayRecord(profile, date, (d) => ({ ...d, free: (d.free ?? []).filter((f) => f.page !== page) }));
  const st = p.pages[page];
  if (st?.d === date && !p.days[date].ratings[page]) {
    const pages = { ...p.pages };
    if (st.prev) pages[page] = st.prev;
    else delete pages[page];
    p = { ...p, pages };
  }
  return p;
}

/** Wiederholte Seiten eines Tages: im Plan bewertet plus selbst eingetragen. */
export function reviewedCount(profile: Profile, date: ISODate): { plan: number; free: number } {
  const d = profile.days[date];
  if (!d) return { plan: 0, free: 0 };
  // Frische Seiten können zugleich abgehakt und bewertet sein: jede Seite nur einmal zählen
  const plan = new Set([...Object.keys(d.ratings).map(Number), ...d.freshDone]).size;
  return { plan, free: d.free?.length ?? 0 };
}

export function setNote(profile: Profile, date: ISODate, note: string): Profile {
  return updateDayRecord(profile, date, (d) => ({ ...d, note }));
}

/** Vorschau: der Block, der nach dem heutigen Stand als Nächstes drankommt. */
export function nextMurajaPreview(profile: Profile, date: ISODate): number[] {
  const tomorrow = addDays(date, 1);
  return murajaBlock(rotationPool(profile, tomorrow), profile.murajaNext, profile.murajaPerDay);
}
