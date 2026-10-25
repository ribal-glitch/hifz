import { useRef, useState } from 'react';
import { BestandEditor } from '../components/BestandEditor';
import { WEEKDAYS, WEEKDAYS_SHORT } from '../logic/dates';
import { darsPage, effectiveBestand, replanIfUntouched, setDarsEnabled, setDarsPage, setDarsWeekday } from '../logic/plan';
import { AVATAR_COLORS, MURAJA_OPTIONS } from '../logic/profile';
import { EDITIONS, formatRanges, pageRangeLabel, range } from '../logic/quran';
import { claudeSummary } from '../logic/summary';
import { parseProfileFile, profileFile, saveFile, useStore, type Theme } from '../store';
import { Avatar, Confirm, Icon, Seg, Sheet, Stepper } from '../ui';
import { WEEK_ORDER } from './Onboarding';

export function Settings() {
  const { profile, today, update, theme, setTheme, deleteProfile, importProfile, toast, closeProfile } = useStore();
  const [editBestand, setEditBestand] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseProfileFile>>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!profile) return null;

  const bestand = [...effectiveBestand(profile, today)].sort((a, b) => a - b);
  const dp = darsPage(profile, today);
  // Änderungen an der Murājaʿa wirken sofort, solange heute noch nichts bewertet ist.
  const updatePlan = (fn: Parameters<typeof update>[0]) => update((p) => replanIfUntouched(fn(p), today));

  const copySummary = async () => {
    const text = claudeSummary(profile, today);
    try {
      await navigator.clipboard.writeText(text);
      toast('Stand kopiert – jetzt bei Claude einfügen.');
    } catch {
      setSummary(text);
    }
  };

  const exportProfile = async () => {
    const { name, text } = profileFile(profile);
    const r = await saveFile(name, text);
    if (r !== 'cancelled') toast('Backup erstellt.');
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    const p = parseProfileFile(await f.text());
    if (!p) toast('Diese Datei ist kein Hifz-Profil.');
    else setPendingImport(p);
  };

  return (
    <div>
      <div className="section-title">Stand teilen</div>
      <section className="card">
        <p style={{ marginTop: 0 }}>Ein kurzer Text mit deinem Stand – zum Einfügen in ein Gespräch mit Claude.</p>
        <button type="button" className="btn primary block" onClick={copySummary}>
          <Icon name="copy" /> Stand für Claude kopieren
        </button>
      </section>

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
          <label className="lbl">Mushaf-Ausgabe (bestimmt die Zeilennummern)</label>
          <Seg
            label="Mushaf-Ausgabe"
            value={profile.edition}
            onChange={(v) => update((p) => ({ ...p, edition: v }))}
            options={EDITIONS.map((e) => ({ value: e.id, label: e.id === '1405' ? 'Klassisch 1405 H' : 'Neu 1441 H' }))}
          />
          <p className="small" style={{ marginBottom: 0 }}>
            Prüfen: Auf S. 6 endet Ajah 30 (al-Baqara) in der klassischen Ausgabe in Zeile 4, in der neuen in Zeile 3.
          </p>
        </div>
      </section>

      <div className="section-title">Bestand</div>
      <section className="card">
        <div className="big" style={{ fontSize: 24 }}>
          {bestand.length} Seiten
        </div>
        <div className="sub">{bestand.length ? `S. ${formatRanges(bestand)}` : 'Noch nichts eingetragen'}</div>
        {profile.dars.enabled && dp > profile.dars.startPage && (
          <div className="small" style={{ marginTop: 6 }}>
            Inklusive der im Dars gelernten Seiten {formatRanges(range(profile.dars.startPage, dp - 1))}.
          </div>
        )}
        <button type="button" className="btn block" style={{ marginTop: 12 }} onClick={() => setEditBestand(true)}>
          Bestand bearbeiten
        </button>
      </section>

      <div className="section-title">Dars</div>
      <section className="card stack">
        <Seg
          label="Dars"
          value={profile.dars.enabled ? 'ja' : 'nein'}
          onChange={(v) => updatePlan((p) => setDarsEnabled(p, today, v === 'ja', v === 'ja' ? p.dars.page : undefined))}
          options={[
            { value: 'ja', label: 'Dars an' },
            { value: 'nein', label: 'Kein Dars' },
          ]}
        />
        {profile.dars.enabled && (
          <>
            <div>
              <label className="lbl">Vortrag am</label>
              <div className="chips-row">
                {WEEK_ORDER.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={WEEKDAYS[d]}
                    aria-pressed={profile.dars.weekday === d}
                    onClick={() => update((p) => setDarsWeekday(p, today, d))}
                  >
                    {WEEKDAYS_SHORT[d]}
                  </button>
                ))}
              </div>
              <p className="small" style={{ marginBottom: 0 }}>
                Die Portionen beginnen am Tag nach dem Vortrag. Nach jedem Vortrag rückt die Seite automatisch weiter.
              </p>
            </div>
            <div>
              <label className="lbl">Aktuelle Dars-Seite</label>
              <Stepper value={dp} min={1} max={604} label="Dars-Seite" onChange={(v) => updatePlan((p) => setDarsPage(p, today, v))} />
              <div className="small" style={{ marginTop: 6 }}>
                {pageRangeLabel(profile.edition, dp)}
              </div>
            </div>
          </>
        )}
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
          <p className="small" style={{ marginBottom: 0 }}>
            Die Rotation läuft von hier fortlaufend durch deinen Bestand. Schwachstellen kommen zusätzlich dran (höchstens 2 pro Tag).
          </p>
        </div>
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

      <div className="section-title">Backup</div>
      <section className="card stack">
        <p style={{ margin: 0 }}>
          Deine Daten liegen nur auf diesem Gerät. Sichere regelmäßig ein Backup, z. B. in „Dateien“ oder per Nachricht an dich selbst – und
          vor einem Handywechsel.
        </p>
        <button type="button" className="btn block" onClick={exportProfile}>
          Backup exportieren (Profil „{profile.name}“)
        </button>
        <button type="button" className="btn block" onClick={() => fileRef.current?.click()}>
          Backup importieren
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </section>

      <div className="section-title">Profile</div>
      <section className="card stack">
        <button type="button" className="btn block" onClick={closeProfile}>
          Profil wechseln
        </button>
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
        <p style={{ marginBottom: 0 }}>Rezitation: Maḥmūd Khalīl al-Ḥuṣarī über EveryAyah.com (nur online).</p>
      </section>

      {editBestand && (
        <Sheet title="Bestand bearbeiten" onClose={() => setEditBestand(false)}>
          <BestandEditor
            edition={profile.edition}
            pages={profile.bestand}
            onChange={(pages) => updatePlan((p) => ({ ...p, bestand: pages }))}
          />
          <button type="button" className="btn primary block" style={{ marginTop: 16 }} onClick={() => setEditBestand(false)}>
            Fertig
          </button>
        </Sheet>
      )}

      {confirmDelete && (
        <Confirm
          title="Profil löschen?"
          text={`Alle Daten von „${profile.name}“ – Bestand, Häkchen, Bewertungen, Serie und Notizen – werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen. Exportiere vorher ein Backup, falls du es noch brauchst.`}
          confirmLabel="Endgültig löschen"
          danger
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteProfile(profile.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {pendingImport && (
        <Confirm
          title="Backup importieren"
          text={
            pendingImport.id === profile.id
              ? `Den Stand von „${profile.name}“ mit dem Backup ersetzen?`
              : `Das Backup gehört zu „${pendingImport.name}“. Als eigenes Profil auf diesem Gerät anlegen?`
          }
          confirmLabel={pendingImport.id === profile.id ? 'Ersetzen' : 'Profil anlegen'}
          onConfirm={() => {
            void importProfile(pendingImport, false);
            setPendingImport(null);
            toast('Backup importiert.');
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {summary && (
        <Sheet title="Stand für Claude" onClose={() => setSummary(null)}>
          <p className="small" style={{ marginTop: 0 }}>
            Automatisches Kopieren ging nicht. Text markieren und kopieren:
          </p>
          <pre className="summary">{summary}</pre>
        </Sheet>
      )}
    </div>
  );
}
