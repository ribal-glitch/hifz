import { useState } from 'react';
import { JUZ_COUNT, PAGE_COUNT, SURAS, formatRanges, juzPages, range, suraPages, type EditionId } from '../logic/quran';
import { Seg } from '../ui';

type Mode = 'juz' | 'sura' | 'pages';

export function BestandEditor({
  edition,
  pages,
  onChange,
}: {
  edition: EditionId;
  pages: number[];
  onChange: (pages: number[]) => void;
}) {
  const [mode, setMode] = useState<Mode>('juz');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const set = new Set(pages);
  const apply = (add: number[], remove: number[]) => {
    const next = new Set(set);
    remove.forEach((p) => next.delete(p));
    add.forEach((p) => next.add(p));
    onChange([...next].sort((a, b) => a - b));
  };
  const toggleRange = (a: number, b: number) => {
    const r = range(a, b);
    const full = r.every((p) => set.has(p));
    if (full) apply([], r);
    else apply(r, []);
  };
  const state = (a: number, b: number) => {
    const n = range(a, b).filter((p) => set.has(p)).length;
    return n === b - a + 1 ? 'full' : n ? 'part' : 'none';
  };
  const parsed = (() => {
    const a = Number(from);
    const b = Number(to || from);
    if (!a || !b || a < 1 || b > PAGE_COUNT || a > b) return null;
    return [a, b] as const;
  })();

  return (
    <div>
      <div className="card" style={{ padding: 14 }}>
        <div className="big" style={{ fontSize: 24 }}>
          {pages.length} {pages.length === 1 ? 'Seite' : 'Seiten'}
        </div>
        <div className="sub">{pages.length ? `S. ${formatRanges(pages)}` : 'Noch nichts ausgewählt'}</div>
      </div>
      <Seg<Mode>
        label="Auswahl nach"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'juz', label: 'Juz' },
          { value: 'sura', label: 'Suren' },
          { value: 'pages', label: 'Seiten' },
        ]}
      />
      <div style={{ marginTop: 14 }}>
        {mode === 'juz' && (
          <>
            <p className="small" style={{ marginTop: 0 }}>
              Tippe einen Juz an, um ihn ganz hinzuzufügen oder zu entfernen. Umrandet = teilweise.
            </p>
            <div className="pick-grid">
              {range(1, JUZ_COUNT).map((j) => {
                const [a, b] = juzPages(edition, j);
                const s = state(a, b);
                return (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={s === 'full'}
                    className={s === 'part' ? 'part' : ''}
                    aria-label={`Juz ${j}, Seite ${a} bis ${b}`}
                    onClick={() => toggleRange(a, b)}
                  >
                    {j}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {mode === 'sura' && (
          <div>
            {SURAS.map((s) => {
              const [a, b] = suraPages(edition, s.n);
              const st = state(a, b);
              return (
                <button key={s.n} type="button" className="check-row" aria-pressed={st === 'full'} onClick={() => toggleRange(a, b)}>
                  <span className={`box ${st === 'full' ? 'on' : st === 'part' ? 'part' : ''}`}>
                    {st === 'full' ? '✓' : st === 'part' ? '–' : ''}
                  </span>
                  <span style={{ flex: 1 }}>
                    <b>
                      {s.n}. {s.tr}
                    </b>
                    <span className="small"> · S. {a === b ? a : `${a}–${b}`}</span>
                  </span>
                  <span className="ar" style={{ fontSize: 20, color: 'var(--muted)' }}>
                    {s.ar}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {mode === 'pages' && (
          <div className="stack">
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="lbl" htmlFor="from">
                  Von Seite
                </label>
                <input id="from" className="field" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="lbl" htmlFor="to">
                  Bis Seite
                </label>
                <input id="to" className="field" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn primary" style={{ flex: 1 }} disabled={!parsed} onClick={() => parsed && apply(range(parsed[0], parsed[1]), [])}>
                Hinzufügen
              </button>
              <button type="button" className="btn" style={{ flex: 1 }} disabled={!parsed} onClick={() => parsed && apply([], range(parsed[0], parsed[1]))}>
                Entfernen
              </button>
            </div>
            <p className="small">Seiten 1–604 des Madina-Mushaf. Ein einzelnes Feld genügt für eine Seite.</p>
          </div>
        )}
      </div>
    </div>
  );
}
