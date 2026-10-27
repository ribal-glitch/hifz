import { useRef, useState, type ReactNode } from 'react';
import { CoveredPage } from '../components/CoveredPage';
import { QuizScreen } from '../components/QuizScreen';
import { Fold, Step } from '../components/Steps';
import { formatDayMonth, formatLong } from '../logic/dates';
import {
  cardStatus,
  effectiveBestand,
  freshPages,
  logFreeReview,
  rateFresh,
  ratePage,
  removeFreeReview,
  toggleFresh,
} from '../logic/plan';
import type { QuizItem, Rating } from '../logic/profile';
import { JUZ_COUNT, PAGE_COUNT, SURAS, juzPages, meta, pageJuz, range, suraName, suraPages, type EditionId } from '../logic/quran';
import { addQuestion, juzQuestions, newQuestion, rateQuestion } from '../logic/quiz';
import { streak } from '../logic/stats';
import { useStore } from '../store';
import { Icon, Seg } from '../ui';

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

const RATING_ICON: Record<Rating, { icon: 'check' | 'shaky' | 'cross'; label: string }> = {
  sitzt: { icon: 'check', label: 'sitzt' },
  wackelt: { icon: 'shaky', label: 'wacklig' },
  fehler: { icon: 'cross', label: 'Fehler' },
};

/** Bewertung als farbige Symbol-Knöpfe. */
function RateButtons({ value, onRate, ratings = ['sitzt', 'wackelt'], disabled }: { value?: Rating; onRate: (r: Rating) => void; ratings?: Rating[]; disabled?: boolean }) {
  return (
    <div className="rate icons" role="group" aria-label="Bewerten" style={{ gridTemplateColumns: `repeat(${ratings.length}, 1fr)` }}>
      {ratings.map((r) => (
        <button key={r} type="button" className={r} aria-label={RATING_ICON[r].label} title={RATING_ICON[r].label} aria-pressed={value === r} disabled={disabled} onClick={() => onRate(r)}>
          <Icon name={RATING_ICON[r].icon} />
        </button>
      ))}
    </div>
  );
}

/** Sura und Ayat einer Seite: „al-Kahf 5–15“ */
function pageSuras(ed: EditionId, page: number): string {
  const [s1, a1] = meta(ed).pageFirst[page - 1];
  const [s2, a2] = meta(ed).pageLast[page - 1];
  return s1 === s2 ? `${suraName(s1)} ${a1}–${a2}` : `${suraName(s1)} ${a1} – ${suraName(s2)} ${a2}`;
}

