import { addDays, daysBetween, weekday, type ISODate } from './dates';
import type { EditionId } from './quran';
import { SURAS, meta, pageLineCount, suraEndLine, suraName, suraPages, suraStartLine, textLines } from './quran';

/**
 * Ein Lernplan (Dars): ein Bereich des Qurans, der Woche für Woche gelernt wird.
 * Jede Woche hat fünf Lerntage mit je einer Portion, einen Tag für den Probevortrag
 * und den Vortragstag. Es können mehrere Pläne gleichzeitig laufen.
 */
export interface LearnPlan {
  id: string;
  /** Anfang: Seite und Zeile (bei einer Sura ihr Kopf, nicht der Seitenanfang) */
  fromPage: number;
  fromLine: number;
  /** Ende: Seite und letzte Zeile */
  toPage: number;
  toLine: number;
  /** neue Seiten pro Woche: ½, 1, 2, 3 … */
  perWeek: number;
  /** Vortragstag, 0 = Sonntag … 6 = Samstag; die Woche beginnt am Tag danach */
  weekday: number;
  /** erster Tag der ersten Woche */
  start: ISODate;
  /** mitten in der Woche angelegt: ab diesem Tag verteilen sich die Portionen der ersten Woche */
  firstDay?: ISODate;
  /** fertig gelernt und weggelegt (die Seiten bleiben in der Wiederholung) */
  archived?: boolean;
}

export const PER_WEEK_OPTIONS = [0.5, 1, 2, 3, 5];

/** Ein Stück Text auf einer Seite: Zeilen from–to. */
export interface Segment {
  page: number;
  from: number;
  to: number;
}

export type PlanTask = {
  plan: LearnPlan;
  /** Tag der Woche: 0–4 Portionen, 5 Probevortrag, 6 Vortrag */
  day: number;
  kind: 'portion' | 'rehearsal' | 'lecture';
  /** was heute dran ist (Portion) bzw. der Stoff der ganzen Woche */
  segs: Segment[];
  /** der Stoff der ganzen Woche */
  week: Segment[];
};

/** Erster Tag der Woche (der Tag nach dem Vortrag), in der `date` liegt. */
export function cycleStart(date: ISODate, lectureWeekday: number): ISODate {
  const startDow = (lectureWeekday + 1) % 7;
  const back = (weekday(date) - startDow + 7) % 7;
  return addDays(date, -back);
}

/** 0 = erster Tag nach dem Vortrag … 6 = Vortragstag */
export function cycleDay(date: ISODate, lectureWeekday: number): number {
  return daysBetween(cycleStart(date, lectureWeekday), date);
}

/** Zeilen mit Quran-Text, die zum Plan gehören, Seite für Seite. */
export function planUnits(ed: EditionId, plan: LearnPlan): { page: number; lines: number[] }[] {
  const out: { page: number; lines: number[] }[] = [];
  for (let page = plan.fromPage; page <= plan.toPage; page++) {
    const lines = textLines(ed, page).filter((l) => (page > plan.fromPage || l >= plan.fromLine) && (page < plan.toPage || l <= plan.toLine));
    if (lines.length) out.push({ page, lines });
  }
  return out;
}

/** Fasst Zeilen (Seite, Zeile) zu Stücken je Seite zusammen. */
function toSegments(lines: { page: number; line: number }[]): Segment[] {
  const out: Segment[] = [];
  for (const { page, line } of lines) {
    const last = out[out.length - 1];
    if (last && last.page === page) last.to = line;
    else out.push({ page, from: line, to: line });
  }
  return out;
}

export function weekIndex(plan: LearnPlan, date: ISODate): number {
  return Math.round(daysBetween(plan.start, cycleStart(date, plan.weekday)) / 7);
}

