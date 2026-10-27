import { useState, type ReactNode } from 'react';
import { ayahsForLines, listenUrl, useAudio } from '../audio';
import { cachedLayout } from '../data/quranData';
import type { Segment } from '../logic/learn';
import { toggleStep } from '../logic/plan';
import { IS_ARTIFACT } from '../platform';
import { useStore } from '../store';
import { Check, Icon } from '../ui';
import { CoveredPage } from './CoveredPage';

/** Karte mit Nummer bzw. Haken links und einklappbarem Inhalt. */
export function Step({
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
  kicker?: string;
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
  const node = done ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pop">
      <path d="M5.5 12.5 10 17l8.5-9" />
    </svg>
  ) : (
    n
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
          {kicker && <div className="step-kicker">{kicker}</div>}
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

/** Abschnitt mit Überschrift, der erst beim Antippen aufklappt. */
export function Fold({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fold">
      <button type="button" className="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h2 className="section-title">{title}</h2>
        <span className={`chev${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <>
          {intro && (
            <p className="small" style={{ margin: '-4px 0 10px' }}>
              {intro}
            </p>
          )}
          {children}
        </>
      )}
    </section>
  );
}

/** Was ein Lernschritt direkt darunter öffnet: Text zum Anhören, zum Lesen oder verdeckt zum Aufsagen. */
export interface InlineView {
  mode: 'listen' | 'read' | 'cover';
  segs: Segment[];
  repeatEach?: number;
}

export interface MethodItem {
  /** Kennung zum Abhaken, eindeutig für den Tag */
  id: string;
  what: ReactNode;
  detail?: string;
  views: InlineView[];
}

const VIEW_LABEL = { listen: 'Hören', read: 'Lesen', cover: 'Prüfen' } as const;
const VIEW_ICON = { listen: 'play', read: 'read', cover: 'reveal' } as const;

/**
 * Liste von Lernschritten: jeder lässt sich abhaken, Hören, Lesen und Prüfen öffnen den Text
 * direkt unter dem Schritt, damit man in „Lernen“ bleibt.
 */
export function MethodList({ items, onAllDone, stacked }: { items: MethodItem[]; onAllDone?: () => void; stacked?: boolean }) {
  const { profile, today, update } = useStore();
  const audio = useAudio();
  const [open, setOpen] = useState<string | null>(null);
  if (!profile) return null;
  const done = new Set(profile.days[today]?.steps ?? []);
  const ed = profile.edition;

  const openView = (key: string, v: InlineView, isOpen: boolean) => {
    if (v.mode === 'listen') {
      const first = v.segs[0];
      if (isOpen) audio.stop();
      else if (IS_ARTIFACT) {
        // in claude.ai spielt quran.com; der Text erscheint trotzdem hier
        window.open(listenUrl(ed, first.page, first.from, v.segs[v.segs.length - 1].to), '_blank', 'noopener');
      } else {
        const layout = cachedLayout(ed);
        const ayahs = layout ? v.segs.flatMap((s) => ayahsForLines(layout, s.page, s.from, s.to)) : undefined;
        void audio.play({ edition: ed, page: first.page, from: first.from, to: first.to, ayahs, repeatEach: v.repeatEach });
      }
    }
    setOpen(isOpen ? null : key);
  };
  const toggle = (id: string) => {
    const nowDone = !done.has(id);
    update((p) => toggleStep(p, today, id));
    if (nowDone && onAllDone && items.every((it) => it.id === id || done.has(it.id))) onAllDone();
  };

  return (
    <div className="panel">
      <ol className="method">
        {items.map((it) => {
          const openIdx = it.views.findIndex((_, i) => open === `${it.id}#${i}`);
          const view = openIdx >= 0 ? it.views[openIdx] : null;
          const cls = [done.has(it.id) ? 'done' : '', stacked ? 'stacked' : ''].filter(Boolean).join(' ');
          return (
            <li key={it.id} className={cls || undefined}>
              <div className="what">
                {it.what}
                {it.detail && <small>{it.detail}</small>}
              </div>
              <div className="method-actions">
                {it.views.map((v, i) => {
                  const key = `${it.id}#${i}`;
                  const isOpen = open === key;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`btn${isOpen ? ' on' : ''}`}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Schließen' : VIEW_LABEL[v.mode]}
                      title={VIEW_LABEL[v.mode]}
                      onClick={() => openView(key, v, isOpen)}
                    >
                      <Icon name={isOpen ? (v.mode === 'listen' ? 'stop' : 'close') : VIEW_ICON[v.mode]} />
                    </button>
                  );
                })}
              </div>
              <Check small on={done.has(it.id)} onToggle={() => toggle(it.id)} label={`${typeof it.what === 'string' ? it.what : 'Schritt'} erledigt`} />
              {view && (
                <div className="method-inline">
                  {view.segs.map((s) =>
                    view.mode === 'cover' ? (
                      <CoveredPage key={`c-${s.page}-${s.from}`} edition={ed} page={s.page} from={s.from} />
                    ) : (
                      <CoveredPage
                        key={`${view.mode}-${s.page}`}
                        edition={ed}
                        page={s.page}
                        read={view.mode === 'read'}
                        listen={view.mode === 'listen'}
                        hl={[s.from, s.to]}
                      />
                    ),
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
