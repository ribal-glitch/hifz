import { useState } from 'react';
import { ayahRangeLabel, ayahsForLines } from '../audio';
import { MethodList, type MethodItem } from '../components/Steps';
import { cachedLayout, useLayoutReady } from '../data/quranData';
import { addDays, formatLong, WEEKDAYS, WEEKDAYS_SHORT } from '../logic/dates';
import {
  PER_WEEK_OPTIONS,
  newPlan,
  pageRange,
  planFinished,
  planProgress,
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
import { PAGE_COUNT, SURAS, suraPages, type EditionId } from '../logic/quran';
import { suraStatus } from '../logic/stats';
import { useStore } from '../store';
import { Confirm, Icon, Seg, Sheet, Stepper } from '../ui';
import { WEEK_ORDER } from './Onboarding';

const paceLabel = (n: number) => (n === 0.5 ? '½ Seite' : n === 1 ? '1 Seite' : `${n} Seiten`);

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
    const items: MethodItem[] = [
      { id: `${id}:listen`, what: 'Anhören', views: [{ mode: 'listen', segs: task.segs }] },
      { id: `${id}:read`, what: 'Lesen', detail: 'ca. 10× laut', views: [{ mode: 'read', segs: task.segs }] },
      { id: `${id}:recite`, what: 'Auswendig', views: [{ mode: 'cover', segs: task.segs }] },
    ];
    if (task.day > 0)
      items.push({ id: `${id}:connect`, what: 'Verbinden', detail: 'mit den Tagen davor', views: [{ mode: 'cover', segs: upTo(task.week, task.segs[task.segs.length - 1]) }] });
    return items;
  }
  if (task.kind === 'rehearsal')
    return [
      { id: `${id}:listen`, what: 'Ganze Woche anhören', views: [{ mode: 'listen', segs: task.week, repeatEach: 1 }] },
      { id: `${id}:rehearse`, what: 'Probevortrag', detail: '3× fehlerfrei', views: [{ mode: 'cover', segs: task.week }] },
    ];
  return [{ id: `${id}:lecture`, what: 'Vortrag', views: [{ mode: 'cover', segs: task.week }] }];
}

const KIND_LABEL = { portion: 'Heute', rehearsal: 'Probevortrag', lecture: 'Vortrag' } as const;