/** Suren eines Seitenblocks: „al-Isrāʾ – al-Kahf“ */
function blockSuras(ed: EditionId, pages: number[]): string {
  if (!pages.length) return '';
  const sorted = [...pages].sort((a, b) => a - b);
  const s1 = meta(ed).pageFirst[sorted[0] - 1][0];
  const s2 = meta(ed).pageLast[sorted[sorted.length - 1] - 1][0];
  return s1 === s2 ? suraName(s1) : `${suraName(s1)} – ${suraName(s2)}`;
}

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
  const state = rating ?? (done ? 'sitzt' : undefined);
  return (
    <div ref={row} className={`listrow review-page${open ? ' open' : ''}${state ? ` rated-${state}` : ''}`}>
      <button type="button" className="review-head" aria-expanded={open} onClick={onToggle}>
        <span className="rstate" aria-hidden="true">
          {state && <Icon name={RATING_ICON[state].icon} />}
        </span>
        <span className="rname">{pageSuras(profile.edition, page)}</span>
        <span className="rpage">S. {page}</span>
        <span className={`chev${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {info}
      {open && (
        <div className="review-body">
          <CoveredPage edition={profile.edition} page={page} />
          <RateButtons value={rating} onRate={rate} />
        </div>
      )}
    </div>
  );
}

/** „Wiederholen“: frische Seiten, Murājaʿa, Prüfungen und Wiederholungen außerhalb des Plans. */
export function Today() {
  const { profile, today, update } = useStore();
  /** aufgeklappte Seite, z. B. „f-396“ oder „m-310“ */
  const [openPage, setOpenPage] = useState<string | null>(null);
  if (!profile) return null;
  const ed = profile.edition;
  const day = profile.days[today];
  const status = cardStatus(profile, today);
  const cards = [status.fresh, status.muraja].filter((v) => v !== null);
  const partDone = cards.length > 0 && cards.every(Boolean);
  const fresh = freshPages(profile, today);
  const muraja = day?.muraja;
  const st = streak(profile, today);
  const hasBestand = effectiveBestand(profile, today).size > 0;
  let stepNo = 0;
  const toggleOpen = (k: string) => setOpenPage((cur) => (cur === k ? null : k));

  return (
    <div>
      <header className="today-head">
        <div className="date">{formatLong(today)}</div>
        <div className="status">{cards.length === 0 ? 'Noch nichts geplant' : partDone ? 'Wiederholung geschafft' : 'Wiederholen'}</div>
        {st > 0 && <div className="streak">🔥 {st}</div>}
      </header>

      {partDone && (
        <div className="done-line pop" role="status">
          <Icon name="check" /> {day?.complete ? 'Bārak Allāhu fīk.' : 'Wiederholung geschafft.'}
        </div>
      )}

      {!hasBestand && <div className="card empty">Noch nichts auswendig eingetragen. Unter „Fortschritt“ kannst du Suren als auswendig markieren.</div>}

      <div className="flow">
        {fresh.length > 0 && (
          <Step
            n={++stepNo}
            done={status.fresh === true}
            title="Frisches festigen"
            sub={blockSuras(ed, fresh)}
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
          </Step>
        )}

        {muraja && muraja.pages.length > 0 && (
          <Step
            n={++stepNo}
            done={status.muraja === true}
            title="Altes wiederholen"
            sub={blockSuras(ed, [...muraja.pages, ...muraja.extra])}
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
                        <div className="small" style={{ margin: '2px 0 0 34px' }}>
                          <span className={`tag ${followUp ? 'accent' : prev?.r === 'fehler' ? 'err' : 'warn'}`}>{followUp ? 'Nachprüfung' : 'Schwachstelle'}</span>
                          {prev && <span> · {formatDayMonth(prev.d)}</span>}
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
          </Step>
        )}
      </div>

      {hasBestand && <QuizButtons />}
      <FreeReviews />
    </div>
  );
}

/** Mini-Prüfung und Juz-Quiz: öffnen sich im Vollbild. */
function QuizButtons() {
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
  const [quiz, setQuiz] = useState<{ kind: 'mini' | 'juz'; items: QuizItem[] } | null>(null);
  if (!profile) return null;

  /** Frage im Tagesprotokoll ablegen und bewerten (Fehler machen die Seite zur Schwachstelle) */
  const record = (q: QuizItem, ok: boolean) =>
    update((p) => {
      const withQ = addQuestion(p, today, { ...q, ok: null });
      return rateQuestion(withQ, today, withQ.days[today].quiz.length - 1, ok);
    });
  const nextMini = () => {
    const q = newQuestion(profile, today);
    if (q) setQuiz((cur) => ({ kind: 'mini', items: [...(cur?.kind === 'mini' ? cur.items : []), q] }));
  };

  return (
    <section className="quiz-launch">
      <h2 className="section-title">Prüfen</h2>
      <div className="quiz-cards">
        <button type="button" className="quiz-card" onClick={nextMini}>
          <Icon name="quiz" />
          <b>Mini-Prüfung</b>
        </button>
        <div className="quiz-card juz">
          <Icon name="list" />
          <b>Juz-Quiz</b>
          <select className="field" aria-label="Juz" value={juz} onChange={(e) => setJuz(Number(e.target.value))}>
            {Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((j) => (
              <option key={j} value={j}>
                Juz {j}
                {learned(j) ? ' ✓' : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn primary block" onClick={() => setQuiz({ kind: 'juz', items: juzQuestions(profile, juz, 10) })}>
            Start
          </button>
        </div>
      </div>
      {quiz && (
        <QuizScreen
          edition={ed}
          title={quiz.kind === 'mini' ? 'Mini-Prüfung' : `Juz ${juz}`}
          questions={quiz.items}
          onAnswer={(i, ok) => record(quiz.items[i], ok)}
          onMore={quiz.kind === 'mini' ? nextMini : undefined}
          onClose={() => setQuiz(null)}
        />
      )}
    </section>
  );
}

/** Wiederholungen außerhalb des Plans: Sura oder Seiten selbst eintragen und bewerten. */
function FreeReviews() {
  const { profile, today, update, toast } = useStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [by, setBy] = useState<'pages' | 'sura'>('sura');
  const [sura, setSura] = useState(0);
  if (!profile) return null;
  const entries = profile.days[today]?.free ?? [];
  // nach Sura: alle Seiten der Sura (die längste, al-Baqara, hat 48 Seiten)
  const [a, b] = by === 'sura' ? (sura ? suraPages(profile.edition, sura) : [0, 0]) : [Number(from), Number(to || from)];
  const valid = a >= 1 && b <= PAGE_COUNT && a <= b && b - a < 50;
  const log = (r: Rating) => {
    if (!valid) return;
    update((p) => logFreeReview(p, today, range(a, b), r));
    const what = by === 'sura' ? SURAS[sura - 1].tr : a === b ? `S. ${a}` : `S. ${a}–${b}`;
    toast(`${what}: ${RATING_ICON[r].label}`);
    setFrom('');
    setTo('');
    setSura(0);
  };
  return (
    <Fold title="Zusätzlich wiederholt">
      <div style={{ marginBottom: 10 }}>
        <Seg<'pages' | 'sura'>
          label="Eintragen nach"
          value={by}
          onChange={setBy}
          options={[
            { value: 'sura', label: 'Sura' },
            { value: 'pages', label: 'Seiten' },
          ]}
        />
      </div>
      {by === 'pages' ? (
        <div className="free-form">
          <div>
            <label className="lbl" htmlFor="free-from">
              Von Seite
            </label>
            <input id="free-from" className="field" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="lbl" htmlFor="free-to">
              Bis Seite
            </label>
            <input id="free-to" className="field" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
      ) : (
        <select id="free-sura" className="field" aria-label="Sura" value={sura} onChange={(e) => setSura(Number(e.target.value))}>
          <option value={0} disabled>
            Sura wählen …
          </option>
          {SURAS.map((x) => (
            <option key={x.n} value={x.n}>
              {x.n}. {x.tr}
            </option>
          ))}
        </select>
      )}
      <RateButtons ratings={['sitzt', 'wackelt', 'fehler']} onRate={log} disabled={!valid} />
      {entries.length > 0 && (
        <div className="free-list" aria-label="Heute zusätzlich">
          {entries
            .slice()
            .sort((x, y) => x.page - y.page)
            .map((f) => (
              <span key={f.page} className={`free-item rated-${f.r}`}>
                <Icon name={RATING_ICON[f.r].icon} />
                {pageSuras(profile.edition, f.page)}
                <button type="button" aria-label={`Eintrag Seite ${f.page} entfernen`} onClick={() => update((p) => removeFreeReview(p, today, f.page))}>
                  ×
                </button>
              </span>
            ))}
        </div>
      )}
    </Fold>
  );
}
