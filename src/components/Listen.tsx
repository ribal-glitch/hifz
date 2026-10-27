import { useState } from 'react';
import { RECITERS, REPEAT_OPTIONS, ayahRangeLabel, sliceAyahs, useAudio } from '../audio';
import { ayahKey } from '../data/quranData';
import { suraName } from '../logic/quran';
import { useStore } from '../store';
import { Icon, Seg, Sheet } from '../ui';

const ayahName = (idx: number) => {
  const [s, a] = ayahKey(idx);
  return `${suraName(s)} ${a}`;
};

/** Zwei Auswahlfelder „Von“ und „Bis“ über die Ajat einer Seite (globale Indizes, ohne Basmala). */
export function AyahRange({
  ayahs,
  from,
  to,
  onChange,
}: {
  ayahs: number[];
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  return (
    <div className="range-row">
      <div>
        <label className="lbl" htmlFor="range-from">
          Von
        </label>
        <select
          id="range-from"
          className="field"
          value={from}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(v, Math.max(v, to));
          }}
        >
          {ayahs.map((a) => (
            <option key={a} value={a}>
              {ayahName(a)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="lbl" htmlFor="range-to">
          Bis
        </label>
        <select
          id="range-to"
          className="field"
          value={to}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.min(from, v), v);
          }}
        >
          {ayahs.map((a) => (
            <option key={a} value={a}>
              {ayahName(a)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function ReciterSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label className="lbl" htmlFor="reciter">
        Rezitator
      </label>
      <select id="reciter" className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {RECITERS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.style !== 'Murattal' ? ` – ${r.style}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Einstellungen der laufenden Wiedergabe: ein Tipp auf die Player-Leiste öffnet sie. */
export function PlayerSheet({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const audio = useAudio();
  const st = audio.state;
  const ayahs = (st?.all ?? []).filter((a) => a >= 0);
  const playing = (st?.list ?? []).filter((a) => a >= 0);
  const [reciter, setReciter] = useState(st?.reciter ?? '');
  const [repeatEach, setRepeatEach] = useState(st?.repeatEach ?? 3);
  const [echo, setEcho] = useState(st?.echo ?? false);
  const [from, setFrom] = useState(playing[0] ?? ayahs[0]);
  const [to, setTo] = useState(playing[playing.length - 1] ?? ayahs[ayahs.length - 1]);
  if (!st) return null;

  const apply = () => {
    update((p) => ({ ...p, reciter, echoPause: echo, ...(st.loop ? {} : { repeatEach }) }));
    audio.restart({
      list: sliceAyahs(st.all, from, to),
      reciter,
      repeatEach,
      echo,
      label: `S. ${st.page} · ${ayahRangeLabel(from, to)}`,
    });
    onClose();
  };

  return (
    <Sheet title="Wiedergabe" onClose={onClose}>
      <div className="stack">
        <ReciterSelect value={reciter} onChange={setReciter} />
        {ayahs.length > 1 && (
          <AyahRange
            ayahs={ayahs}
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
        )}
        {!st.loop && (
          <div>
            <label className="lbl">Jede Ajah wiederholen</label>
            <div className="chips-row">
              {REPEAT_OPTIONS.map((n) => (
                <button key={n} type="button" aria-pressed={repeatEach === n} onClick={() => setRepeatEach(n)}>
                  {n}×
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="lbl">Nachsprech-Pause nach jeder Ajah</label>
          <Seg<string>
            label="Nachsprech-Pause"
            value={echo ? 'an' : 'aus'}
            onChange={(v) => setEcho(v === 'an')}
            options={[
              { value: 'aus', label: 'Aus' },
              { value: 'an', label: 'An' },
            ]}
          />
        </div>
        <button type="button" className="btn primary block" onClick={apply}>
          <Icon name="play" /> Ab {ayahName(from)} abspielen
        </button>
      </div>
    </Sheet>
  );
}
