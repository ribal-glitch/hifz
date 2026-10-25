import { addDays, formatDayMonth, formatMedium, formatShort, WEEKDAYS_SHORT, type ISODate } from './dates';
import { cardStatus, darsTask, effectiveBestand, freshPages, nextMurajaPreview, weakPages } from './plan';
import type { Profile } from './profile';
import { formatDecimal, formatRanges, pageRangeLabel } from './quran';
import { progress, streak } from './stats';
import { quizText } from './quiz';

const RATING_LABEL = { sitzt: 'sitzt', wackelt: 'wackelt', fehler: 'Fehler' } as const;

function darsLine(profile: Profile, date: ISODate): string {
  const t = darsTask(profile, date);
  if (!t) return 'Dars: keiner';
  const where = `S. ${t.page} (${pageRangeLabel(profile.edition, t.page)})`;
  const today =
    t.kind === 'portion' ? `heute Zeilen ${t.from}–${t.to}` : t.kind === 'rehearsal' ? 'heute Probevortrag der ganzen Seite' : 'heute Vortrag beim Sheikh';
  return `Dars: ${where} · ${today} · Vortrag ${WEEKDAYS_SHORT[profile.dars.weekday]}`;
}

function dayLine(profile: Profile, date: ISODate): string {
  const day = profile.days[date];
  if (!day || (!day.touched && !day.note)) return `${formatShort(date)}: nichts eingetragen`;
  const s = cardStatus(profile, date);
  const parts: string[] = [];
  if (s.dars !== null) parts.push(`Dars ${day.darsDone ? '✓' : '✗'}`);
  const fresh = freshPages(profile, date);
  if (fresh.length) parts.push(`Frische Seiten ${fresh.filter((p) => day.freshDone.includes(p)).length}/${fresh.length}`);
  if (day.muraja) {
    const all = [...day.muraja.pages, ...day.muraja.extra];
    const rated = all.filter((p) => day.ratings[p]);
    const counts = (['sitzt', 'wackelt', 'fehler'] as const)
      .map((r) => [r, rated.filter((p) => day.ratings[p] === r).length] as const)
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${n}× ${RATING_LABEL[r]}`);
    parts.push(`Murājaʿa ${rated.length}/${all.length}${counts.length ? ` (${counts.join(', ')})` : ''}`);
  }
  const quiz = day.quiz.filter((q) => q.ok !== null);
  if (quiz.length) parts.push(`Prüfung ${quiz.filter((q) => q.ok).length}/${quiz.length} fehlerfrei`);
  return `${formatShort(date)}: ${parts.join(' · ')}${day.complete ? ' – alles erledigt' : ''}`;
}

/** Kurzer Text mit dem aktuellen Stand, zum Einfügen in ein Gespräch mit Claude. */
export function claudeSummary(profile: Profile, date: ISODate): string {
  const prog = progress(profile, date);
  const yesterday = addDays(date, -1);
  const weak = weakPages(profile, date).slice(0, 8);
  const lines: string[] = [];
  lines.push(`Hifz-Stand von ${profile.name} · ${formatMedium(date)}`);
  lines.push(
    `Bestand: ${prog.pages} von 604 Seiten (${formatDecimal(prog.percent)} %, ca. ${formatDecimal(prog.juz)} Juz) · S. ${formatRanges(
      effectiveBestand(profile, date),
    )}`,
  );
  lines.push(darsLine(profile, date));
  lines.push(`Gestern – ${dayLine(profile, yesterday)}`);
  if (profile.days[date]?.touched) lines.push(`Heute – ${dayLine(profile, date)}`);
  const n = streak(profile, date);
  lines.push(`Serie: ${n} ${n === 1 ? 'Tag' : 'Tage'} am Stück`);
  lines.push(
    weak.length
      ? `Schwachstellen: ${weak.map((p) => `S. ${p} (${RATING_LABEL[profile.pages[p].r]}, ${formatDayMonth(profile.pages[p].d)})`).join(', ')}`
      : 'Schwachstellen: keine',
  );
  const today = profile.days[date]?.muraja;
  if (today?.pages.length) lines.push(`Murājaʿa heute: S. ${formatRanges(today.pages)}`);
  const next = nextMurajaPreview(profile, date);
  if (next.length) lines.push(`Nächste Murājaʿa: S. ${formatRanges(next)}`);
  const errors = [yesterday, date].flatMap((d) => (profile.days[d]?.quiz ?? []).filter((q) => q.ok === false));
  if (errors.length) lines.push(`Prüfungsfehler: ${errors.map(quizText).join('; ')}`);
  const noteDay = [date, yesterday].find((d) => profile.days[d]?.note.trim());
  if (noteDay) lines.push(`Notiz (${formatDayMonth(noteDay)}): ${profile.days[noteDay].note.trim()}`);
  return lines.join('\n');
}
