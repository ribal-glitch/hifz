import { useState } from 'react';
import { formatDayMonth, WEEKDAYS_SHORT } from '../logic/dates';
import { SURAS, formatDecimal, juzPages } from '../logic/quran';
import {
  MILESTONES,
  calendar,
  consolidation,
  juzStatus,
  markMilestonesSeen,
  newMilestones,
  pagesForMilestone,
  progress,
  streak,
  suraStatus,
  type SuraState,
} from '../logic/stats';
import { useStore } from '../store';
import { Icon, Ring } from '../ui';
import type { ReadTarget } from './Today';

const SURA_LABEL: Record<SuraState, { text: string; cls: string }> = {
  auswendig: { text: 'auswendig', cls: 'accent' },
  dars: { text: 'im Dars', cls: 'warn' },
  teilweise: { text: 'teilweise', cls: '' },
  offen: { text: 'offen', cls: '' },
};

export function ProgressTab({ onOpen }: { onOpen: (t: ReadTarget) => void }) {
  const { profile, today, update } = useStore();
  const [openSura, setOpenSura] = useState<number | null>(null);
  if (!profile) return null;
  const prog = progress(profile, today);
  const juz = juzStatus(profile, today);
  const suras = suraStatus(profile, today);
  const cons = consolidation(profile, today);
  const st = streak(profile, today);
  const cal = calendar(profile, today);
  const fresh = newMilestones(profile, today);
  const next = MILESTONES.find((m) => prog.pages < pagesForMilestone(m.percent));
  const celebrated = fresh.length ? MILESTONES.find((m) => m.percent === Math.max(...fresh)) : null;
  const doneDays = cal.flat().filter((c) => c.state === 'complete').length;

  return (
    <div>
      {celebrated && (
        <section className="card celebrate">
          <div className="eyebrow">Meilenstein erreicht</div>
          <div className="big" style={{ margin: '6px 0' }}>
            {celebrated.label}
          </div>
          <div className="sub">
            {celebrated.percent === 50
              ? 'Die Hälfte des Qurans in deinem Herzen. Mā shāʾ Allāh.'
              : celebrated.percent === 100
                ? 'Der ganze Quran. Allāhumma bārik.'
                : `${pagesForMilestone(celebrated.percent)} Seiten geschafft. Mā shāʾ Allāh.`}
          </div>
          <button type="button" className="btn ghost" style={{ marginTop: 6 }} onClick={() => update((p) => markMilestonesSeen(p, today))}>
            Alḥamdulillāh
          </button>
        </section>
      )}

      <section className="card" style={{ textAlign: 'center', paddingTop: 24 }}>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Ring value={prog.pages / 604} size={220} stroke={16} label={`${formatDecimal(prog.percent)} Prozent des Qurans auswendig`}>
            <div>
              <div style={{ fontSize: 44, fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {formatDecimal(prog.percent)}
                <span style={{ fontSize: 24 }}> %</span>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                des Qurans
              </div>
            </div>
          </Ring>
        </div>
        <div style={{ marginTop: 14, fontWeight: 650, fontSize: 18 }}>
          {prog.pages} von 604 Seiten · ca. {formatDecimal(prog.juz)} Juz
        </div>
        {next && (
          <div className="sub" style={{ marginTop: 4 }}>
            Noch {pagesForMilestone(next.percent) - prog.pages} Seiten bis {next.label}
          </div>
        )}
      </section>

      <section className="card">
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="stat">
            <div className="n">{st}</div>
            <div className="sub">{st === 1 ? 'Tag' : 'Tage'} am Stück</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div className="stat">
            <div className="n">{doneDays}</div>
            <div className="sub">von 28 Tagen erledigt</div>
          </div>
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
            <i style={{ background: 'var(--accent)' }} />
            erledigt
          </span>
          <span>
            <i style={{ background: 'var(--accent-soft)' }} />
            teilweise
          </span>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Festigung</div>
        <div className="row" style={{ gap: 18, marginTop: 10 }}>
          <Ring value={cons.total ? cons.sitzt / cons.total : 0} size={112} stroke={11} label={`${cons.sitzt} von ${cons.total} Seiten sitzen`}>
            <div style={{ fontWeight: 750, fontSize: 22 }}>{cons.total ? Math.round((cons.sitzt / cons.total) * 100) : 0} %</div>
          </Ring>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650, fontSize: 18 }}>
              {cons.sitzt} von {cons.total} Seiten sitzen
            </div>
            <div className="sub" style={{ marginTop: 4 }}>
              Zuletzt bewertet mit „sitzt“.
            </div>
            <div className="chips-row" style={{ marginTop: 8, gap: 6 }}>
              {cons.wackelt > 0 && <span className="chip warn">{cons.wackelt} wackelt</span>}
              {cons.fehler > 0 && <span className="chip err">{cons.fehler} Fehler</span>}
              {cons.unrated > 0 && <span className="chip">{cons.unrated} noch offen</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">30 Juz</div>
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
            <i style={{ background: 'var(--accent)' }} />
            voll
          </span>
          <span>
            <i style={{ boxShadow: 'inset 0 0 0 2px var(--accent)' }} />
            teilweise
          </span>
          <span>
            <i style={{ background: 'var(--surface-2)' }} />
            offen
          </span>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Meilensteine</div>
        <div className="milestones">
          {MILESTONES.map((m) => {
            const reached = prog.pages >= pagesForMilestone(m.percent);
            return (
              <span key={m.percent} className={`chip ${reached ? 'accent' : ''}`} style={reached ? undefined : { opacity: 0.7 }}>
                {reached ? '✓ ' : ''}
                {m.label}
              </span>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          114 Suren
        </div>
        {suras.map((s) => {
          const meta = SURAS[s.sura - 1];
          const label = SURA_LABEL[s.state];
          const open = openSura === s.sura;
          return (
            <div key={s.sura}>
              <button type="button" className="sura-row" aria-expanded={open} onClick={() => setOpenSura(open ? null : s.sura)}>
                <span className="num">{s.sura}</span>
                <span className="name">
                  <b>{meta.tr}</b>
                  <span className={`chip ${label.cls}`} style={{ marginLeft: 8 }}>
                    {label.text}
                  </span>
                </span>
                <span className="ar">{meta.ar}</span>
              </button>
              {open && (
                <div className="sura-detail">
                  <div>
                    Seite {s.from === s.to ? s.from : `${s.from}–${s.to}`} · {meta.ayahs} Ajat
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
      </section>
    </div>
  );
}
