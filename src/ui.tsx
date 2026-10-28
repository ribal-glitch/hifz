import { useEffect, useRef, useState, type ReactNode } from 'react';
import { initials } from './logic/profile';

export function Icon({
  name,
}: {
  name:
    | 'today'
    | 'progress'
    | 'read'
    | 'settings'
    | 'eye'
    | 'play'
    | 'pause'
    | 'stop'
    | 'jump'
    | 'prev'
    | 'next'
    | 'copy'
    | 'plus'
    | 'chevron'
    | 'list'
    | 'tajweed'
    | 'translate'
    | 'learn'
    | 'repeat'
    | 'info'
    | 'check'
    | 'cross'
    | 'shaky'
    | 'reveal'
    | 'revealAll'
    | 'edit'
    | 'close'
    | 'quiz'
    | 'trash';
}) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'today':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" {...p} />
          <path d="M8 3v4M16 3v4M3.5 10h17M8.5 15l2.2 2.2 4.8-4.7" {...p} />
        </svg>
      );
    case 'progress':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" {...p} />
          <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5H12z" {...p} fill="currentColor" fillOpacity="0.25" />
        </svg>
      );
    case 'read':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 6.5C10 5 7 4.5 3.5 5v13.5C7 18 10 18.5 12 20c2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5V20" {...p} />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...p} />
          <circle cx="16" cy="7" r="2.2" {...p} />
          <circle cx="10" cy="17" r="2.2" {...p} />
        </svg>
      );
    case 'eye':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...p} />
          <path d="M4 20 20 4" {...p} />
        </svg>
      );
    case 'play':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" {...p} fill="currentColor" />
        </svg>
      );
    case 'pause':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 5.5v13M15.5 5.5v13" {...p} strokeWidth={3} />
        </svg>
      );
    case 'list':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11" {...p} />
          <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
          <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'tajweed':
      // Farbpalette mit drei Punkten
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9 0-1.4-1.2-1.8-1.2-3 0-1 .8-1.6 1.9-1.6h2.1a3.7 3.7 0 0 0 3.7-3.7C20.5 6.6 16.7 3.5 12 3.5z" {...p} />
          <circle cx="8" cy="10" r="1.3" fill="currentColor" />
          <circle cx="11.5" cy="7.3" r="1.3" fill="currentColor" />
          <circle cx="15.5" cy="8.6" r="1.3" fill="currentColor" />
        </svg>
      );
    case 'translate':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 5.5h9M8 3.5v2M5.5 5.5c.8 3.4 3.2 6 6.5 7.5M10.5 5.5c-.8 3.4-3.2 6-6.5 7.5" {...p} />
          <path d="m12.5 20.5 4-9 4 9M14 17.5h5" {...p} />
        </svg>
      );
    case 'learn':
      // aufgeschlagenes Buch mit Stift
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 6.5C10 5 7 4.5 3.5 5v13.5C7 18 10 18.5 12 20V6.5z" {...p} />
          <path d="m15 17 5.5-9.5 1.8 1-5.5 9.5-2.2 1z" {...p} />
        </svg>
      );
    case 'repeat':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19m0 0-3-3m3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5m0 0 3 3m-3-3 3-3" {...p} />
        </svg>
      );
    case 'stop':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" {...p} fill="currentColor" />
        </svg>
      );
    case 'jump':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" {...p} />
          <path d="m16 16 4.5 4.5" {...p} />
        </svg>
      );
    case 'prev':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" {...p} />
        </svg>
      );
    case 'next':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 5-7 7 7 7" {...p} />
        </svg>
      );
    case 'copy':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2.5" {...p} />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...p} />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" {...p} />
        </svg>
      );
    case 'info':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" {...p} />
          <path d="M12 11v5.5M12 7.6v.2" {...p} />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 10 17.5 19 7" {...p} strokeWidth={2.4} />
        </svg>
      );
    case 'cross':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...p} strokeWidth={2.4} />
        </svg>
      );
    case 'shaky':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 12c2-3.2 3.6-3.2 5.6 0s3.6 3.2 5.6 0 3.6-3.2 5.8 0" {...p} strokeWidth={2.4} />
        </svg>
      );
    case 'reveal':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...p} />
          <circle cx="12" cy="12" r="3" {...p} />
        </svg>
      );
    case 'revealAll':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" {...p} />
          <path d="M8 8h8M8 12h8M8 16h5" {...p} />
        </svg>
      );
    case 'edit':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" {...p} />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" {...p} />
        </svg>
      );
    case 'quiz':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" {...p} />
          <path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8M12 16.6v.2" {...p} />
        </svg>
      );
    case 'trash':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" {...p} />
        </svg>
      );
    case 'chevron':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          <path d="m6 9 6 6 6-6" {...p} />
        </svg>
      );
  }
}

/** Runder Abhak-Knopf; das Häkchen zeichnet sich beim Abhaken ein. */
export function Check({
  on,
  onToggle,
  label,
  small,
}: {
  on: boolean;
  onToggle?: () => void;
  label: string;
  small?: boolean;
}) {
  const wasOn = useRef(on);
  const animate = on && !wasOn.current;
  useEffect(() => {
    wasOn.current = on;
  }, [on]);
  return (
    <button
      type="button"
      className={`check${on ? ' on' : ''}${on && !animate ? ' static' : ''}${animate ? ' pop' : ''}${small ? ' sm' : ''}`}
      aria-pressed={on}
      aria-label={label}
      onClick={onToggle}
      disabled={!onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 12.5 10 17l8.5-9" />
      </svg>
    </button>
  );
}

export function Ring({
  value,
  size,
  stroke,
  children,
  label,
}: {
  value: number;
  size: number;
  stroke: number;
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="ring-wrap" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-val"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.45 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <div className="stack">
        <div>{text}</div>
        <button type="button" className={`btn block ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button type="button" className="btn block" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        )}
        <button type="button" className="btn block" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </Sheet>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ein-/Aus-Schalter mit Beschriftung, z. B. in der Schalter-Leiste beim Lesen. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="label">{label}</span>
    </button>
  );
}

/** Zahleneingabe mit −/+; Änderungen werden erst beim Verlassen des Felds übernommen. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  const commit = (v: number) => {
    const n = Math.max(min, Math.min(max, Math.round(v)));
    setText(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <div className="stepper">
      <button type="button" className="iconbtn" aria-label={`${label} verringern`} onClick={() => commit(value - 1)}>
        −
      </button>
      <input
        className="field"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
        onBlur={() => commit(Number(text) || value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{ maxWidth: 110 }}
      />
      <button type="button" className="iconbtn" aria-label={`${label} erhöhen`} onClick={() => commit(value + 1)}>
        +
      </button>
    </div>
  );
}
