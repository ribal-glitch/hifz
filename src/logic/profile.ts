import type { ISODate } from './dates';
import type { EditionId } from './quran';
import { range } from './quran';

export type Rating = 'sitzt' | 'wackelt' | 'fehler';

export interface PageState {
  /** letzte Bewertung */
  r: Rating;
  /** Tag der letzten Bewertung */
  d: ISODate;
  /** Nachprüfung fällig ab (für ehemalige Schwachstellen) */
  due?: ISODate;
  /** wievielte Nachprüfung als Nächstes kommt (1 = nach 3 Tagen, 2 = nach 7 Tagen) */
  step?: number;
  /** Stand vor der ersten Bewertung des Tages, damit eine Korrektur am selben Tag richtig rechnet */
  prev?: PageState;
}

export type QuizKind = 'start' | 'transition';

export interface QuizItem {
  kind: QuizKind;
  page: number;
  /** Startzeile bei „start“ */
  line?: number;
  /** null = noch nicht bewertet */
  ok: boolean | null;
}

export interface FreeReview {
  page: number;
  r: Rating;
}

export interface DayRecord {
  date: ISODate;
  darsDone: boolean;
  freshDone: number[];
  /** Am ersten Öffnen des Tages festgelegt */
  muraja: { pages: number[]; extra: number[] } | null;
  ratings: Record<number, Rating>;
  note: string;
  quiz: QuizItem[];
  /** Selbst eingetragene Wiederholungen außerhalb des Plans */
  free?: FreeReview[];
  /** Alle Karten des Tages erledigt */
  complete: boolean;
  /** Mindestens etwas erledigt */
  touched: boolean;
}

export interface DarsSettings {
  enabled: boolean;
  /** Vortragstag, 0 = Sonntag … 6 = Samstag */
  weekday: number;
  /** Dars-Seite in der Woche, die `since` enthält */
  page: number;
  since: ISODate;
  /** Erste im Dars gelernte Seite */
  startPage: number;
}

export interface Profile {
  version: 1;
  id: string;
  name: string;
  color: string;
  createdAt: ISODate;
  edition: EditionId;
  /** Auswendig gelernte Seiten (ohne die automatisch hinzukommenden Dars-Seiten) */
  bestand: number[];
  dars: DarsSettings;
  murajaPerDay: number;
  /** Nächste Murājaʿa beginnt bei dieser Seite (oder der nächsten im Bestand) */
  murajaNext: number;
  pages: Record<number, PageState>;
  days: Record<ISODate, DayRecord>;
  milestonesSeen: number[];
  /** EveryAyah-Ordner des gewählten Rezitators */
  reciter?: string;
  /** Wiederholungen pro Ajah beim Anhören */
  repeatEach?: number;
  /** Nachsprech-Pause nach jeder Ajah */
  echoPause?: boolean;
  /** Tempo für den Ziel-Rechner: neue Seiten pro Woche */
  goalPace?: number;
  /** Zeitpunkt der letzten Änderung, zum Abgleich zwischen Geräten */
  updatedAt?: string;
}

export const MURAJA_OPTIONS = [3, 4, 5, 6, 8, 10, 20];
export const MAX_EXTRA_PER_DAY = 2;
export const FRESH_COUNT = 4;

export const AVATAR_COLORS = ['#1F5A44', '#8A5A2B', '#6B4E8C', '#9C3D54', '#2F5E8A', '#5E6B2F', '#8C3A2E', '#2E6E73'];

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function initials(name: string): string {
  const t = name.trim();
  return t ? t[0].toLocaleUpperCase('de') : '?';
}

export function createProfile(opts: {
  name: string;
  color?: string;
  today: ISODate;
  bestand?: number[];
  edition?: EditionId;
  dars?: { enabled: boolean; weekday?: number; page?: number };
  murajaPerDay?: number;
}): Profile {
  const bestand = [...new Set(opts.bestand ?? [])].sort((a, b) => a - b);
  const darsPage = opts.dars?.page ?? 1;
  return {
    version: 1,
    id: newId(),
    name: opts.name.trim(),
    color: opts.color ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    createdAt: opts.today,
    edition: opts.edition ?? '1405',
    bestand,
    dars: {
      enabled: opts.dars?.enabled ?? false,
      weekday: opts.dars?.weekday ?? 4,
      page: darsPage,
      since: opts.today,
      startPage: darsPage,
    },
    murajaPerDay: opts.murajaPerDay ?? 5,
    murajaNext: bestand[0] ?? 1,
    pages: {},
    days: {},
    milestonesSeen: [],
  };
}

/**
 * Ribals Stand: Seite 293–396 und 482–604 auswendig, Dars al-ʿAnkabūt,
 * diese Woche (ab 25.10.2026) Seite 397, Vortrag donnerstags.
 */
export function ribalPreset(today: ISODate): Profile {
  const p = createProfile({
    name: 'Ribal',
    color: AVATAR_COLORS[0],
    today,
    bestand: [...range(293, 396), ...range(482, 604)],
    edition: '1405',
    dars: { enabled: true, weekday: 4, page: 397 },
    murajaPerDay: 5,
  });
  p.dars.since = '2026-10-25';
  p.dars.startPage = 396;
  return p;
}
