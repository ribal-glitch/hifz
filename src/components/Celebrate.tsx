import { useEffect, useMemo, useRef } from 'react';

const COLORS = ['#e4572e', '#f3a712', '#29a36a', '#2c5b8c', '#a23b72', '#f2c14e', '#4ea5d9'];

/** Konfetti-Regen über dem ganzen Bildschirm (rein dekorativ). */
export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.2 + Math.random() * 1.6,
        rot: Math.random() * 360,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.w * 1.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** Kurze Erfolgs-Einblendung mit großem Emoji und Konfetti; schließt sich von selbst. */
export function Celebration({ emoji = '🎉', title, sub, onDone }: { emoji?: string; title: string; sub?: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), 2600);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="celebration" role="status" onClick={onDone}>
      <Confetti />
      <div className="celebration-card">
        <div className="celebration-emoji">{emoji}</div>
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}
