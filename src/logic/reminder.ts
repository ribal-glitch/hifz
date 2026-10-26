// Tägliche Abend-Erinnerung als Kalender-Datei (.ics). Der Kalender des Handys meldet sich dann
// jeden Abend zuverlässig, auch wenn die App geschlossen ist – ganz ohne Server.
// Ohne Abhängigkeiten, damit scripts/make-reminders.mjs die Datei direkt mit Node nutzen kann.

export const APP_URL = 'https://ribal-glitch.github.io/hifz/';

/** Uhrzeiten zur Auswahl: 16:00 bis 23:45 im Viertelstunden-Takt. */
export const REMINDER_TIMES: string[] = Array.from({ length: 32 }, (_, i) => {
  const minutes = 16 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export const DEFAULT_REMINDER = '20:30';

/** Dateiname der vorbereiteten Kalender-Datei, z. B. „20-30.ics“. */
export function reminderFile(time: string): string {
  return `${time.replace(':', '-')}.ics`;
}

/** Zeilen nach RFC 5545 auf 75 Bytes falten. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Kalender-Datei mit einem täglichen Termin um `time` (Ortszeit des Handys) und Hinweis zur selben Zeit. */
export function reminderIcs(time: string, url: string = APP_URL): string {
  const [h, m] = time.split(':');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hifz//Abend-Erinnerung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:hifz-erinnerung-${h}${m}@ribal-glitch.github.io`,
    'DTSTAMP:20261026T000000Z',
    // ohne Zeitzone: gilt immer zur Ortszeit des Geräts
    `DTSTART:20260101T${h}${m}00`,
    'DURATION:PT20M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Hifz – deine Einheit',
    `DESCRIPTION:Dars\\, frische Seiten und Murājaʿa. App öffnen: ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Zeit für deine Hifz-Einheit',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
