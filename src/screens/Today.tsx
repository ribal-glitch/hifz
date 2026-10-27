import { useRef, useState, type ReactNode } from 'react';
import { listenUrl, reciterById, useAudio } from '../audio';
import { useLayoutReady } from '../data/quranData';
import { IS_ARTIFACT } from '../platform';
import { addDays, formatDayMonth, formatLong, weekday, WEEKDAYS_SHORT } from '../logic/dates';
import {
  cardStatus,
  cycleStart,
  darsTask,
  effectiveBestand,
  freshPages,
  portionLines,
  rateFresh,
  ratePage,
  rotationInfo,
  setDarsDone,
  setNote,
  toggleFresh,
  logFreeReview,
  removeFreeReview,
  reviewedCount,
  type DarsTask,
} from '../logic/plan';
import type { Rating } from '../logic/profile';
import { JUZ_COUNT, PAGE_COUNT, formatRanges, juzPages, pageJuz, pageLineCount, pageRangeLabel, range, textLines } from '../logic/quran';
import { addQuestion, juzQuestions, newQuestion, rateQuestion } from '../logic/quiz';
import type { QuizItem } from '../logic/profile';
import { CoveredPage } from '../components/CoveredPage';
import { streak } from '../logic/stats';
import { useStore } from '../store';
import { Check, Icon } from '../ui';

export interface ReadTarget {
  page: number;
  /** hervorgehobene Zeilen */
  from?: number;
  to?: number;
  /** Hifz-Modus: ab dieser Zeile verdecken */
  startLine?: number;
  /** Wiederholungszähler einblenden */
  counter?: boolean;
}

const RATINGS: { r: Rating; label: string }[] = [
  { r: 'sitzt', label: 'sitzt' },
  { r: 'wackelt', label: 'wackelt' },
  { r: 'fehler', label: 'Fehler' },
];

/** Nach dem Abfragen einer Seite in „Wiederholen“ */
const REVIEW_RATINGS: { r: Rating; label: string }[] = [
  { r: 'sitzt', label: 'sitzt' },
  { r: 'wackelt', label: 'wacklig' },
];
const RATING_TAG: Record<Rating, { cls: string; label: string }> = {
  sitzt: { cls: 'accent', label: 'sitzt' },
  wackelt: { cls: 'warn', label: 'wacklig' },
  fehler: { cls: 'err', label: 'Fehler' },
};

/**
 * Eine Seite in der Wiederholungsliste. Ein Tipp öffnet sie verdeckt direkt darunter;
 * nach dem Aufsagen wird sie mit „sitzt“ oder „wacklig“ bewertet.
 */
