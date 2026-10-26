// Erzeugt die Kalender-Dateien für die Abend-Erinnerung (public/erinnerung/HH-MM.ics).
// Aufruf: npm run reminders
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REMINDER_TIMES, reminderFile, reminderIcs } from '../src/logic/reminder.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'erinnerung');
mkdirSync(dir, { recursive: true });
for (const t of REMINDER_TIMES) writeFileSync(join(dir, reminderFile(t)), reminderIcs(t));
console.log(`${REMINDER_TIMES.length} Kalender-Dateien in public/erinnerung/`);