/** „Lernen“: die Lernpläne mit der heutigen Portion; neue Pläne anlegen, fertige weglegen. */
export function Learn() {
  const { profile, today } = useStore();
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
          {active.length === 0 ? 'Was möchtest du lernen?' : tasks.length && doneCount === tasks.length ? 'Heute gelernt' : 'Heute lernen'}
        </div>
      </header>

      {active.length === 0 ? (
        <PlanForm onDone={() => setEditing(null)} />
      ) : (
        <>
          {active.map((p) => (
            <PlanCard key={p.id} plan={p} onEdit={() => setEditing(p)} />
          ))}
          <button type="button" className="btn block" style={{ marginTop: 6 }} onClick={() => setEditing('new')}>
            <Icon name="plus" /> Weiteren Lernplan
          </button>
        </>
      )}

      {archived.length > 0 && (
        <div className="archived" aria-label="Fertig gelernt">
          {archived.map((p) => (
            <span key={p.id}>✓ {planTitle(profile.edition, p)}</span>
          ))}
        </div>
      )}

      {editing && (
        <Sheet title={editing === 'new' ? 'Neuer Lernplan' : 'Lernplan ändern'} onClose={() => setEditing(null)}>
          <PlanForm plan={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </div>
  );
}

function PlanCard({ plan, onEdit }: { plan: LearnPlan; onEdit: () => void }) {
  const { profile, today, update } = useStore();
  if (!profile) return null;
  const ed = profile.edition;
  const task = planTask(ed, plan, today);
  const prog = planProgress(ed, plan, today);
  const finished = planFinished(ed, plan, today);
  const done = taskDone(profile, today, plan.id);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const notStarted = !task && !finished;

  return (
    <section className={`plan-card${done ? ' is-done' : ''}`}>
      <div className="plan-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="plan-title">{planTitle(ed, plan)}</h2>
          <div className="plan-meta">
            {paceLabel(plan.perWeek)} pro Woche · Vortrag {WEEKDAYS_SHORT[plan.weekday]}
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
        <div className="plan-finished">
          <span className="emoji" aria-hidden="true">
            🎉
          </span>
          <b>Fertig gelernt!</b>
          <button type="button" className="btn primary block" onClick={() => update((p) => archivePlan(p, plan.id))}>
            In die Wiederholung
          </button>
        </div>
      )}

      {notStarted && <p className="small">Beginnt am {formatLong(addDays(plan.start, 0))}.</p>}

      {task && (
        <>
          <div className="today-chip">
            <b>{KIND_LABEL[task.kind]}</b> {segLabel(ed, task.kind === 'portion' ? task.segs : task.week)}
          </div>
          <MethodList items={stepsFor(task)} onAllDone={() => update((p) => setTaskDone(p, today, plan.id, true))} />
          <WeekStrip plan={plan} />
          {done ? (
            <div className="done-line pop" role="status">
              <Icon name="check" /> Heute geschafft
            </div>
          ) : (
            <button type="button" className="btn primary block mark-done" onClick={() => update((p) => setTaskDone(p, today, plan.id, true))}>
              <Icon name="check" /> {task.kind === 'lecture' ? 'Vortrag gehalten' : 'Sitzt'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Die sieben Tage der Lernwoche als farbige Punkte. */
function WeekStrip({ plan }: { plan: LearnPlan }) {
  const { profile, today } = useStore();
  if (!profile) return null;
  const startOfWeek = addDays(plan.start, 7 * weekIndex(plan, today));
  return (
    <div className="weekdots" aria-label="Lernwoche">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(startOfWeek, i);
        const state = taskDone(profile, d, plan.id) ? 'done' : d === today ? 'now' : d < today ? 'missed' : '';
        return (
          <div key={d} className={state}>
            <i>{state === 'done' ? '✓' : i === 5 ? 'P' : i === 6 ? 'V' : ''}</i>
            <span>{WEEKDAYS_SHORT[(plan.weekday + 1 + i) % 7]}</span>
          </div>
        );
      })}
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
  const [by, setBy] = useState<'sura' | 'pages'>('sura');
  const [s1, setS1] = useState(() => (plan ? suraAt(ed, plan.fromPage) : suggest()));
  const [s2, setS2] = useState(() => (plan ? suraAt(ed, plan.toPage, true) : suggest()));
  const [p1, setP1] = useState(plan?.fromPage ?? 1);
  const [p2, setP2] = useState(plan?.toPage ?? 1);
  const [perWeek, setPerWeek] = useState(plan?.perWeek ?? 1);
  const [wd, setWd] = useState(plan?.weekday ?? 4);
  const current = plan ? (weekLines(ed, plan, weekIndex(plan, today))[0]?.page ?? plan.toPage) : 0;
  const [page, setPage] = useState(current);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!profile) return null;

  const save = () => {
    const range = by === 'sura' ? suraRange(ed, s1, s2) : pageRange(ed, p1, p2);
    if (!plan) {
      update((p) => upsertPlan(p, newPlan(range, perWeek, wd, today)));
    } else {
      let next: LearnPlan = { ...plan, ...range };
      if (wd !== plan.weekday) next = setPlanWeekday(next, today, wd);
      if (perWeek !== plan.perWeek) next = setPlanPace(ed, next, today, perWeek);
      next = setPlanPage(ed, next, today, page);
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
      <Seg<'sura' | 'pages'>
        label="Bereich nach"
        value={by}
        onChange={setBy}
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
              if (n > s2) setS2(n);
            })}
          </div>
          <div>
            <label className="lbl" htmlFor="plan-s2">
              Bis
            </label>
            {suraSelect('plan-s2', s2, (n) => {
              setS2(n);
              if (n < s1) setS1(n);
            })}
          </div>
        </div>
      ) : (
        <div className="range-row">
          <div>
            <label className="lbl">Von Seite</label>
            <Stepper value={p1} min={1} max={PAGE_COUNT} label="Von Seite" onChange={(v) => (setP1(v), v > p2 && setP2(v))} />
          </div>
          <div>
            <label className="lbl">Bis Seite</label>
            <Stepper value={p2} min={1} max={PAGE_COUNT} label="Bis Seite" onChange={(v) => (setP2(v), v < p1 && setP1(v))} />
          </div>
        </div>
      )}
      <div>
        <label className="lbl">Pro Woche</label>
        <div className="chips-row">
          {PER_WEEK_OPTIONS.map((n) => (
            <button key={n} type="button" aria-pressed={perWeek === n} onClick={() => setPerWeek(n)}>
              {n === 0.5 ? '½' : n}
            </button>
          ))}
        </div>
      </div>
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
