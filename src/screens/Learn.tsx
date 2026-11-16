import { useState } from 'react';
import { ayahRangeLabel, ayahsForLines } from '../audio';
import { MethodList, type MethodItem } from '../components/Steps';
import { cachedLayout, useLayoutReady, type LayoutData } from '../data/quranData';
import { SURA_AYAH_START } from '../data/meta.generated';
import { formatLong, WEEKDAYS, WEEKDAYS_SHORT } from '../logic/dates';
import {
  PER_WEEK_OPTIONS,
  newPlan,
  pageRange,
  planFinished,
  planProgress,
  planSuras,
  planTask,
  planTitle,
  setPlanPace,
  setPlanPage,
  setPlanWeekday,
  suraRange,
  weekLines,
  weekIndex,
  type LearnPlan,
  type PlanTask,
  type Segment,
} from '../logic/learn';
import { archivePlan, plansOf, removePlan, setTaskDone, taskDone, upsertPlan } from '../logic/plan';
import { PAGE_COUNT, SURAS, suraPages, suraStartLine, type EditionId } from '../logic/quran';
import { suraStatus } from '../logic/stats';
import { useStore } from '../store';
import { Confirm, Icon, Seg, Sheet, Stepper } from '../ui';
import { WEEK_ORDER } from './Onboarding';


/** „al-ʿAnkabūt 13–14“ aus den Zeilen; ohne geladenes Layout die Seiten. */
function segLabel(ed: EditionId, segs: Segment[]): string {
  const layout = cachedLayout(ed);
  if (layout) {
    const ayahs = segs.flatMap((s) => ayahsForLines(layout, s.page, s.from, s.to)).filter((a) => a >= 0);
    if (ayahs.length) return ayahRangeLabel(ayahs[0], ayahs[ayahs.length - 1]);
  }
  const p1 = segs[0].page;
  const p2 = segs[segs.length - 1].page;
  return p1 === p2 ? `S. ${p1}` : `S. ${p1}–${p2}`;
}

/** Die Wochen-Zeilen bis zum Ende der heutigen Portion (zum Verbinden). */
function upTo(week: Segment[], last: Segment): Segment[] {
  const out: Segment[] = [];
  for (const s of week) {
    if (s.page < last.page) out.push(s);
    else if (s.page === last.page) {
      out.push({ ...s, to: Math.min(s.to, last.to) });
      break;
    }
  }
  return out;
}

function stepsFor(task: PlanTask): MethodItem[] {
  const id = task.plan.id;
  if (task.kind === 'portion') {
    // Prüfen: ab dem zweiten Tag zusammen mit den Tagen davor (verbinden)
    const test = task.day > 0 ? upTo(task.week, task.segs[task.segs.length - 1]) : task.segs;
    return [
      { id: `${id}:listen`, what: 'Hören', views: [{ mode: 'listen', segs: task.segs }] },
      { id: `${id}:read`, what: 'Lesen', views: [{ mode: 'read', segs: task.segs }] },
      { id: `${id}:recite`, what: 'Prüfen', views: [{ mode: 'cover', segs: test }] },
    ];
  }
  return [
    { id: `${id}:listen`, what: 'Hören', views: [{ mode: 'listen', segs: task.week, repeatEach: 1 }] },
    { id: `${id}:rehearse`, what: 'Prüfen', views: [{ mode: 'cover', segs: task.week }] },
  ];
}

const KIND_LABEL = { portion: 'Heute', rehearsal: 'Probevortrag', lecture: 'Vortrag' } as const;

