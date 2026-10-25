import { useState, type ReactNode } from 'react';
import { addDays, formatDayMonth, formatLong, weekday, WEEKDAYS_SHORT } from '../logic/dates';
import {
  cardStatus,
  cycleStart,
  darsTask,
  freshPages,
  portionLines,
  ratePage,
  setDarsDone,
  setNote,
  toggleFresh,
  effectiveBestand,
} from '../logic/plan';
import type { Rating } from '../logic/profile';
import { pageLineCount, pageRangeLabel, textLines, formatRanges } from '../logic/quran';
import { addQuestion, newQuestion, rateQuestion } from '../logic/quiz';
import { streak } from '../logic/stats';
import { useStore } from '../store';
import { Check } from '../ui';

export interface ReadTarget {
  page: number;
  /** hervorgehobene Zeilen */
  from?: number;
  to?: number;
  /** im Hifz-Modus ab dieser Zeile verdecken */
  startLine?: number;
}

const RATINGS: { r: Rating; label: string }[] = [
  { r: 'sitzt', label: 'sitzt' },
  { r: 'wackelt', label: 'wackelt' },
  { r: 'fehler', label: 'Fehler' },
];

function TaskCard({
  eyebrow,
  title,
  done,
  onCheck,
  checkLabel,
  children,
  summary,
}: {
  eyebrow: string;
  title: ReactNode;
  done: boolean;
  onCheck?: () => void;
  checkLabel: string;
  children: ReactNode;
  summary?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const collapsed = done && !open;
  return (
    <section className={`card${done ? ' done' : ''}`}>
      <div className="card-head">
        <button
          type="button"
          className="titles"
          style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
          onClick={() => done && setOpen(!open)}
          aria-expanded={done ? !collapsed : undefined}
        >
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          {collapsed && summary && <div className="sub">{summary}</div>}
        </button>
        <Check on={done} onToggle={onCheck} label={checkLabel} />
      </div>
      {!collapsed && <div style={{ marginTop: 12 }}>{children}</div>}
    </section>
  );
}

function PageLink({ page, onOpen, children }: { page: number; onOpen: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="link" onClick={onOpen} aria-label={`Seite ${page} öffnen`}>
      {children ?? `S. ${page}`}
    </button>
  );
}

export function Today({ onOpen }: { onOpen: (t: ReadTarget) => void }) {
  const { profile, today, update } = useStore();
  if (!profile) return null;
  const ed = profile.edition;
  const day = profile.days[today];
  const status = cardStatus(profile, today);
  const cards = [status.dars, status.fresh, status.muraja].filter((v) => v !== null);
  const doneCount = cards.filter(Boolean).length;
  const dars = darsTask(profile, today);
  const fresh = freshPages(profile, today);
  const muraja = day?.muraja;
  const st = streak(profile, today);
  const hasBestand = effectiveBestand(profile, today).size > 0;

  return (
    <div>
      <div className="today-head">
        <div style={{ flex: 1 }}>
          <div className="date">{formatLong(today)}</div>
          <div className="status">
            {cards.length === 0 ? 'Noch nichts geplant' : doneCount === cards.length ? 'Alles erledigt' : `${doneCount} von ${cards.length} erledigt`}
          </div>
        </div>
        {st > 0 && (
          <span className="chip accent" title="Tage am Stück">
            Serie {st} {st === 1 ? 'Tag' : 'Tage'}
          </span>
        )}
      </div>

      {day?.complete && (
        <div className="done-banner pop" role="status">
          <Check on label="Einheit erledigt" />
          <div>
            Einheit für heute erledigt.
            <div style={{ fontWeight: 500, fontSize: 15 }}>Bārak Allāhu fīk – bis morgen.</div>
          </div>
        </div>
      )}

      {!hasBestand && !dars && (
        <div className="card empty">
          Noch kein Bestand eingetragen. Lege in den Einstellungen fest, welche Seiten du auswendig kannst.
        </div>
      )}

      {dars && (
        <TaskCard
          eyebrow={`Dars · S. ${dars.page}`}
          title={
            dars.kind === 'portion'
              ? `Zeilen ${dars.from}–${dars.to}`
              : dars.kind === 'rehearsal'
                ? 'Ganze Seite als Probevortrag'
                : 'Heute Vortrag beim Sheikh'
          }
          done={status.dars === true}
          onCheck={() => update((p) => setDarsDone(p, today, !p.days[today]?.darsDone))}
          checkLabel="Dars erledigt"
          summary={pageRangeLabel(ed, dars.page)}
        >
          <div className="sub">{pageRangeLabel(ed, dars.page)}</div>
          <div className="weekstrip" aria-label="Dars-Woche">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(cycleStart(today, profile.dars.weekday), i);
              const n = pageLineCount(ed, dars.page);
              const label = i <= 4 ? portionLines(n, i).join('–') : i === 5 ? 'Seite' : 'Vortrag';
              const cls = d === today ? 'now' : d < today ? 'past' : '';
              return (
                <div key={d} className={cls}>
                  <b>{WEEKDAYS_SHORT[weekday(d)]}</b>
                  {label}
                  {d < today && profile.days[d]?.darsDone ? ' ✓' : ''}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="btn block"
            style={{ marginTop: 12 }}
            onClick={() =>
              onOpen(dars.kind === 'portion' ? { page: dars.page, from: dars.from, to: dars.to } : { page: dars.page })
            }
          >
            Seite {dars.page} öffnen
          </button>
        </TaskCard>
      )}

      {fresh.length > 0 && (
        <TaskCard
          eyebrow="Frische Dars-Seiten · täglich"
          title={fresh.length === 1 ? `S. ${fresh[0]} aufsagen` : `${fresh.length} Seiten aufsagen`}
          done={status.fresh === true}
          onCheck={() =>
            update((p) => {
              const allDone = fresh.every((f) => p.days[today]?.freshDone.includes(f));
              let q = p;
              for (const f of fresh) if (allDone || !q.days[today]?.freshDone.includes(f)) q = toggleFresh(q, today, f);
              return q;
            })
          }
          checkLabel="Alle frischen Seiten erledigt"
          summary={`S. ${formatRanges(fresh)}`}
        >
          {fresh.map((f) => (
            <div key={f} className="listrow row">
              <div style={{ flex: 1 }}>
                <PageLink page={f} onOpen={() => onOpen({ page: f })}>
                  <span className="pageno">S. {f}</span>
                </PageLink>
                <div className="sub">{pageRangeLabel(ed, f)}</div>
              </div>
              <Check small on={!!day?.freshDone.includes(f)} onToggle={() => update((p) => toggleFresh(p, today, f))} label={`Seite ${f} aufgesagt`} />
            </div>
          ))}
        </TaskCard>
      )}

      {muraja && muraja.pages.length > 0 && (
        <TaskCard
          eyebrow={`Murājaʿa · ${[...muraja.pages, ...muraja.extra].filter((p) => day.ratings[p]).length} von ${muraja.pages.length + muraja.extra.length} bewertet`}
          title={`S. ${formatRanges(muraja.pages)}`}
          done={status.muraja === true}
          checkLabel="Murājaʿa erledigt"
          summary={`${muraja.extra.length ? `+ Schwachstelle S. ${muraja.extra.join(', ')} · ` : ''}alle Seiten bewertet`}
        >
          {[...muraja.pages.map((p) => ({ p, extra: false })), ...muraja.extra.map((p) => ({ p, extra: true }))].map(({ p, extra }) => {
            const prev = profile.pages[p];
            return (
              <div key={p} className="listrow">
                <div className="row">
                  <PageLink page={p} onOpen={() => onOpen({ page: p })}>
                    <span className="pageno">S. {p}</span>
                  </PageLink>
                  <span className="sub" style={{ flex: 1, minWidth: 0 }}>
                    {pageRangeLabel(ed, p)}
                  </span>
                  {extra && <span className={`chip ${prev?.r === 'fehler' ? 'err' : 'warn'}`}>Schwachstelle</span>}
                </div>
                <div className="rate" role="group" aria-label={`Seite ${p} bewerten`}>
                  {RATINGS.map(({ r, label }) => (
                    <button
                      key={r}
                      type="button"
                      className={r}
                      aria-pressed={day.ratings[p] === r}
                      onClick={() => update((pr) => ratePage(pr, today, p, r))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {extra && prev && !day.ratings[p] && (
                  <div className="small" style={{ marginTop: 6 }}>
                    Zuletzt „{prev.r === 'fehler' ? 'Fehler' : prev.r}“ am {formatDayMonth(prev.d)}
                  </div>
                )}
              </div>
            );
          })}
        </TaskCard>
      )}

      <section className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Notiz
        </div>
        <textarea
          className="note"
          aria-label="Notiz für heute"
          placeholder="z. B. was der Sheikh korrigiert hat"
          value={day?.note ?? ''}
          onChange={(e) => update((p) => setNote(p, today, e.target.value))}
        />
      </section>

      {hasBestand && <Quiz onOpen={onOpen} />}
    </div>
  );
}

function Quiz({ onOpen }: { onOpen: (t: ReadTarget) => void }) {
  const { profile, today, update } = useStore();
  if (!profile) return null;
  const items = profile.days[today]?.quiz ?? [];
  const last = items.length ? items[items.length - 1] : null;
  const answered = items.filter((q) => q.ok !== null);
  const ask = () =>
    update((p) => {
      const q = newQuestion(p, today);
      return q ? addQuestion(p, today, q) : p;
    });

  const renderQ = (q: (typeof items)[number]) => {
    if (q.kind === 'transition') {
      const lines = textLines(profile.edition, q.page);
      return (
        <>
          Letzte 2 Zeilen von{' '}
          <PageLink page={q.page} onOpen={() => onOpen({ page: q.page, from: lines[lines.length - 2], to: lines[lines.length - 1] })} />, dann
          nahtlos weiter auf <PageLink page={q.page + 1} onOpen={() => onOpen({ page: q.page + 1, startLine: 1 })} />
        </>
      );
    }
    return (
      <>
        Beginne <PageLink page={q.page} onOpen={() => onOpen({ page: q.page, startLine: q.line })} />{' '}
        {q.line === 1 ? 'am Seitenanfang' : `ab Zeile ${q.line}`}
      </>
    );
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="titles">
          <div className="eyebrow">Mini-Prüfung</div>
          <h2>Kannst du hier einsteigen?</h2>
        </div>
      </div>
      {last && last.ok === null && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.4 }}>{renderQ(last)}</div>
          <div className="rate" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="sitzt" onClick={() => update((p) => rateQuestion(p, today, items.length - 1, true))}>
              fehlerfrei
            </button>
            <button type="button" className="fehler" onClick={() => update((p) => rateQuestion(p, today, items.length - 1, false))}>
              mit Fehlern
            </button>
          </div>
        </div>
      )}
      {(!last || last.ok !== null) && (
        <button type="button" className="btn primary block" style={{ marginTop: 10 }} onClick={ask}>
          Neue Frage
        </button>
      )}
      {answered.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {answered
            .slice()
            .reverse()
            .map((q, i) => (
              <div key={i} className="listrow row" style={{ fontSize: 15 }}>
                <span style={{ flex: 1 }}>{renderQ(q)}</span>
                <span className={`chip ${q.ok ? 'accent' : 'err'}`}>{q.ok ? 'fehlerfrei' : 'mit Fehlern'}</span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
