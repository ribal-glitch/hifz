import { useMemo, useState } from 'react';
import { BestandEditor } from '../components/BestandEditor';
import { WEEKDAYS_SHORT } from '../logic/dates';
import { AVATAR_COLORS, MURAJA_OPTIONS, createProfile } from '../logic/profile';
import { pageRangeLabel } from '../logic/quran';
import { markMilestonesSeen } from '../logic/stats';
import { useStore } from '../store';
import { Avatar, Seg, Stepper } from '../ui';

/** Wochentage in deutscher Reihenfolge Mo–So */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function Onboarding({ onCancel }: { onCancel: () => void }) {
  const { addProfile, today } = useStore();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const color = useMemo(() => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], []);
  const [bestand, setBestand] = useState<number[]>([]);
  const [dars, setDars] = useState(false);
  const [weekday, setWeekday] = useState(4);
  const [darsPage, setDarsPage] = useState(1);
  const [perDay, setPerDay] = useState(5);

  const finish = () => {
    const p = createProfile({
      name,
      color,
      today,
      bestand,
      dars: { enabled: dars, weekday, page: darsPage },
      murajaPerDay: perDay,
    });
    void addProfile(markMilestonesSeen(p, today));
  };

  return (
    <div className="who">
      <div className="row">
        <button type="button" className="btn ghost" style={{ paddingLeft: 0 }} onClick={step === 1 ? onCancel : () => setStep(step - 1)}>
          {step === 1 ? 'Abbrechen' : 'Zurück'}
        </button>
        <span className="small" style={{ marginLeft: 'auto' }}>
          Schritt {step} von 3
        </span>
      </div>
      <div className="steps" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 1 && (
        <div className="stack">
          <h1>Wie heißt du?</h1>
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={name || '?'} color={color} size={56} />
            <input
              className="field"
              autoFocus
              placeholder="Name"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(2)}
            />
          </div>
          <p className="small">Dein Avatar entsteht aus dem ersten Buchstaben.</p>
          <button type="button" className="btn primary block" disabled={!name.trim()} onClick={() => setStep(2)}>
            Weiter
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1>Was kannst du auswendig?</h1>
          <p className="sub" style={{ marginTop: 0 }}>
            Wähle ganze Juz oder Suren. Einzelne Seiten gehen unter „Seiten“. Du kannst das später ändern.
          </p>
          <BestandEditor edition="1405" pages={bestand} onChange={setBestand} />
          <button type="button" className="btn primary block" style={{ marginTop: 18 }} onClick={() => setStep(3)}>
            Weiter
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <h1>Lernst du im Dars?</h1>
          <p className="sub" style={{ marginTop: 0 }}>
            Im Dars lernst du jede Woche eine neue Seite und trägst sie an einem festen Tag vor.
          </p>
          <Seg<string>
            label="Dars"
            value={dars ? 'ja' : 'nein'}
            onChange={(v) => setDars(v === 'ja')}
            options={[
              { value: 'ja', label: 'Ja' },
              { value: 'nein', label: 'Nein' },
            ]}
          />
          {dars && (
            <>
              <div>
                <label className="lbl">Vortrag am</label>
                <div className="chips-row">
                  {WEEK_ORDER.map((d) => (
                    <button key={d} type="button" aria-pressed={weekday === d} onClick={() => setWeekday(d)}>
                      {WEEKDAYS_SHORT[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="lbl">Dars-Seite dieser Woche</label>
                <Stepper value={darsPage} min={1} max={604} onChange={setDarsPage} label="Dars-Seite" />
                <div className="small" style={{ marginTop: 6 }}>
                  {pageRangeLabel('1405', darsPage)}
                </div>
              </div>
            </>
          )}
          <div>
            <label className="lbl">Murājaʿa: Seiten pro Tag</label>
            <div className="chips-row">
              {MURAJA_OPTIONS.map((n) => (
                <button key={n} type="button" aria-pressed={perDay === n} onClick={() => setPerDay(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn primary block" style={{ marginTop: 18 }} onClick={finish}>
            Profil anlegen
          </button>
        </div>
      )}
    </div>
  );
}
