import { useState } from 'react';
import { RECITERS, REPEAT_OPTIONS, reciterById } from '../audio';
import { IS_ARTIFACT } from '../platform';
import { DEFAULT_REMINDER, REMINDER_TIMES, reminderFile, reminderIcs } from '../logic/reminder';
import { ACCOUNTS_ENABLED } from '../account';
import { replanIfUntouched, rotationInfo } from '../logic/plan';
import { AVATAR_COLORS, MURAJA_OPTIONS } from '../logic/profile';
import { EDITIONS } from '../logic/quran';
import { saveFile, useStore, type Theme } from '../store';
import { Avatar, Confirm, Seg, Stepper } from '../ui';

export function Settings() {
  const { profile, today, update, theme, setTheme, deleteProfile, toast, account, logout } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reminder, setReminderState] = useState(() => {
    try {
      return localStorage.getItem('hifz:reminder') || DEFAULT_REMINDER;
    } catch {
      return DEFAULT_REMINDER;
    }
  });
  const setReminder = (t: string) => {
    setReminderState(t);
    try {
      localStorage.setItem('hifz:reminder', t);
    } catch {
      /* egal */
    }
  };
  if (!profile) return null;

  const rot = rotationInfo(profile, today);
  // Änderungen an der Murājaʿa wirken sofort, solange heute noch nichts bewertet ist.
  const updatePlan = (fn: Parameters<typeof update>[0]) => update((p) => replanIfUntouched(fn(p), today));

  return (
    <div>
      <div className="section-title">Profil</div>
      <section className="card stack">
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={profile.name} color={profile.color} size={52} />
          <input
            className="field"
            aria-label="Name"
            value={profile.name}
            maxLength={30}
            onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
            onBlur={() => update((p) => ({ ...p, name: p.name.trim() || 'Ohne Namen' }))}
          />
        </div>
        <div className="chips-row" role="group" aria-label="Farbe des Avatars">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Farbe ${c}`}
              aria-pressed={profile.color === c}
              onClick={() => update((p) => ({ ...p, color: c }))}
              style={{ background: c, borderColor: profile.color === c ? 'var(--text)' : c, minWidth: 48, borderWidth: 3 }}
            />
          ))}
        </div>
        <div>
          <label className="lbl">Mushaf-Ausgabe</label>
          <Seg
            label="Mushaf-Ausgabe"
            value={profile.edition}
            onChange={(v) => update((p) => ({ ...p, edition: v }))}
            options={EDITIONS.map((e) => ({ value: e.id, label: e.id === '1405' ? 'Klassisch 1405 H' : 'Neu 1441 H' }))}
          />
        </div>
      </section>

      <div className="section-title">Murājaʿa</div>
      <section className="card stack">
        <div>
          <label className="lbl">Seiten pro Tag</label>
          <div className="chips-row">
            {MURAJA_OPTIONS.map((n) => (
              <button key={n} type="button" aria-pressed={profile.murajaPerDay === n} onClick={() => updatePlan((p) => ({ ...p, murajaPerDay: n }))}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="lbl">Nächster Block beginnt bei Seite</label>
          <Stepper
            value={profile.murajaNext}
            min={1}
            max={604}
            label="Nächste Murājaʿa-Seite"
            onChange={(v) => updatePlan((p) => ({ ...p, murajaNext: v }))}
          />
        </div>
        <p className="small" style={{ margin: 0 }}>
          Ein Durchgang dauert {rot.cycleDays} Tage.
        </p>
      </section>

      <div className="section-title">Anhören</div>
      {IS_ARTIFACT ? (
        <section className="card">
          <p style={{ margin: 0 }}>Hier läuft die Rezitation auf quran.com; den Rezitator wählst du dort.</p>
        </section>
      ) : (
      <section className="card stack">
        <div>
          <label className="lbl" htmlFor="set-reciter">
            Rezitator
          </label>
          <select
            id="set-reciter"
            className="field"
            value={reciterById(profile.reciter).id}
            onChange={(e) => update((p) => ({ ...p, reciter: e.target.value }))}
          >
            {RECITERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.style !== 'Murattal' ? ` – ${r.style}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">Jede Ayah wiederholen</label>
          <div className="chips-row">
            {REPEAT_OPTIONS.map((n) => (
              <button key={n} type="button" aria-pressed={(profile.repeatEach ?? 3) === n} onClick={() => update((p) => ({ ...p, repeatEach: n }))}>
                {n}×
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="lbl">Nachsprech-Pause nach jeder Ayah</label>
          <Seg<string>
            label="Nachsprech-Pause"
            value={profile.echoPause ? 'an' : 'aus'}
            onChange={(v) => update((p) => ({ ...p, echoPause: v === 'an' }))}
            options={[
              { value: 'aus', label: 'Aus' },
              { value: 'an', label: 'An' },
            ]}
          />
        </div>
      </section>
      )}

      <div className="section-title">Abend-Erinnerung</div>
      <section className="card stack">
        <div>
          <label className="lbl" htmlFor="reminder-time">
            Uhrzeit
          </label>
          <select id="reminder-time" className="field" value={reminder} onChange={(e) => setReminder(e.target.value)}>
            {REMINDER_TIMES.map((t) => (
              <option key={t} value={t}>
                {t} Uhr
              </option>
            ))}
          </select>
        </div>
        {IS_ARTIFACT ? (
          <button
            type="button"
            className="btn primary block"
            onClick={async () => {
              const r = await saveFile(`hifz-erinnerung-${reminderFile(reminder)}`, reminderIcs(reminder));
              if (r === 'unavailable') toast('Speichern als Datei ist hier nicht möglich.');
            }}
          >
            In den Kalender eintragen
          </button>
        ) : (
          <a className="btn primary block" href={`./erinnerung/${reminderFile(reminder)}`} target="_blank" rel="noopener noreferrer">
            In den Kalender eintragen
          </a>
        )}
      </section>

      <div className="section-title">Darstellung</div>
      <section className="card">
        <Seg<Theme>
          label="Hell oder Dunkel"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Automatisch' },
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
          ]}
        />
      </section>

      {ACCOUNTS_ENABLED && (
        <>
          <div className="section-title">Konto</div>
          <section className="card stack">
            {account ? (
              <>
                <p style={{ margin: 0 }}>
                  Angemeldet als <b>{account.email}</b>. Dein Stand liegt im Konto und ist auf jedem Gerät gleich, auf dem du dich anmeldest.
                </p>
                <button type="button" className="btn block" onClick={() => void logout()}>
                  Abmelden
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: 0 }}>Ohne Konto liegen deine Daten nur auf diesem Gerät.</p>
                <button type="button" className="btn primary block" onClick={() => void logout()}>
                  Anmelden oder Konto erstellen
                </button>
              </>
            )}
          </section>
        </>
      )}

      <section className="card stack" style={{ marginTop: 26 }}>
        <button type="button" className="btn block danger" onClick={() => setConfirmDelete(true)}>
          Profil „{profile.name}“ löschen
        </button>
      </section>

      <div className="section-title">Quellen</div>
      <section className="card small">
        <p style={{ marginTop: 0 }}>
          Quran-Text und Schrift: King Fahd Glorious Quran Printing Complex (KFGQPC), Uthmani Hafs ʿan ʿĀṣim, Version 18 – unverändert.
        </p>
        <p>Zeilenumbrüche des Madina-Mushaf: quran-madina-html von Tarek Eldeeb (Waqf General Public License 2.0).</p>
        <p>Rezitationen: über EveryAyah.com (nur online).</p>
        <p>
          Übersetzungen (Bedeutungen, nicht der Quran selbst): Frank Bubenheim &amp; Nadeem Elyas (über QuranEnc.com) und
          Muhammad Abu Rida (über Tanzil.net), unverändert, nur zum persönlichen Gebrauch.
        </p>
        <p style={{ marginBottom: 0 }}>Schrift der Oberfläche: Plus Jakarta Sans (SIL Open Font License).</p>
      </section>

      {confirmDelete && (
        <Confirm
          title="Profil löschen?"
          text={`Alle Daten von „${profile.name}“ werden gelöscht. Das lässt sich nicht rückgängig machen.`}
          confirmLabel="Endgültig löschen"
          danger
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteProfile(profile.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

    </div>
  );
}