/** Der Stoff der Woche w (leer, wenn der Plan durch ist). */
export function weekLines(ed: EditionId, plan: LearnPlan, w: number): { page: number; line: number }[] {
  if (w < 0) return [];
  const units = planUnits(ed, plan);
  const flat = (us: typeof units) => us.flatMap((u) => u.lines.map((line) => ({ page: u.page, line })));
  if (plan.perWeek >= 1) return flat(units.slice(w * plan.perWeek, (w + 1) * plan.perWeek));
  // halbe Seite pro Woche: erste bzw. zweite Hälfte der Seite
  const u = units[Math.floor(w / 2)];
  if (!u) return [];
  const half = Math.ceil(u.lines.length / 2);
  const lines = w % 2 === 0 ? u.lines.slice(0, half) : u.lines.slice(half);
  return lines.map((line) => ({ page: u.page, line }));
}

/** Was heute in diesem Plan dran ist; null, wenn der Plan noch nicht begonnen hat oder durch ist. */
export function planTask(ed: EditionId, plan: LearnPlan, date: ISODate): PlanTask | null {
  if (plan.archived) return null;
  const lines = weekLines(ed, plan, weekIndex(plan, date));
  if (!lines.length) return null;
  const day = cycleDay(date, plan.weekday);
  const week = toSegments(lines);
  // erste Woche, mitten in der Woche begonnen: die Portionen auf die restlichen Lerntage verteilen
  const d0 = plan.firstDay && weekIndex(plan, date) === 0 ? Math.min(4, cycleDay(plan.firstDay, plan.weekday)) : 0;
  if (day < d0) return null;
  if (day <= 4) {
    const k = day - d0;
    const n = 5 - d0;
    const a = Math.floor((k * lines.length) / n);
    const b = Math.floor(((k + 1) * lines.length) / n);
    // sehr kleine Wochen (z. B. eine halbe Seite): mindestens eine Zeile pro Tag, solange es reicht
    const part = lines.slice(a, Math.max(b, Math.min(lines.length, a + 1)));
    return { plan, day, kind: 'portion', segs: toSegments(part.length ? part : lines.slice(-1)), week };
  }
  return { plan, day, kind: day === 5 ? 'rehearsal' : 'lecture', segs: week, week };
}

/** Seiten, die in diesem Plan schon ganz gelernt sind (vor der aktuellen Woche). */
export function learnedPlanPages(ed: EditionId, plan: LearnPlan, date: ISODate): number[] {
  const units = planUnits(ed, plan);
  const w = weekIndex(plan, date);
  if (w <= 0) return [];
  const n = plan.perWeek >= 1 ? w * plan.perWeek : Math.floor(w / 2);
  return units.slice(0, n).map((u) => u.page);
}

/** Plan ist durch: alle Seiten gelernt. */
export function planFinished(ed: EditionId, plan: LearnPlan, date: ISODate): boolean {
  return weekIndex(plan, date) >= 0 && weekLines(ed, plan, weekIndex(plan, date)).length === 0;
}

/** Fortschritt in Seiten: gelernt / gesamt */
export function planProgress(ed: EditionId, plan: LearnPlan, date: ISODate): { done: number; total: number } {
  const total = planUnits(ed, plan).length;
  return { done: Math.min(total, learnedPlanPages(ed, plan, date).length), total };
}

/** „Al-ʿAnkabūt“, „Al-ʿAnkabūt 45 – Luqmān 11“ … */
export function planTitle(ed: EditionId, plan: LearnPlan): string {
  const [s1, a1] = ayahAt(ed, plan.fromPage, plan.fromLine, 'first');
  const [s2, a2] = ayahAt(ed, plan.toPage, plan.toLine, 'last');
  const whole1 = a1 === 1;
  const whole2 = a2 === SURAS[s2 - 1].ayahs;
  if (s1 === s2) return whole1 && whole2 ? suraName(s1) : `${suraName(s1)} ${a1}–${a2}`;
  return `${suraName(s1)}${whole1 ? '' : ` ${a1}`} – ${suraName(s2)}${whole2 ? '' : ` ${a2}`}`;
}

