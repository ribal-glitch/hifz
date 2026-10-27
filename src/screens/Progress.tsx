import { useEffect, useState } from 'react';
import { Celebration } from '../components/Celebrate';
import { daysBetween, formatDayMonth, formatMonthYear, WEEKDAYS_SHORT } from '../logic/dates';
import { SURAS, formatDecimal, juzPages } from '../logic/quran';
import {
  MILESTONES,
  PACE_OPTIONS,
  defaultPace,
  hafizEstimate,
  calendar,
  consolidation,
  juzStatus,
  markMilestonesSeen,
  newMilestones,
  pagesForMilestone,
  cycleSuraState,
  progress,
  suraStatus,
  type SuraState,
} from '../logic/stats';
import { useStore } from '../store';
import { Icon, Ring } from '../ui';
import type { ReadTarget } from './Today';

const SURA_LABEL: Record<SuraState, string> = {
  auswendig: 'auswendig',
  dars: 'im Dars',
  teilweise: 'teilweise',
  offen: 'offen',
};

/** Zählt beim Öffnen von 0 bis zum Ziel hoch (Kreis und Prozentzahl füllen sich sichtbar). */
function useCountUp(target: number, run: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) {
      setV(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

export function ProgressTab({ onOpen, active }: { onOpen: (t: ReadTarget) => void; active: boolean }) {
  const { profile, today, update, toast } = useStore();
  const [openSura, setOpenSura] = useState<number | null>(null);
  const shownPct = useCountUp(profile ? progress(profile, today).percent : 0, active);
  if (!profile) return null;
  const prog = progress(profile, today);
  const juz = juzStatus(profile, today);
  const suras = suraStatus(profile, today);
  const cons = consolidation(profile, today);
  const cal = calendar(profile, today);
  const fresh = newMilestones(profile, today);
  const next = MILESTONES.find((m) => prog.pages < pagesForMilestone(m.percent));
  const celebrated = fresh.length ? MILESTONES.find((m) => m.percent === Math.max(...fresh)) : null;


  return (
    <div>
      {/* Meilenstein als Einblendung statt als Karte oben, damit die Seite nicht springt */}
      {celebrated && (
        <Celebration
          emoji="🏆"
          title={celebrated.label}
          sub={celebrated.percent === 100 ? 'Der ganze Quran. Allāhumma bārik.' : 'Mā shāʾ Allāh'}
          onDone={() => update((p) => markMilestonesSeen(p, today))}
        />
      )}

      <section style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Ring value={shownPct / 100} size={224} stroke={12} label={`${formatDecimal(prog.percent)} Prozent des Qurans auswendig`}>
            <div>
              <div className="serif" style={{ fontSize: 58, fontWeight: 500, lineHeight: 1 }}>
                {formatDecimal(shownPct)}
                <span style={{ fontSize: 28 }}> %</span>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                des Qurans
              </div>
            </div>
          </Ring>
        </div>
        <div className="serif" style={{ marginTop: 14, fontSize: 22 }}>
          {prog.pages} von 604 Seiten
        </div>
        {next && (
          <div className="sub" style={{ marginTop: 2 }}>
            Noch {pagesForMilestone(next.percent) - prog.pages} Seiten bis {next.label}
          </div>
        )}
      </section>

      <GoalCard />

      <div className="ornament" aria-hidden="true">
        <i />
      </div>

      <div className="cal" aria-label="Kalender der letzten 4 Wochen">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="h">
            {WEEKDAYS_SHORT[d]}
          </div>
        ))}
        {cal.flat().map((c) => (
          <div
            key={c.date}
            className={`d ${c.state}${c.today ? ' today' : ''}`}
            title={formatDayMonth(c.date)}
            aria-label={`${formatDayMonth(c.date)}: ${c.state === 'complete' ? 'erledigt' : c.state === 'partial' ? 'teilweise' : 'offen'}`}
          >
            {Number(c.date.slice(8))}
          </div>
        ))}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--ok-soft)', borderColor: 'var(--ok)', borderRadius: '50%' }} />
          Einheit erledigt
        </span>
        <span>
          <i style={{ background: 'var(--warn-soft)', borderColor: 'var(--warn)', borderRadius: '50%' }} />
          teilweise
        </span>
      </div>

      <h2 className="section-title">Festigung</h2>
      <div className="cons-bar" role="img" aria-label={`${cons.sitzt} sitzen, ${cons.wackelt} wackeln, ${cons.fehler} Fehler, ${cons.unrated} offen`}>
        {(['sitzt', 'wackelt', 'fehler', 'unrated'] as const).map((k) =>
          cons[k] > 0 ? <i key={k} className={k} style={{ flexGrow: cons[k] }} /> : null,
        )}
      </div>
      <div className="legend cons-legend">
        <span className="sitzt">✓ {cons.sitzt}</span>
        {cons.wackelt > 0 && <span className="wackelt">〜 {cons.wackelt}</span>}
        {cons.fehler > 0 && <span className="fehler">✗ {cons.fehler}</span>}
        {cons.unrated > 0 && <span>○ {cons.unrated}</span>}
      </div>

      <h2 className="section-title">30 Juz</h2>
      <div className="juz-grid">
        {juz.map((j) => {
          const [a, b] = juzPages(profile.edition, j.juz);
          return (
            <button
              key={j.juz}
              type="button"
              className={`juz ${j.state}`}
              aria-label={`Juz ${j.juz}: ${j.done} von ${j.total} Seiten`}
              onClick={() => onOpen({ page: a })}
              title={`S. ${a}–${b}`}
            >
              {j.state === 'partial' && <span className="fill" style={{ height: `${(j.done / j.total) * 100}%` }} />}
              <span>{j.juz}</span>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--ok-soft)', borderColor: 'var(--ok)' }} />
          voll
        </span>
        <span>
          <i style={{ borderColor: 'var(--ok)', background: 'var(--ok-soft)' }} />
          teilweise
        </span>
        <span>
          <i />
          offen
        </span>
      </div>

      <h2 className="section-title">Meilensteine</h2>
      <div className="milestones">
        {MILESTONES.map((m) => {
          const reached = prog.pages >= pagesForMilestone(m.percent);
          return (
            <span key={m.percent} className={reached ? 'reached' : ''}>
              {reached ? '✓ ' : ''}
              {m.label}
            </span>
          );
        })}
      </div>

      <h2 className="section-title">Suren</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Tippen: offen → im Dars → auswendig
      </p>
      <div>
        {suras.map((s) => {
          const meta = SURAS[s.sura - 1];
          const open = openSura === s.sura;
          return (
            <div key={s.sura}>
              <div className="index-row sura-row">
                <button type="button" className="row-main" aria-expanded={open} onClick={() => setOpenSura(open ? null : s.sura)}>
                  <span className="num">{s.sura}</span>
                  <span className="name">{meta.tr}</span>
                  <span className="leader" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`state-pill ${s.state}`}
                  aria-label={`${meta.tr}: ${SURA_LABEL[s.state]}. Tippen zum Weiterschalten`}
                  onClick={() => {
                    const next = suraStatus(cycleSuraState(profile, today, s.sura), today)[s.sura - 1].state;
                    update((p) => cycleSuraState(p, today, s.sura));
                    toast(`${meta.tr}: ${SURA_LABEL[next]}`);
                  }}
                >
                  {s.state === 'teilweise' ? `${s.done}/${s.total} S.` : SURA_LABEL[s.state]}
                </button>
                <span className="ar" onClick={() => setOpenSura(open ? null : s.sura)}>
                  {meta.ar}
                </span>
              </div>
              {open && (
                <div className="sura-detail">
                  <div>
                    Seite {s.from === s.to ? s.from : `${s.from}–${s.to}`} · {meta.ayahs} Ayat · {SURA_LABEL[s.state]}
                  </div>
                  <div>
                    {s.done} von {s.total} {s.total === 1 ? 'Seite' : 'Seiten'} im Bestand
                  </div>
                  <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => onOpen({ page: s.from })}>
                    <Icon name="read" /> Lesen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const paceLabel = (n: number) => (n === 0.5 ? '½' : String(n));

/** Ziel-Rechner: Bei welchem Tempo ist der ganze Quran wann auswendig? */
function GoalCard() {
  const { profile, today, update } = useStore();
  if (!profile) return null;
  const pace = defaultPace(profile);
  const est = hafizEstimate(profile, today, pace);
  if (est.left === 0) {
    return (
      <section className="card celebrate" style={{ marginTop: 18 }}>
        <div className="big">Alḥamdulillāh</div>
        <div className="sub">Alle 604 Seiten sind in deinem Bestand.</div>
      </section>
    );
  }
  const years = daysBetween(today, est.date) / 365.25;
  return (
    <section className="card" style={{ marginTop: 18 }}>
      <div className="eyebrow">Hafiz-Ziel</div>
      <div className="serif" style={{ fontSize: 24, lineHeight: 1.25, margin: '4px 0 2px' }}>
        {formatMonthYear(est.date)}
      </div>
      <div className="sub">
        noch {est.left} Seiten · {years < 1 ? `${Math.max(1, Math.round(years * 12))} Monate` : `${years.toFixed(1).replace('.', ',')} Jahre`}
      </div>
      <label className="lbl" style={{ marginTop: 12 }}>
        Neue Seiten pro Woche
      </label>
      <div className="chips-row">
        {PACE_OPTIONS.map((n) => (
          <button key={n} type="button" aria-pressed={pace === n} onClick={() => update((p) => ({ ...p, goalPace: n }))}>
            {paceLabel(n)}
          </button>
        ))}
      </div>
    </section>
  );
}
