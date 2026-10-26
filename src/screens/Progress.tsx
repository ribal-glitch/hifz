import { useState } from 'react';
import { addDays, formatDayMonth, WEEKDAYS_SHORT } from '../logic/dates';
import { reviewedCount, rotationInfo } from '../logic/plan';
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

const SURA_LABEL: Record<SuraState, string> = {
  auswendig: 'auswendig',
  dars: 'im Dars',
  teilweise: 'teilweise',
  offen: 'offen',
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
  const rot = rotationInfo(profile, today);
  const fresh = newMilestones(profile, today);
  const next = MILESTONES.find((m) => prog.pages < pagesForMilestone(m.percent));
  const celebrated = fresh.length ? MILESTONES.find((m) => m.percent === Math.max(...fresh)) : null;
  const doneDays = cal.flat().filter((c) => c.state === 'complete').length;
  const week = Array.from({ length: 7 }, (_, i) => reviewedCount(profile, addDays(today, -i))).reduce(
    (acc, c) => ({ plan: acc.plan + c.plan, free: acc.free + c.free }),
    { plan: 0, free: 0 },
  );

  return (
    <div>
      {celebrated && (
        <section className="card celebrate">
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>
            Meilenstein erreicht
          </div>
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

      <section style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Ring value={prog.pages / 604} size={224} stroke={9} label={`${formatDecimal(prog.percent)} Prozent des Qurans auswendig`}>
            <div>
              <div className="serif" style={{ fontSize: 58, fontWeight: 500, lineHeight: 1 }}>
                {formatDecimal(prog.percent)}
                <span style={{ fontSize: 28 }}> %</span>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                des Qurans
              </div>
            </div>
          </Ring>
        </div>
        <div className="serif" style={{ marginTop: 14, fontSize: 22 }}>
          {prog.pages} von 604 Seiten · ca. {formatDecimal(prog.juz)} Juz
        </div>
        {next && (
          <div className="sub" style={{ marginTop: 2 }}>
            Noch {pagesForMilestone(next.percent) - prog.pages} Seiten bis {next.label}
          </div>
        )}
      </section>

      <div className="ornament" aria-hidden="true">
        <i />
      </div>

      <div className="stats">
        <div>
          <div className="n">{st}</div>
          <div className="l">{st === 1 ? 'Tag' : 'Tage'} in Folge</div>
        </div>
        <div>
          <div className="n">{doneDays}</div>
          <div className="l">von 28 Tagen</div>
        </div>
        <div>
          <div className="n">{rot.cycleDays}</div>
          <div className="l">Tage je Durchgang</div>
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
          <i style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }} />
          Einheit erledigt
        </span>
        <span>
          <i style={{ background: 'var(--accent-soft)' }} />
          teilweise
        </span>
      </div>

      <p className="hint">
        Letzte 7 Tage: {week.plan + week.free} Seiten wiederholt
        {week.free > 0 ? `, davon ${week.free} außerhalb des Plans` : ''}.
      </p>

      <h2 className="section-title">Festigung</h2>
      <div className="row" style={{ gap: 18 }}>
        <Ring value={cons.total ? cons.sitzt / cons.total : 0} size={104} stroke={7} label={`${cons.sitzt} von ${cons.total} Seiten sitzen`}>
          <div className="serif" style={{ fontSize: 26 }}>
            {cons.total ? Math.round((cons.sitzt / cons.total) * 100) : 0} %
          </div>
        </Ring>
        <div style={{ flex: 1 }}>
          <div className="serif" style={{ fontSize: 21, lineHeight: 1.25 }}>
            {cons.sitzt} von {cons.total} Seiten sitzen
          </div>
          <div className="sub">zuletzt mit „sitzt“ bewertet</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6 }}>
            {cons.wackelt > 0 && <span className="tag warn">{cons.wackelt} wackelt</span>}
            {cons.fehler > 0 && <span className="tag err">{cons.fehler} Fehler</span>}
            {cons.unrated > 0 && <span className="tag">{cons.unrated} noch nicht bewertet</span>}
          </div>
        </div>
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
          <i style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }} />
          voll
        </span>
        <span>
          <i style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }} />
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
      <div>
        {suras.map((s) => {
          const meta = SURAS[s.sura - 1];
          const open = openSura === s.sura;
          return (
            <div key={s.sura}>
              <button type="button" className="index-row" aria-expanded={open} onClick={() => setOpenSura(open ? null : s.sura)}>
                <span className="num">{s.sura}</span>
                <span className="name">{meta.tr}</span>
                <span className="leader" aria-hidden="true" />
                <span className={`state ${s.state}`}>
                  {s.state === 'teilweise' ? `${s.done}/${s.total} S.` : SURA_LABEL[s.state]}
                </span>
                <span className="ar">{meta.ar}</span>
              </button>
              {open && (
                <div className="sura-detail">
                  <div>
                    Seite {s.from === s.to ? s.from : `${s.from}–${s.to}`} · {meta.ayahs} Ajat · {SURA_LABEL[s.state]}
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