/** Ungefähre Ayah am Anfang bzw. Ende eines Bereichs (aus den Seitengrenzen). */
function ayahAt(ed: EditionId, page: number, line: number, which: 'first' | 'last'): [number, number] {
  if (which === 'first') {
    // beginnt der Bereich an einem Sura-Kopf, ist es Ayah 1 dieser Sura
    const sura = SURAS.find((s) => suraPages(ed, s.n)[0] === page && suraStartLine(ed, s.n) === line);
    return sura ? [sura.n, 1] : meta(ed).pageFirst[page - 1];
  }
  const sura = SURAS.find((s) => suraPages(ed, s.n)[1] === page && suraEndLine(ed, s.n) === line);
  return sura ? [sura.n, sura.ayahs] : meta(ed).pageLast[page - 1];
}

/** Bereich von Sura a bis Sura b (je vollständig). */
export function suraRange(ed: EditionId, a: number, b: number): Pick<LearnPlan, 'fromPage' | 'fromLine' | 'toPage' | 'toLine'> {
  const [s1, s2] = a <= b ? [a, b] : [b, a];
  return { fromPage: suraPages(ed, s1)[0], fromLine: suraStartLine(ed, s1), toPage: suraPages(ed, s2)[1], toLine: suraEndLine(ed, s2) };
}

/** Bereich von Seite a bis Seite b (ganze Seiten). */
export function pageRange(ed: EditionId, a: number, b: number): Pick<LearnPlan, 'fromPage' | 'fromLine' | 'toPage' | 'toLine'> {
  const [p1, p2] = a <= b ? [a, b] : [b, a];
  return { fromPage: p1, fromLine: 1, toPage: p2, toLine: pageLineCount(ed, p2) };
}

/** Neuer Plan, der in der Woche von `date` beginnt. */
export function newPlan(
  range: Pick<LearnPlan, 'fromPage' | 'fromLine' | 'toPage' | 'toLine'>,
  perWeek: number,
  lectureWeekday: number,
  date: ISODate,
): LearnPlan {
  const id = Math.random().toString(36).slice(2, 9);
  const day = cycleDay(date, lectureWeekday);
  // am Probe- oder Vortragstag angelegt: es geht nächste Woche los
  if (day >= 5) return { id, ...range, perWeek, weekday: lectureWeekday, start: addDays(cycleStart(date, lectureWeekday), 7) };
  return { id, ...range, perWeek, weekday: lectureWeekday, start: cycleStart(date, lectureWeekday), firstDay: day > 0 ? date : undefined };
}

/** Den Plan so verschieben, dass diese Woche die Seite `page` dran ist. */
export function setPlanPage(ed: EditionId, plan: LearnPlan, date: ISODate, page: number): LearnPlan {
  const units = planUnits(ed, plan);
  let i = units.findIndex((u) => u.page >= page);
  if (i < 0) i = units.length;
  const w = plan.perWeek >= 1 ? Math.floor(i / plan.perWeek) : i * 2;
  return { ...plan, start: addDays(cycleStart(date, plan.weekday), -7 * w), firstDay: undefined };
}

/** Vortragstag ändern, ohne dass sich der Stoff dieser Woche verschiebt. */
export function setPlanWeekday(plan: LearnPlan, date: ISODate, wd: number): LearnPlan {
  const w = weekIndex(plan, date);
  return { ...plan, weekday: wd, start: addDays(cycleStart(date, wd), -7 * w), firstDay: undefined };
}

/** Tempo ändern, ohne dass sich der aktuelle Stand verschiebt. */
export function setPlanPace(ed: EditionId, plan: LearnPlan, date: ISODate, perWeek: number): LearnPlan {
  const lines = weekLines(ed, plan, weekIndex(plan, date));
  const page = lines[0]?.page ?? plan.toPage + 1;
  return setPlanPage(ed, { ...plan, perWeek }, date, page);
}