/** „Lernen“: die Lernpläne mit der heutigen Portion; neue Pläne anlegen, fertige weglegen. */
export function Learn() {
  const { profile, today, update } = useStore();
  const [editing, setEditing] = useState<LearnPlan | 'new' | null>(null);
  useLayoutReady(profile?.edition ?? '1405');
  if (!profile) return null;
  const plans = plansOf(profile);
  const active = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);
  const tasks = active.map((p) => planTask(profile.edition, p, today)).filter((t): t is PlanTask => t !== null);
  const doneCount = tasks.filter((t) => taskDone(profile, today, t.plan.id)).length;

  return (
    <div>
      <header className="today-head">
        <div className="date">{formatLong(today)}</div>
        <div className="status">
          {active.length === 0 ? 'Was möchtest du lernen?' : tasks.length && doneCount === tasks.length ? 'Heute gelernt' : 'Heute'}
        </div>
      </header>

      {active.length === 0 ? (
        <NewPlanForm onDone={() => setEditing(null)} />
      ) : (
        <>
          {active.map((p) => (
            <PlanCard key={p.id} plan={p} onEdit={() => setEditing(p)} />
          ))}
          <button type="button" className="link-btn add" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Neues lernen
          </button>
        </>
      )}

      {archived.length > 0 && (
        <div className="archived" aria-label="Fertig gelernt">
          {archived.map((p) => (
            <span key={p.id}>
              ✓ {planTitle(profile.edition, p)}
              <button type="button" aria-label={`${planTitle(profile.edition, p)} aus der Liste löschen`} onClick={() => update((pr) => removePlan(pr, p.id, today))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {editing && (
        <Sheet title={editing === 'new' ? 'Neues lernen' : 'Lernplan ändern'} onClose={() => setEditing(null)}>
          {editing === 'new' ? <NewPlanForm onDone={() => setEditing(null)} /> : <PlanForm plan={editing} onDone={() => setEditing(null)} />}
        </Sheet>
      )}
    </div>
  );
}

function PlanCard({ plan, onEdit }: { plan: LearnPlan; onEdit: () => void }) {
  const { profile, today, update } = useStore();
  /** erledigte Karte wieder aufklappen */
  const [expanded, setExpanded] = useState(false);
  if (!profile) return null;
  const ed = profile.edition;
  const task = planTask(ed, plan, today);
  const prog = planProgress(ed, plan, today);
  const finished = planFinished(ed, plan, today);
  const done = taskDone(profile, today, plan.id);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  // heute erledigt: Karte klappt zu, damit „Lernen“ leer und ruhig aussieht
  const collapsed = done && !finished && !expanded;

  if (collapsed)
    return (
      <section className="plan-card is-done collapsed">
        <button type="button" className="plan-collapsed" aria-expanded={false} onClick={() => setExpanded(true)}>
          <span className="done-dot" aria-hidden="true">
            <Icon name="check" />
          </span>
          <span className="plan-title small">{planTitle(ed, plan)}</span>
          <span className="chev" aria-hidden="true" />
        </button>
      </section>
    );

  return (
    <section className={`plan-card${done ? ' is-done' : ''}`}>
      <div className="plan-head">
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => done && setExpanded(false)}>
          <h2 className="plan-title">{planTitle(ed, plan)}</h2>
          <div className="plan-meta">
            {task ? (
              <>
                <b>{KIND_LABEL[task.kind]}</b> · {segLabel(ed, task.kind === 'portion' ? task.segs : task.week)}
              </>
            ) : finished ? (
              'Fertig gelernt'
            ) : (
              `Beginnt am ${formatLong(plan.start)}`
            )}
          </div>
        </div>
        <button type="button" className="iconbtn" aria-label="Lernplan ändern" onClick={onEdit}>
          <Icon name="edit" />
        </button>
      </div>
      <div className="plan-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Fortschritt">
        <i style={{ width: `${pct}%` }} />
      </div>

      {finished && (
        <button type="button" className="btn primary block" onClick={() => update((p) => archivePlan(p, plan.id))}>
          🎉 In die Wiederholung
        </button>
      )}

      {task && (
        <>
          <MethodList compact items={stepsFor(task)} />
          {done ? (
            <div className="plan-done" role="status">
              <Icon name="check" /> Heute geschafft
            </div>
          ) : (
            <button type="button" className="btn primary block mark-done" onClick={() => update((p) => setTaskDone(p, today, plan.id, true))}>
              <Icon name="check" /> {task.kind === 'lecture' ? 'Vortrag gehalten' : 'Gelernt'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const simple = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

/** Zeilen, auf denen die Ayat a1–a2 einer Sura stehen (vom Anfang von a1 bis zum Ende von a2). */
function ayahRange(layout: LayoutData, ed: EditionId, sura: number, a1: number, a2: number): Pick<LearnPlan, 'fromPage' | 'fromLine' | 'toPage' | 'toLine'> | null {
  const i1 = SURA_AYAH_START[sura - 1] + a1 - 1;
  const i2 = SURA_AYAH_START[sura - 1] + a2 - 1;
  const [p1, p2] = suraPages(ed, sura);
  let from: [number, number] | null = null;
  let to: [number, number] | null = null;
  for (let p = p1; p <= p2; p++) {
    layout.pages[p - 1].forEach((l, i) => {
      if (l[0] !== 't') return;
      for (const [idx, w] of l[1]) {
        if (idx === i1 && w === 0 && !from) from = [p, i + 1];
        if (idx === i2) to = [p, i + 1];
      }
    });
  }
  if (!from || !to) return null;
  // ab Ayah 1: mit Sura-Kopf und Basmala
  const start: [number, number] = a1 === 1 ? [p1, suraStartLine(ed, sura)] : from;
  return { fromPage: start[0], fromLine: start[1], toPage: (to as [number, number])[0], toLine: (to as [number, number])[1] };
}

/**
 * Neues lernen: Sura suchen und antippen. Danach lassen sich weitere Suren hinzufügen
 * oder – bei einer einzelnen Sura – nur bestimmte Ayat wählen.
 */
function NewPlanForm({ onDone }: { onDone: () => void }) {
  const { profile, today, update, toast } = useStore();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [part, setPart] = useState(false);
  const [a1, setA1] = useState(1);
  const [a2, setA2] = useState(1);
  const [perWeek, setPerWeek] = useState(1);
  const [wd, setWd] = useState(4);
  const [more, setMore] = useState(false);
  if (!profile) return null;
  const ed = profile.edition;
  const status = suraStatus(profile, today);
  const query = simple(q);
  // ohne Suche: die nächsten noch nicht auswendigen Suren von hinten als Vorschlag
  const hits = (query ? SURAS.filter((s) => String(s.n) === query || simple(s.tr).includes(query)) : [...SURAS].reverse().filter((s) => status[s.n - 1].state !== 'auswendig'))
    .filter((s) => !picked.includes(s.n))
    .slice(0, query ? 8 : 4);
  const single = picked.length === 1 ? SURAS[picked[0] - 1] : null;

  const add = (n: number) => {
    setPicked([...picked, n]);
    setQ('');
    setPart(false);
    setA1(1);
    setA2(SURAS[n - 1].ayahs);
  };

  const create = () => {
    const sorted = [...picked].sort((x, y) => x - y);
    const layout = cachedLayout(ed);
    if (single && part && (a1 > 1 || a2 < single.ayahs)) {
      const r = layout && ayahRange(layout, ed, single.n, a1, a2);
      if (!r) return toast('Die Seiten sind noch nicht geladen. Bitte gleich noch einmal.');
      update((p) => upsertPlan(p, { ...newPlan(r, perWeek, wd, today), title: `${single.tr} ${a1}–${a2}` }));
    } else {
      // aufeinanderfolgende Suren bilden einen Plan, getrennte je einen eigenen
      const groups: [number, number][] = [];
      for (const n of sorted) {
        const last = groups[groups.length - 1];
        if (last && last[1] === n - 1) last[1] = n;
        else groups.push([n, n]);
      }
      update((p) => groups.reduce((acc, [x, y]) => upsertPlan(acc, newPlan(suraRange(ed, x, y), perWeek, wd, today)), p));
    }
    onDone();
    setPicked([]);
  };

  return (
    <div className="stack plan-form">
      {picked.length > 0 && (
        <div className="picked">
          {picked.map((n) => (
            <span key={n}>
              {SURAS[n - 1].tr}
              <button type="button" aria-label={`${SURAS[n - 1].tr} entfernen`} onClick={() => setPicked(picked.filter((x) => x !== n))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div>
        <input
          id="plan-search"
          className="field search"
          inputMode="search"
          placeholder={picked.length ? 'Weitere Sura hinzufügen' : 'Sura suchen'}
          aria-label="Sura suchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(query || picked.length === 0) && (
          <div className="pick-list">
            {hits.map((s) => (
              <button key={s.n} type="button" onClick={() => add(s.n)}>
                <span className="num">{s.n}</span>
                <span className="name">{s.tr}</span>
                <span className="ar">{s.ar}</span>
                <Icon name="plus" />
              </button>
            ))}
            {query && hits.length === 0 && <p className="small">Keine Sura gefunden.</p>}
          </div>
        )}
      </div>
      {single && single.ayahs > 1 && (
        <div>
          {!part ? (
            <button type="button" className="link-btn" onClick={() => setPart(true)}>
              Nur bestimmte Ayat
            </button>
          ) : (
            <div className="range-row">
              <div>
                <label className="lbl" htmlFor="plan-a1">
                  Von Ayah
                </label>
                <select id="plan-a1" className="field" value={a1} onChange={(e) => (setA1(Number(e.target.value)), Number(e.target.value) > a2 && setA2(Number(e.target.value)))}>
                  {Array.from({ length: single.ayahs }, (_, i) => i + 1).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="plan-a2">
                  Bis Ayah
                </label>
                <select id="plan-a2" className="field" value={a2} onChange={(e) => (setA2(Number(e.target.value)), Number(e.target.value) < a1 && setA1(Number(e.target.value)))}>
                  {Array.from({ length: single.ayahs }, (_, i) => i + 1).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
      {picked.length > 0 && (
        <>
          <div>
            <label className="lbl">Seiten pro Woche</label>
            <div className="chips-row">
              {PER_WEEK_OPTIONS.map((n) => (
                <button key={n} type="button" aria-pressed={perWeek === n} onClick={() => setPerWeek(n)}>
                  {n === 0.5 ? '½' : n}
                </button>
              ))}
            </div>
          </div>
          {more ? (
            <div>
              <label className="lbl">Vortrag am</label>
              <div className="chips-row">
                {WEEK_ORDER.map((d) => (
                  <button key={d} type="button" aria-label={WEEKDAYS[d]} aria-pressed={wd === d} onClick={() => setWd(d)}>
                    {WEEKDAYS_SHORT[d]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setMore(true)}>
              Vortragstag: {WEEKDAYS[wd]}
            </button>
          )}
          <button type="button" className="btn primary block" onClick={create}>
            Lernen starten
          </button>
        </>
      )}
    </div>
  );
}

/** Lernplan anlegen oder ändern: Bereich (Suren oder Seiten), Tempo und Vortragstag. */
function PlanForm({ plan, onDone }: { plan?: LearnPlan; onDone: () => void }) {
  const { profile, today, update } = useStore();
  const ed = profile?.edition ?? '1405';
  // Vorschlag: eine Sura, die gerade gelernt wird, sonst von hinten die erste noch nicht auswendige
  const suggest = () => {
    if (profile?.learning?.length) return profile.learning[0];
    const st = profile ? suraStatus(profile, today) : [];
    return [...st].reverse().find((x) => x.state !== 'auswendig')?.sura ?? 114;
  };
  // bestehender Plan: genau die Suren, die er umfasst; sonst nach Seiten
  const exact = plan ? planSuras(ed, plan) : null;
  const [by, setBy] = useState<'sura' | 'pages'>(plan && !exact ? 'pages' : 'sura');
  const [s1, setS1] = useState(() => (plan ? (exact?.[0] ?? suraAt(ed, plan.fromPage)) : suggest()));
  const [s2, setS2] = useState(() => (plan ? (exact?.[1] ?? suraAt(ed, plan.toPage, true)) : suggest()));
  /** Bereich angefasst? Sonst bleibt er beim Speichern genau wie er war (auch mitten auf einer Seite). */
  const [rangeTouched, setRangeTouched] = useState(false);
  const [p1, setP1] = useState(plan?.fromPage ?? 1);
  const [p2, setP2] = useState(plan?.toPage ?? 1);
  const [perWeek, setPerWeek] = useState(plan?.perWeek ?? 1);
  const [wd, setWd] = useState(plan?.weekday ?? 4);
  const current = plan ? (weekLines(ed, plan, weekIndex(plan, today))[0]?.page ?? plan.toPage) : 0;
  const [page, setPage] = useState(current);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // schlicht: nur Sura und Tempo; alles Weitere erst auf Wunsch
  const [more, setMore] = useState(!!plan);
  if (!profile) return null;

  const save = () => {
    const picked = by === 'sura' ? suraRange(ed, s1, s2) : pageRange(ed, p1, p2);
    const range = plan && !rangeTouched ? { fromPage: plan.fromPage, fromLine: plan.fromLine, toPage: plan.toPage, toLine: plan.toLine } : picked;
    if (!plan) {
      update((p) => upsertPlan(p, newPlan(range, perWeek, wd, today)));
    } else {
      let next: LearnPlan = { ...plan, ...range };
      if (wd !== plan.weekday) next = setPlanWeekday(next, today, wd);
      if (perWeek !== plan.perWeek) next = setPlanPace(ed, next, today, perWeek);
      // „Diese Woche dran“ nur verschieben, wenn es geändert wurde oder nicht mehr im Bereich liegt
      if (rangeTouched || page !== current)
        next = setPlanPage(ed, next, today, Math.max(range.fromPage, Math.min(range.toPage + 1, page)));
      update((p) => upsertPlan(p, next));
    }
    onDone();
  };

  const suraSelect = (id: string, value: number, onChange: (n: number) => void) => (
    <select id={id} className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {SURAS.map((x) => (
        <option key={x.n} value={x.n}>
          {x.n}. {x.tr}
        </option>
      ))}
    </select>
  );

  return (
    <div className="stack plan-form">
      {!more ? (
        <div>
          <label className="lbl" htmlFor="plan-sura">
            Sura
          </label>
          {suraSelect('plan-sura', s1, (n) => {
            setS1(n);
            setS2(n);
            setBy('sura');
            setRangeTouched(true);
          })}
        </div>
      ) : (
        <>
      <Seg<'sura' | 'pages'>
        label="Bereich nach"
        value={by}
        onChange={(v) => {
          setBy(v);
          setRangeTouched(true);
        }}
        options={[
          { value: 'sura', label: 'Suren' },
          { value: 'pages', label: 'Seiten' },
        ]}
      />
      {by === 'sura' ? (
        <div className="range-row">
          <div>
            <label className="lbl" htmlFor="plan-s1">
              Von
            </label>
            {suraSelect('plan-s1', s1, (n) => {
              setS1(n);
              setRangeTouched(true);
              if (n > s2) setS2(n);
            })}
          </div>
          <div>
            <label className="lbl" htmlFor="plan-s2">
              Bis
            </label>
            {suraSelect('plan-s2', s2, (n) => {
              setS2(n);
              setRangeTouched(true);
              if (n < s1) setS1(n);
            })}
          </div>
        </div>
      ) : (
        <div className="range-row">
          <div>
            <label className="lbl">Von Seite</label>
            <Stepper value={p1} min={1} max={PAGE_COUNT} label="Von Seite" onChange={(v) => (setP1(v), setRangeTouched(true), v > p2 && setP2(v))} />
          </div>
          <div>
            <label className="lbl">Bis Seite</label>
            <Stepper value={p2} min={1} max={PAGE_COUNT} label="Bis Seite" onChange={(v) => (setP2(v), setRangeTouched(true), v < p1 && setP1(v))} />
          </div>
        </div>
      )}
        </>
      )}
      <div>
        <label className="lbl">Seiten pro Woche</label>
        <div className="chips-row">
          {PER_WEEK_OPTIONS.map((n) => (
            <button key={n} type="button" aria-pressed={perWeek === n} onClick={() => setPerWeek(n)}>
              {n === 0.5 ? '½' : n}
            </button>
          ))}
        </div>
      </div>
      {more && (
        <>
      <div>
        <label className="lbl">Vortrag am</label>
        <div className="chips-row">
          {WEEK_ORDER.map((d) => (
            <button key={d} type="button" aria-label={WEEKDAYS[d]} aria-pressed={wd === d} onClick={() => setWd(d)}>
              {WEEKDAYS_SHORT[d]}
            </button>
          ))}
        </div>
      </div>
      {plan && (
        <div>
          <label className="lbl">Diese Woche dran: Seite</label>
          <Stepper value={page} min={plan.fromPage} max={plan.toPage + 1} label="Aktuelle Seite" onChange={setPage} />
        </div>
      )}
        </>
      )}
      {!more && (
        <button type="button" className="link-btn" onClick={() => setMore(true)}>
          Mehr Optionen (mehrere Suren, Seiten, Vortragstag)
        </button>
      )}
      <button type="button" className="btn primary block" onClick={save}>
        {plan ? 'Speichern' : 'Plan erstellen'}
      </button>
      {plan && (
        <button type="button" className="btn block danger" onClick={() => setConfirmDelete(true)}>
          Plan löschen
        </button>
      )}
      {plan && confirmDelete && (
        <Confirm
          title="Lernplan löschen?"
          text="Was du bis jetzt gelernt hast, bleibt in der Wiederholung."
          confirmLabel="Löschen"
          danger
          onConfirm={() => {
            update((p) => removePlan(p, plan.id, today));
            setConfirmDelete(false);
            onDone();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/** Sura, die auf einer Seite beginnt (bzw. endet). */
function suraAt(ed: EditionId, page: number, last = false): number {
  const hit = SURAS.filter((s) => {
    const [a, b] = suraPages(ed, s.n);
    return page >= a && page <= b;
  });
  return (last ? hit[hit.length - 1] : hit[0])?.n ?? 1;
}
