import { useMemo, useState } from 'react';
import { BestandEditor } from '../components/BestandEditor';
import { AVATAR_COLORS, MURAJA_OPTIONS, createProfile } from '../logic/profile';
import { markMilestonesSeen } from '../logic/stats';
import { useStore } from '../store';
import { Avatar } from '../ui';

/** Wochentage in deutscher Reihenfolge Mo–So */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function Onboarding({ onCancel }: { onCancel?: () => void }) {
  const { addProfile, today } = useStore();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const color = useMemo(() => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], []);
  const [bestand, setBestand] = useState<number[]>([]);
  const [perDay, setPerDay] = useState(5);

  const finish = () => {
    const p = createProfile({
      name,
      color,
      today,
      bestand,
      murajaPerDay: perDay,
    });
    void addProfile(markMilestonesSeen(p, today));
  };

  return (
    <div className="who">
      <div className="row">
        {(step > 1 || onCancel) && (
          <button type="button" className="btn ghost" style={{ paddingLeft: 0 }} onClick={step === 1 ? onCancel : () => setStep(step - 1)}>
            {step === 1 ? 'Abbrechen' : 'Zurück'}
          </button>
        )}
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
          <button type="button" className="btn primary block" disabled={!name.trim()} onClick={() => setStep(2)}>
            Weiter
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1>Was kannst du auswendig?</h1>
          <BestandEditor edition="1405" pages={bestand} onChange={setBestand} />
          <button type="button" className="btn primary block" style={{ marginTop: 18 }} onClick={() => setStep(3)}>
            Weiter
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <h1>Wie viel wiederholen?</h1>
          <div>
            <label className="lbl">Seiten pro Tag</label>
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