function ReviewPage({
  page,
  open,
  onToggle,
  rating,
  done,
  info,
  onRate,
}: {
  page: number;
  open: boolean;
  onToggle: () => void;
  rating?: Rating;
  /** abgehakt ohne Bewertung */
  done?: boolean;
  info?: ReactNode;
  onRate: (r: Rating) => void;
}) {
  const { profile } = useStore();
  const row = useRef<HTMLDivElement>(null);
  if (!profile) return null;
  const rate = (r: Rating) => {
    onRate(r);
    // die zugeklappte Seite bleibt im Blick, statt dass die Liste nach oben springt
    requestAnimationFrame(() => row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };
  return (
    <div ref={row} className={`listrow review-page${open ? ' open' : ''}`}>
      <button type="button" className="review-head" aria-expanded={open} onClick={onToggle}>
        <span className="pageno">S. {page}</span>
        <span className="sub" style={{ flex: 1, minWidth: 0 }}>
          {pageRangeLabel(profile.edition, page)}
        </span>
        {rating ? (
          <span className={`tag ${RATING_TAG[rating].cls}`}>{RATING_TAG[rating].label}</span>
        ) : done ? (
          <span className="tag accent">✓</span>
        ) : null}
        <span className={`chev${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {info}
      {open && (
        <div className="review-body">
          <CoveredPage edition={profile.edition} page={page} />
          <div className="rate" role="group" aria-label={`Seite ${page} bewerten`} style={{ gridTemplateColumns: '1fr 1fr' }}>
            {REVIEW_RATINGS.map(({ r, label }) => (
              <button key={r} type="button" className={r} aria-pressed={rating === r} onClick={() => rate(r)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  done,
  kicker,
  title,
  sub,
  onToggle,
  toggleLabel,
  collapsible,
  children,
}: {
  n: number;
  done: boolean;
  kicker: string;
  title: ReactNode;
  sub?: ReactNode;
  onToggle?: () => void;
  toggleLabel: string;
  /** zugeklappt, bis man auf die Überschrift tippt */
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const canToggle = collapsible || done;
  const collapsed = canToggle && !open;
  const node = (
    <>
      {done ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="pop">
          <path d="M5.5 12.5 10 17l8.5-9" />
        </svg>
      ) : (
        n
      )}
    </>
  );
  return (
    <section className={`step${done ? ' done' : ''}`}>
      {onToggle ? (
        <button type="button" className="node" aria-pressed={done} aria-label={toggleLabel} onClick={onToggle}>
          {node}
        </button>
      ) : (
        <div className="node" aria-hidden="true">
          {node}
        </div>
      )}
      <div className="step-body">
        <button
          type="button"
          style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', width: '100%' }}
          onClick={() => canToggle && setOpen(!open)}
          aria-expanded={canToggle ? !collapsed : undefined}
        >
          <div className="step-kicker">{kicker}</div>
          <div className="step-title">
            {title}
            {collapsible && <span className={`chev${collapsed ? '' : ' open'}`} aria-hidden="true" />}
          </div>
          {sub && <div className="sub">{sub}</div>}
        </button>
      </div>
      {!collapsed && <div className="step-children">{children}</div>}
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

/** Lernschritte für die Dars-Seite: anhören, lesen, auswendig prüfen, verbinden. */
function DarsMethod({ task, onOpen }: { task: DarsTask; onOpen: (t: ReadTarget) => void }) {
  const { profile, today } = useStore();
  const audio = useAudio();
  useLayoutReady(profile?.edition ?? '1405');
  if (!profile) return null;
  const reps = profile.repeatEach ?? 3;
  const reciter = reciterById(profile.reciter);
  const listen = (from?: number, to?: number, repeatEach?: number) =>
    void audio.play({ edition: profile.edition, page: task.page, from, to, repeatEach });
  // In der Link-Version gibt es keinen eigenen Player: Rezitation auf quran.com öffnen
  const listenButton = (from?: number, to?: number, repeatEach?: number) =>
    IS_ARTIFACT ? (
      <a className="btn" href={listenUrl(profile.edition, task.page, from, to)} target="_blank" rel="noopener noreferrer">
        <Icon name="play" /> Hören
      </a>
    ) : (
      <button type="button" className="btn" onClick={() => listen(from, to, repeatEach)}>
        <Icon name="play" /> Hören
      </button>
    );
  const prevLearned = effectiveBestand(profile, today).has(task.page - 1);

  const items: { what: ReactNode; detail: string; action: ReactNode }[] = [];
  if (task.kind === 'portion') {
    const range = `Zeilen ${task.from}–${task.to}`;
    items.push({
      what: 'Anhören',
      detail: IS_ARTIFACT ? 'mehrmals, auf quran.com' : `jede Ajah ${reps}× · ${reciter.name.split(' ').slice(-1)[0]}`,
      action: listenButton(task.from, task.to),
    });
    items.push({
      what: 'Lesen, bis es flüssig ist',
      detail: 'ca. 10× laut, mit Blick in den Mushaf',
      action: (
        <button type="button" className="btn" onClick={() => onOpen({ page: task.page, from: task.from, to: task.to, counter: true })}>
          Lesen
        </button>
      ),
    });
    items.push({
      what: 'Auswendig aufsagen',
      detail: `${range} ohne Blick, dann aufdecken`,
      action: (
        <button type="button" className="btn" onClick={() => onOpen({ page: task.page, from: task.from, to: task.to, startLine: task.from })}>
          Prüfen
        </button>
      ),
    });
    if (task.day > 0) {
      items.push({
        what: 'Verbinden',
        detail: `Zeilen 1–${task.to} am Stück`,
        action: (
          <button type="button" className="btn" onClick={() => onOpen({ page: task.page, startLine: 1 })}>
            Prüfen
          </button>
        ),
      });
    } else if (prevLearned) {
      items.push({
        what: 'Übergang',
        detail: `Letzte 2 Zeilen von S. ${task.page - 1}, dann nahtlos weiter`,
        action: (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const lines = textLines(profile.edition, task.page - 1);
              onOpen({ page: task.page - 1, startLine: lines[lines.length - 2] });
            }}
          >
            Prüfen
          </button>
        ),
      });
    }
  } else if (task.kind === 'rehearsal') {
    items.push({
      what: 'Ganze Seite anhören',
      detail: 'einmal durchgehend, auf Tajwīd achten',
      action: listenButton(undefined, undefined, 1),
    });
    items.push({
      what: 'Probevortrag',
      detail: 'ganze Seite auswendig, bis sie 3× fehlerfrei sitzt',
      action: (
        <button type="button" className="btn" onClick={() => onOpen({ page: task.page, startLine: 1 })}>
          Prüfen
        </button>
      ),
    });
    if (prevLearned)
      items.push({
        what: 'Mit der Vorseite verbinden',
        detail: `ab S. ${task.page - 1} durchgehend aufsagen`,
        action: (
          <button type="button" className="btn" onClick={() => onOpen({ page: task.page - 1, startLine: 1 })}>
            Prüfen
          </button>
        ),
      });
  } else {
    items.push({
      what: 'Vor dem Vortrag',
      detail: 'einmal anhören und einmal auswendig aufsagen',
      action: (
        <button type="button" className="btn" onClick={() => onOpen({ page: task.page, startLine: 1 })}>
          Prüfen
        </button>
      ),
    });
  }
  return (
    <div className="panel">
      <ol className="method">
        {items.map((it, i) => (
          <li key={i}>
            <div className="what">
              {it.what}
              <small>{it.detail}</small>
            </div>
            {it.action}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Zwei Seiten: „Lernen“ (neue Dars-Portion, Notiz) und „Wiederholen“ (frische Seiten, Murājaʿa, Prüfung). */
export function Today({ onOpen, part }: { onOpen: (t: ReadTarget) => void; part: 'learn' | 'review' }) {
  const { profile, today, update } = useStore();
  /** in „Wiederholen“ aufgeklappte Seite, z. B. „f-396“ oder „m-310“ */
  const [openPage, setOpenPage] = useState<string | null>(null);
  if (!profile) return null;
  const ed = profile.edition;
  const day = profile.days[today];
  const status = cardStatus(profile, today);
  const cards = (part === 'learn' ? [status.dars] : [status.fresh, status.muraja]).filter((v) => v !== null);
  const partDone = cards.length > 0 && cards.every(Boolean);
  const doneCount = cards.filter(Boolean).length;
  const dars = darsTask(profile, today);
  const fresh = freshPages(profile, today);
  const muraja = day?.muraja;
  const st = streak(profile, today);
  const hasBestand = effectiveBestand(profile, today).size > 0;
  const rot = rotationInfo(profile, today);
  let stepNo = 0;
  const toggleOpen = (k: string) => setOpenPage((cur) => (cur === k ? null : k));

  return (
    <div>
      <header className="today-head">
        <div className="date">{formatLong(today)}</div>
        <div className="status">
          {part === 'learn'
            ? !dars
              ? 'Kein Dars eingestellt'
              : partDone
                ? 'Heute gelernt'
                : 'Neue Portion lernen'
            : cards.length === 0
              ? 'Noch nichts geplant'
              : partDone
                ? 'Wiederholung geschafft'
                : `${doneCount} von ${cards.length} Schritten erledigt`}
        </div>
        {cards.length > 0 && (
          <div className="meta">
            <div className="progress-dots" aria-hidden="true">
              {cards.map((c, i) => (
                <i key={i} className={c ? 'on' : ''} />
              ))}
            </div>
            {st > 0 && (
              <span className="small">
                {st} {st === 1 ? 'Tag' : 'Tage'} in Folge
              </span>
            )}
            {reviewedCount(profile, today).free > 0 && (
              <span className="small">+{reviewedCount(profile, today).free} S. außerhalb des Plans</span>
            )}
          </div>
        )}
      </header>

      {partDone && (
        <div className="done-line pop" role="status">
          <Check on label="Erledigt" />
          <div>
            {day?.complete ? 'Bārak Allāhu fīk.' : part === 'learn' ? 'Portion geschafft.' : 'Wiederholung geschafft.'}
            <small>
              {day?.complete
                ? 'Die ganze Einheit für heute ist erledigt. Morgen geht es weiter.'
                : part === 'learn'
                  ? 'Weiter geht es unter „Wiederholen“.'
                  : 'Fehlt nur noch die Dars-Portion unter „Lernen“.'}
            </small>
          </div>
        </div>
      )}

      {part === 'review' && !hasBestand && (
        <div className="card empty">Noch kein Bestand eingetragen. Lege in den Einstellungen fest, welche Seiten du auswendig kannst.</div>
      )}

      {part === 'learn' && !dars && (
        <div className="card">
          <p style={{ marginTop: 0 }}>Hier erscheint deine Dars-Portion des Tages, wenn du bei einem Lehrer jede Woche eine neue Seite lernst.</p>
          <p className="small" style={{ marginBottom: 0 }}>Einschalten unter Einstellungen (Zahnrad oben) → Dars.</p>
        </div>
      )}

      <div className="flow">
        {part === 'learn' && dars && (
          <Step
            n={++stepNo}
            done={status.dars === true}
            kicker={`Neu lernen · Dars S. ${dars.page}`}
            title={
              dars.kind === 'portion'
                ? `Zeilen ${dars.from}–${dars.to}`
                : dars.kind === 'rehearsal'
                  ? 'Ganze Seite: Probevortrag'
                  : 'Heute Vortrag beim Sheikh'
            }
            sub={pageRangeLabel(ed, dars.page)}
            onToggle={() => update((p) => setDarsDone(p, today, !p.days[today]?.darsDone))}
            toggleLabel="Dars erledigt"
          >
            <DarsMethod task={dars} onOpen={onOpen} />
            <div className="weekstrip" aria-label="Dars-Woche">
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(cycleStart(today, profile.dars.weekday), i);
                const n = pageLineCount(ed, dars.page);
                const label = i <= 4 ? portionLines(n, i).join('–') : i === 5 ? 'Seite' : 'Vortrag';
                const cls = d === today ? 'now' : d < today ? 'past' : '';
                return (
                  <div key={d} className={cls}>
                    <b>{WEEKDAYS_SHORT[weekday(d)]}</b>
                    {d < today && profile.days[d]?.darsDone ? '✓' : label}
                  </div>
                );
              })}
            </div>
            {status.dars === false && (
              <button type="button" className="btn primary block mark-done" onClick={() => update((p) => setDarsDone(p, today, true))}>
                {dars.kind === 'lecture' ? 'Vortrag gehalten' : 'Heutige Portion sitzt'}
              </button>
            )}
          </Step>
        )}

        {part === 'review' && fresh.length > 0 && (
          <Step
            n={++stepNo}
            done={status.fresh === true}
            kicker="Letzte Dars-Seiten"
            title="Frisches festigen"
            sub={`S. ${formatRanges(fresh)} · ${fresh.filter((f) => day?.freshDone.includes(f)).length} von ${fresh.length} aufgesagt`}
            collapsible
            onToggle={() =>
              update((p) => {
                const allDone = fresh.every((f) => p.days[today]?.freshDone.includes(f));
                let q = p;
                for (const f of fresh) if (allDone || !q.days[today]?.freshDone.includes(f)) q = toggleFresh(q, today, f);
                return q;
              })
            }
            toggleLabel="Alle frischen Seiten erledigt"
          >
            <div className="panel">
              {fresh.map((f) => (
                <ReviewPage
                  key={f}
                  page={f}
                  open={openPage === `f-${f}`}
                  onToggle={() => toggleOpen(`f-${f}`)}
                  rating={day?.freshDone.includes(f) ? day.ratings[f] : undefined}
                  done={!!day?.freshDone.includes(f)}
                  onRate={(r) => {
                    update((p) => rateFresh(p, today, f, r));
                    setOpenPage(null);
                  }}
                />
              ))}
            </div>
            <p className="hint">Am Stück aus dem Gedächtnis aufsagen. Ein Tipp auf die Seite öffnet sie verdeckt, jeder weitere Tipp deckt eine Zeile auf.</p>
          </Step>
        )}

        {part === 'review' && muraja && muraja.pages.length > 0 && (
          <Step
            n={++stepNo}
            done={status.muraja === true}
            kicker="Murājaʿa"
            title="Altes wiederholen"
            sub={`S. ${formatRanges(muraja.pages)} · Seite ${rot.position} von ${rot.size}, alle ${rot.cycleDays} Tage einmal durch`}
            collapsible
            toggleLabel="Murājaʿa"
          >
            <div className="panel">
              {[...muraja.pages.map((p) => ({ p, extra: false })), ...muraja.extra.map((p) => ({ p, extra: true }))].map(({ p, extra }) => {
                const prev = profile.pages[p]?.d === today ? profile.pages[p]?.prev : profile.pages[p];
                const followUp = extra && prev?.r === 'sitzt';
                return (
                  <ReviewPage
                    key={p}
                    page={p}
                    open={openPage === `m-${p}`}
                    onToggle={() => toggleOpen(`m-${p}`)}
                    rating={day?.ratings[p]}
                    info={
                      extra && (
                        <div className="small" style={{ marginTop: 2 }}>
                          {followUp ? (
                            <span className="tag accent">Nachprüfung</span>
                          ) : (
                            <span className={`tag ${prev?.r === 'fehler' ? 'err' : 'warn'}`}>Schwachstelle</span>
                          )}
                          {prev && (
                            <span>
                              {' '}
                              · zuletzt „{RATING_TAG[prev.r].label}“ am {formatDayMonth(prev.d)}
                            </span>
                          )}
                        </div>
                      )
                    }
                    onRate={(r) => {
                      update((pr) => ratePage(pr, today, p, r));
                      setOpenPage(null);
                    }}
                  />
                );
              })}
            </div>
            <p className="hint">Erst auswendig aufsagen, dann aufdecken und ehrlich bewerten. Was wacklig ist, kommt morgen wieder.</p>
          </Step>
        )}
      </div>

      {part === 'review' && <FreeReviews onOpen={onOpen} />}

      {part === 'learn' && (
        <>
          <div className="ornament" aria-hidden="true">
            <i />
          </div>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Notiz
          </h2>
          <textarea
            className="note"
            aria-label="Notiz für heute"
            placeholder="z. B. was der Sheikh korrigiert hat"
            value={day?.note ?? ''}
            onChange={(e) => update((p) => setNote(p, today, e.target.value))}
          />
        </>
      )}

      {part === 'review' && hasBestand && (
        <>
          <div className="ornament" aria-hidden="true">
            <i />
          </div>
          <Quiz onOpen={onOpen} />
          <div className="ornament" aria-hidden="true">
            <i />
          </div>
          <JuzQuiz />
        </>
      )}
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
          Letzte 2 Zeilen von <PageLink page={q.page} onOpen={() => onOpen({ page: q.page, startLine: lines[lines.length - 2] })} />, dann
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
    <section>
      <h2 className="section-title">Mini-Prüfung</h2>
      <p className="small" style={{ margin: '-4px 0 10px' }}>
        Ohne Vorlauf mitten in einer Seite einsteigen. Übergänge und Schwachstellen kommen öfter dran.
      </p>
      {last && last.ok === null && (
        <div className="panel" style={{ padding: '14px 14px 12px' }}>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.35 }}>
            {renderQ(last)}
          </div>
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
        <button type="button" className="btn block" onClick={ask}>
          Neue Frage
        </button>
      )}
      {answered.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {answered
            .slice()
            .reverse()
            .map((q, i) => (
              <div key={i} className="listrow row" style={{ fontSize: 15 }}>
                <span style={{ flex: 1 }}>{renderQ(q)}</span>
                <span className={`tag ${q.ok ? 'accent' : 'err'}`}>{q.ok ? 'fehlerfrei' : 'mit Fehlern'}</span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

/** Wiederholungen außerhalb des Plans: Seiten selbst eintragen und bewerten. */
function FreeReviews({ onOpen }: { onOpen: (t: ReadTarget) => void }) {
  const { profile, today, update, toast } = useStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  if (!profile) return null;
  const entries = profile.days[today]?.free ?? [];
  const a = Number(from);
  const b = Number(to || from);
  const valid = a >= 1 && b <= PAGE_COUNT && a <= b && b - a < 40;
  const log = (r: Rating) => {
    if (!valid) return;
    update((p) => logFreeReview(p, today, range(a, b), r));
    toast(`${a === b ? `S. ${a}` : `S. ${a}–${b}`} als „${r === 'fehler' ? 'Fehler' : r}“ eingetragen`);
    setFrom('');
    setTo('');
  };
  const label = { sitzt: 'sitzt', wackelt: 'wackelt', fehler: 'Fehler' } as const;
  return (
    <section>
      <h2 className="section-title">Außerhalb des Plans</h2>
      <p className="small" style={{ margin: '-4px 0 10px' }}>
        Seiten, die du zusätzlich wiederholt hast, z. B. im Gebet oder unterwegs. Sie zählen für Festigung und Schwachstellen; der
        Plan läuft unverändert weiter.
      </p>
      <div className="free-form">
        <div>
          <label className="lbl" htmlFor="free-from">
            Von Seite
          </label>
          <input id="free-from" className="field" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label className="lbl" htmlFor="free-to">
            Bis Seite (optional)
          </label>
          <input id="free-to" className="field" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      <div className="rate" role="group" aria-label="Eingetragene Seiten bewerten">
        {RATINGS.map(({ r, label: l }) => (
          <button key={r} type="button" className={r} disabled={!valid} onClick={() => log(r)}>
            {l}
          </button>
        ))}
      </div>
      {entries.length > 0 && (
        <div className="free-list" aria-label="Heute außerhalb des Plans">
          {entries
            .slice()
            .sort((x, y) => x.page - y.page)
            .map((f) => (
              <span key={f.page} className="free-item">
                <button type="button" className="link" style={{ width: 'auto', height: 'auto' }} onClick={() => onOpen({ page: f.page })}>
                  S. {f.page}
                </button>
                <span className={`tag ${f.r === 'sitzt' ? 'accent' : f.r === 'wackelt' ? 'warn' : 'err'}`}>{label[f.r]}</span>
                <button type="button" aria-label={`Eintrag Seite ${f.page} entfernen`} onClick={() => update((p) => removeFreeReview(p, today, f.page))}>
                  ×
                </button>
              </span>
            ))}
        </div>
      )}
    </section>
  );
}

const QUIZ_SIZE = 10;

/** Juz-Quiz: zehn zufällige Stellen aus einem Juz, verdeckt weiterlesen und abhaken oder Fehler ankreuzen. */
function JuzQuiz() {
  const { profile, today, update } = useStore();
  const ed = profile?.edition ?? '1405';
  const bestand = profile ? effectiveBestand(profile, today) : new Set<number>();
  const learned = (j: number) => {
    const [a, b] = juzPages(ed, j);
    return range(a, b).filter((p) => bestand.has(p)).length;
  };
  // Voreinstellung: der Juz mit den meisten auswendig gelernten Seiten
  const [juz, setJuz] = useState(() => {
    let best = pageJuz(ed, [...bestand][0] ?? 1);
    for (let j = 1; j <= JUZ_COUNT; j++) if (learned(j) > learned(best)) best = j;
    return best;
  });
  const [qs, setQs] = useState<QuizItem[] | null>(null);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLElement>(null);
  if (!profile) return null;

  const start = () => {
    setQs(juzQuestions(profile, juz, QUIZ_SIZE));
    setAt(0);
  };
  const answer = (ok: boolean) => {
    if (!qs) return;
    const q = qs[at];
    setQs(qs.map((x, i) => (i === at ? { ...x, ok } : x)));
    setAt(at + 1);
    requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    // wie die Mini-Prüfung: zählt für die Statistik, ein Fehler macht die Seite zur Schwachstelle
    update((p) => {
      const withQ = addQuestion(p, today, { ...q, ok: null });
      return rateQuestion(withQ, today, withQ.days[today].quiz.length - 1, ok);
    });
  };
  const current = qs && at < qs.length ? qs[at] : null;
  const right = qs?.filter((q) => q.ok).length ?? 0;
  const [pa, pb] = juzPages(ed, juz);

  return (
    <section className="juz-quiz" ref={box}>
      <h2 className="section-title">Juz-Quiz</h2>
      <p className="small" style={{ margin: '-4px 0 10px' }}>
        {QUIZ_SIZE} zufällige Stellen aus einem Juz. Die Zeile davor steht als Stichwort da, dann verdeckt weiterlesen.
      </p>

      {!qs && (
        <div className="stack">
          <div>
            <label className="lbl" htmlFor="quiz-juz">
              Juz
            </label>
            <select id="quiz-juz" className="field" value={juz} onChange={(e) => setJuz(Number(e.target.value))}>
              {Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((j) => {
                const n = learned(j);
                const [a, b] = juzPages(ed, j);
                return (
                  <option key={j} value={j}>
                    Juz {j} · S. {a}–{b}
                    {n === b - a + 1 ? ' · auswendig' : n > 0 ? ` · ${n} S. auswendig` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <button type="button" className="btn primary block" onClick={start}>
            Quiz starten · S. {pa}–{pb}
          </button>
        </div>
      )}

      {qs && current && (
        <div className="panel" style={{ padding: '12px 12px 14px' }}>
          <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
            <b style={{ flex: 1 }}>
              Frage {at + 1} von {qs.length}
            </b>
            <span className="small">
              S. {current.page} · ab Zeile {current.line}
            </span>
          </div>
          <CoveredPage key={`${current.page}-${current.line}`} edition={ed} page={current.page} from={current.line} cue />
          <div className="rate" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="sitzt" onClick={() => answer(true)}>
              ✓ konnte ich
            </button>
            <button type="button" className="fehler" onClick={() => answer(false)}>
              ✗ Fehler
            </button>
          </div>
          <button type="button" className="btn ghost block" style={{ marginTop: 6 }} onClick={() => setQs(null)}>
            Quiz abbrechen
          </button>
        </div>
      )}

      {qs && !current && (
        <div className="panel" style={{ padding: '14px 14px 12px' }}>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.35 }}>
            {right} von {qs.length} gekonnt
          </div>
          <div style={{ marginTop: 8 }}>
            {qs.map((q, i) => (
              <div key={i} className="listrow row" style={{ fontSize: 15 }}>
                <span style={{ flex: 1 }}>
                  S. {q.page}, ab Zeile {q.line}
                </span>
                <span className={`tag ${q.ok ? 'accent' : 'err'}`}>{q.ok ? '✓' : 'Fehler'}</span>
              </div>
            ))}
          </div>
          <p className="small">Seiten mit Fehlern kommen als Schwachstelle in die Murājaʿa.</p>
          <button type="button" className="btn primary block" onClick={start}>
            Neues Quiz · Juz {juz}
          </button>
          <button type="button" className="btn block" style={{ marginTop: 6 }} onClick={() => setQs(null)}>
            Anderen Juz wählen
          </button>
        </div>
      )}
    </section>
  );
}
