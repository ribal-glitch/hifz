/** Kalendertag im Format JJJJ-MM-TT (lokale Zeit). */
export type ISODate = string;

/** Der Lerntag beginnt um 3 Uhr nachts, damit eine späte Abendeinheit zum Vortag zählt. */
export const DAY_START_HOUR = 3;

export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Mittags, damit Sommer-/Winterzeit keine Tage verschiebt. */
export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function logicalToday(now: Date = new Date()): ISODate {
  return toISO(new Date(now.getTime() - DAY_START_HOUR * 3600_000));
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** 0 = Sonntag … 6 = Samstag */
export function weekday(s: ISODate): number {
  return parseISO(s).getDay();
}

/** „So, 25.10.“ */
export function formatShort(s: ISODate): string {
  const d = parseISO(s);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** „So, 25.10.2026“ */
export function formatMedium(s: ISODate): string {
  return `${formatShort(s)}${parseISO(s).getFullYear()}`;
}

/** „Sonntag, 25. Oktober“ */
export function formatLong(s: ISODate): string {
  const d = parseISO(s);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** „25.10.“ */
export function formatDayMonth(s: ISODate): string {
  const d = parseISO(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}
