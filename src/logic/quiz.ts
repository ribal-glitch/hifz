import { addDays, type ISODate } from './dates';
import { effectiveBestand, isWeak, updateDayRecord } from './plan';
import type { Profile, QuizItem } from './profile';
import { textLines } from './quran';

/** Kleine Zufallsfunktion, in Tests ersetzbar. */
export type Rng = () => number;

function pickWeighted<T>(items: { item: T; w: number }[], rng: Rng): T | null {
  const total = items.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const x of items) {
    r -= x.w;
    if (r < 0) return x.item;
  }
  return items[items.length - 1].item;
}

/** Fehler in der Mini-Prüfung der letzten 14 Tage, je Seite. */
function recentQuizStats(profile: Profile, date: ISODate) {
  const errors = new Map<number, number>();
  const recent = new Set<string>();
  for (let i = 0; i < 14; i++) {
    const d = profile.days[addDays(date, -i)];
    if (!d) continue;
    for (const q of d.quiz) {
      if (q.ok === false) errors.set(q.page, (errors.get(q.page) ?? 0) + 1);
      if (i < 3) recent.add(`${q.kind}:${q.page}`);
    }
  }
  return { errors, recent };
}

/**
 * Wählt eine Prüfungsfrage aus dem Bestand. Übergänge zwischen zwei Seiten und
 * Schwachstellen (Bewertung „wackelt“/„Fehler“ oder Prüfungsfehler) kommen öfter dran,
 * kürzlich gefragte Stellen seltener.
 */
export function newQuestion(profile: Profile, date: ISODate, rng: Rng = Math.random): QuizItem | null {
  const bestand = effectiveBestand(profile, date);
  if (!bestand.size) return null;
  const { errors, recent } = recentQuizStats(profile, date);
  const weight = (page: number, kind: string) => {
    let w = 1;
    if (isWeak(profile.pages[page]?.r)) w *= 4;
    if (errors.has(page)) w *= 3;
    if (recent.has(`${kind}:${page}`)) w *= 0.25;
    return w;
  };
  const pages = [...bestand].sort((a, b) => a - b);
  const transitions = pages.filter((p) => bestand.has(p + 1));
  const useTransition = transitions.length > 0 && rng() < 0.45;
  if (useTransition) {
    const page = pickWeighted(
      transitions.map((p) => ({ item: p, w: Math.max(weight(p, 'transition'), weight(p + 1, 'transition')) })),
      rng,
    );
    if (page !== null) return { kind: 'transition', page, ok: null };
  }
  const page = pickWeighted(
    pages.map((p) => ({ item: p, w: weight(p, 'start') })),
    rng,
  );
  if (page === null) return null;
  const lines = textLines(profile.edition, page);
  const line = lines[Math.floor(rng() * lines.length)];
  return { kind: 'start', page, line, ok: null };
}

/** Seite, die bei einem Prüfungsfehler als Schwachstelle markiert wird. */
export function quizWeakPage(q: QuizItem): number {
  return q.kind === 'transition' ? q.page + 1 : q.page;
}

export function quizText(q: QuizItem): string {
  if (q.kind === 'transition') return `Letzte 2 Zeilen von S. ${q.page}, dann nahtlos weiter auf S. ${q.page + 1}`;
  return q.line === 1 ? `Beginne S. ${q.page} am Seitenanfang` : `Beginne S. ${q.page} ab Zeile ${q.line}`;
}

export function addQuestion(profile: Profile, date: ISODate, q: QuizItem): Profile {
  return updateDayRecord(profile, date, (d) => ({ ...d, quiz: [...d.quiz, q] }));
}

/**
 * Bewertet eine Prüfungsfrage. „Mit Fehlern“ markiert die Stelle als „wackelt“,
 * damit sie in der Murājaʿa zusätzlich drankommt, bis sie wieder sitzt.
 */
export function rateQuestion(profile: Profile, date: ISODate, index: number, ok: boolean): Profile {
  let p = updateDayRecord(profile, date, (d) => ({
    ...d,
    quiz: d.quiz.map((q, i) => (i === index ? { ...q, ok } : q)),
  }));
  const q = p.days[date].quiz[index];
  if (!ok && q) {
    const page = quizWeakPage(q);
    if (p.pages[page]?.r !== 'fehler') p = { ...p, pages: { ...p.pages, [page]: { r: 'wackelt', d: date } } };
  }
  return p;
}
