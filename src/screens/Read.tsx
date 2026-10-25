import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ayahKey, useMushafData, type LineData, type TextData } from '../data/quranData';
import { JUZ_COUNT, PAGE_COUNT, SURAS, juzPages, pageJuz, pageRangeLabel, suraPages, type EditionId } from '../logic/quran';
import { useStore } from '../store';
import { Icon, Sheet } from '../ui';
import type { ReadTarget } from './Today';

const FONT = '"KFGQPC Hafs"';
const GAP_EM = 0.2;
const MAX_FS = 30;
const MIN_FS = 14;

const lastPageKey = (id: string) => `hifz:lastPage:${id}`;

function readLastPage(id: string): number {
  try {
    return Number(localStorage.getItem(lastPageKey(id))) || 1;
  } catch {
    return 1;
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
function wordWidth(w: string): number {
  let v = widthCache.get(w);
  if (v === undefined) {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (!measureCtx) return w.length * 50;
    measureCtx.font = `100px ${FONT}`;
    v = measureCtx.measureText(w).width;
    widthCache.set(w, v);
  }
  return v;
}

function lineWords(line: LineData, text: TextData): string[] {
  if (line[0] !== 't') return [];
  return line[1].flatMap(([idx, from, to]) => text.ayahs[idx].slice(from, to));
}

/** Größte Schriftgröße, bei der jede Zeile der Seite in die Breite passt. */
function fitFontSize(lines: LineData[], text: TextData, width: number): number {
  // Obergrenze relativ zur Breite, damit locker gesetzte Seiten nicht sprunghaft größer werden
  let fs = Math.min(MAX_FS, width * 0.057);
  for (const line of lines) {
    if (line[0] !== 't') continue;
    const words = lineWords(line, text);
    const natural = words.reduce((s, w) => s + wordWidth(w), 0) + (words.length - 1) * GAP_EM * 100;
    const avail = width * (line[2] ?? 1);
    fs = Math.min(fs, (avail / natural) * 100);
  }
  return Math.max(MIN_FS, Math.floor(fs * 10) / 10);
}

function audioUrl(sura: number, aya: number): string {
  const p = (n: number) => String(n).padStart(3, '0');
  return `https://everyayah.com/data/Husary_128kbps/${p(sura)}${p(aya)}.mp3`;
}

/** Ajat der Seite in Lesereihenfolge; -1 steht für die Basmala vor einer Sura. */
function pagePlaylist(lines: LineData[]): number[] {
  const out: number[] = [];
  for (const line of lines) {
    if (line[0] === 'b') out.push(-1);
    if (line[0] === 't') for (const [idx] of line[1]) if (!out.includes(idx)) out.push(idx);
  }
  return out;
}

export function Read({ target, onTargetUsed }: { target: ReadTarget | null; onTargetUsed: () => void }) {
  const { profile, toast } = useStore();
  const ed: EditionId = profile?.edition ?? '1405';
  const data = useMushafData(ed);
  const [page, setPageState] = useState(() => target?.page ?? (profile ? readLastPage(profile.id) : 1));
  const [hl, setHl] = useState<{ from?: number; to?: number; start?: number } | null>(null);
  const [hifz, setHifz] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [jump, setJump] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null); // Index in der Playlist
  const audio = useRef<HTMLAudioElement | null>(null);

  const setPage = useCallback(
    (p: number) => {
      const n = Math.max(1, Math.min(PAGE_COUNT, p));
      setPageState(n);
      setHl(null);
      setRevealed(0);
      if (profile) {
        try {
          localStorage.setItem(lastPageKey(profile.id), String(n));
        } catch {
          /* egal */
        }
      }
    },
    [profile],
  );

  // Sprungziel aus „Heute“ oder „Fortschritt“
  useEffect(() => {
    if (!target) return;
    setPage(target.page);
    setHl({ from: target.from, to: target.to, start: target.startLine });
    if (target.startLine) setHifz(true);
    onTargetUsed();
  }, [target, setPage, onTargetUsed]);

  const lines = data && data !== 'error' ? data.layout.pages[page - 1] : null;
  const text = data && data !== 'error' ? data.text : null;
  const playlist = useMemo(() => (lines ? pagePlaylist(lines) : []), [lines]);

  // ---------- Audio ----------
  const stopAudio = useCallback(() => {
    audio.current?.pause();
    setPlaying(null);
  }, []);

  useEffect(() => stopAudio, [page, stopAudio]);

  const playAt = useCallback(
    (i: number) => {
      if (i >= playlist.length) {
        setPlaying(null);
        return;
      }
      const idx = playlist[i];
      const [s, a] = idx === -1 ? [1, 1] : ayahKey(idx);
      audio.current ??= new Audio();
      const el = audio.current;
      el.src = audioUrl(s, a);
      el.onended = () => playAt(i + 1);
      el.onerror = () => {
        setPlaying(null);
        toast('Audio nicht erreichbar – bist du online?');
      };
      setPlaying(i);
      el.play().catch(() => setPlaying(null));
    },
    [playlist, toast],
  );

  const playingAyah = playing !== null ? playlist[playing] : null;

  // ---------- Schriftgröße ----------
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fontReady, setFontReady] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [lines]);
  useEffect(() => {
    document.fonts.load(`100px ${FONT}`).then(() => {
      widthCache.clear();
      setFontReady(true);
    });
  }, []);
  // Seitenrand: 22 px Zeilennummer + Innenabstand
  const textWidth = Math.max(0, width - 22 - 14);
  const fs = useMemo(
    () => (lines && text && fontReady && textWidth ? fitFontSize(lines, text, textWidth) : 20),
    [lines, text, fontReady, textWidth],
  );

  // ---------- Hifz-Modus ----------
  const coverFrom = hl?.start ?? 1;
  const coverable = lines
    ? lines.map((l, i) => (l[0] === 't' && i + 1 >= coverFrom ? i + 1 : 0)).filter(Boolean)
    : [];
  const hiddenSet = new Set(hifz ? coverable.slice(revealed) : []);
  const revealNext = () => setRevealed((r) => Math.min(coverable.length, r + 1));

  // ---------- Wischen ----------
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean; moved: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: false, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.3) d.active = true;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) d.moved = true;
    if (d.active) {
      d.dx = mx;
      setDx(mx);
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDx(0);
    if (!d) return;
    // Wie im gedruckten Mushaf: nach rechts ziehen = weiterblättern
    if (d.active && d.dx > 70 && page < PAGE_COUNT) setPage(page + 1);
    else if (d.active && d.dx < -70 && page > 1) setPage(page - 1);
    else if (!d.moved && hifz) revealNext();
  };

  if (!profile) return null;
  const juz = pageJuz(ed, page);

  return (
    <div>
      <div className="reader-bar">
        <div className="info">
          <b>Seite {page}</b>
          <div>
            {pageRangeLabel(ed, page)} · Juz {juz}
          </div>
        </div>
        <button type="button" className="iconbtn" aria-label="Springen zu Seite, Sura oder Juz" onClick={() => setJump(true)}>
          <Icon name="jump" />
        </button>
        <button
          type="button"
          className="iconbtn"
          aria-pressed={hifz}
          aria-label="Hifz-Modus: Zeilen verdecken"
          onClick={() => {
            setHifz(!hifz);
            setRevealed(0);
          }}
        >
          <Icon name="eye" />
        </button>
        <button
          type="button"
          className="iconbtn"
          aria-pressed={playing !== null}
          aria-label={playing !== null ? 'Audio anhalten' : 'Seite anhören (al-Ḥuṣarī)'}
          onClick={() => (playing !== null ? stopAudio() : playAt(0))}
          disabled={!lines}
        >
          <Icon name={playing !== null ? 'pause' : 'play'} />
        </button>
      </div>

      <div
        className="mushaf-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="mushaf"
          ref={box}
          style={{
            transform: dx ? `translateX(${dx * 0.6}px)` : undefined,
            transition: dx ? 'none' : 'transform 0.2s ease-out',
            fontSize: fs,
          }}
          aria-label={`Mushaf Seite ${page}`}
        >
          {data === null && <div className="empty">Seite wird geladen …</div>}
          {data === 'error' && <div className="empty">Die Quran-Daten konnten nicht geladen werden. Bitte einmal mit Internet öffnen.</div>}
          {lines &&
            text &&
            lines.map((line, i) => {
              const n = i + 1;
              const isHl = hl?.from !== undefined && hl.to !== undefined && n >= hl.from && n <= hl.to;
              const hidden = hiddenSet.has(n);
              const cls = ['mline', isHl ? 'hl' : '', hl?.start === n ? 'start' : '', hidden ? 'hidden' : '', line[0] === 'h' ? 'sura-head' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <div key={n} className={cls} style={{ minHeight: `${fs * 1.9}px` }}>
                  <span className="lno" aria-label={`Zeile ${n}`}>
                    {n}
                  </span>
                  <div className="mtext">
                    {line[0] === 'h' && (
                      <div className="sura-frame" style={{ fontSize: fs * 1.05 }}>
                        {SURAS[line[1] - 1].ar}
                      </div>
                    )}
                    {line[0] === 'b' && (
                      <div className={`words${playingAyah === -1 ? ' playing' : ''}`} style={{ justifyContent: 'center', gap: `${GAP_EM * 2}em` }}>
                        {text.basmala.map((w, k) => (
                          <span key={k} className={`w${playingAyah === -1 ? ' playing' : ''}`}>
                            {w}
                          </span>
                        ))}
                      </div>
                    )}
                    {line[0] === 't' && (
                      <div className="words" style={line[2] ? { width: `${line[2] * 100}%`, gap: `${GAP_EM}em` } : { gap: `${GAP_EM}em` }}>
                        {line[1].flatMap(([idx, from, to]) =>
                          text.ayahs[idx].slice(from, to).map((w, k) => (
                            <span key={`${idx}-${from + k}`} className={`w${playingAyah === idx ? ' playing' : ''}`}>
                              {w}
                            </span>
                          )),
                        )}
                      </div>
                    )}
                  </div>
                  {hidden && <div className="cover" aria-hidden="true" />}
                </div>
              );
            })}
        </div>
      </div>

      {hifz && (
        <div className="hifz-bar">
          <button type="button" className="btn primary" onClick={revealNext} disabled={revealed >= coverable.length}>
            Nächste Zeile
          </button>
          <button type="button" className="btn" onClick={() => setRevealed(revealed >= coverable.length ? 0 : coverable.length)}>
            {revealed >= coverable.length ? 'Neu verdecken' : 'Alles zeigen'}
          </button>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={page >= PAGE_COUNT} onClick={() => setPage(page + 1)}>
          <Icon name="next" /> Weiter
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Zurück <Icon name="prev" />
        </button>
      </div>
      <p className="small" style={{ textAlign: 'center' }}>
        Wischen wie im Mushaf: nach rechts weiter, nach links zurück.
        {hifz ? ' Im Hifz-Modus deckt ein Tipp auf die Seite die nächste Zeile auf.' : ''}
      </p>

      {jump && (
        <JumpSheet
          edition={ed}
          onClose={() => setJump(false)}
          onGo={(p) => {
            setPage(p);
            setJump(false);
          }}
        />
      )}
    </div>
  );
}

function JumpSheet({ edition, onClose, onGo }: { edition: EditionId; onClose: () => void; onGo: (p: number) => void }) {
  const [pageText, setPageText] = useState('');
  const p = Number(pageText);
  const valid = p >= 1 && p <= PAGE_COUNT;
  return (
    <Sheet title="Springen" onClose={onClose}>
      <div className="stack">
        <div>
          <label className="lbl" htmlFor="jump-page">
            Seite (1–604)
          </label>
          <div className="row">
            <input
              id="jump-page"
              className="field"
              inputMode="numeric"
              value={pageText}
              onChange={(e) => setPageText(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && valid && onGo(p)}
            />
            <button type="button" className="btn primary" disabled={!valid} onClick={() => onGo(p)}>
              Los
            </button>
          </div>
        </div>
        <div>
          <label className="lbl" htmlFor="jump-sura">
            Sura
          </label>
          <select id="jump-sura" className="field" value="" onChange={(e) => onGo(suraPages(edition, Number(e.target.value))[0])}>
            <option value="" disabled>
              Sura wählen …
            </option>
            {SURAS.map((s) => (
              <option key={s.n} value={s.n}>
                {s.n}. {s.tr} (S. {suraPages(edition, s.n)[0]})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="jump-juz">
            Juz
          </label>
          <select id="jump-juz" className="field" value="" onChange={(e) => onGo(juzPages(edition, Number(e.target.value))[0])}>
            <option value="" disabled>
              Juz wählen …
            </option>
            {Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((j) => (
              <option key={j} value={j}>
                Juz {j} (S. {juzPages(edition, j)[0]})
              </option>
            ))}
          </select>
        </div>
      </div>
    </Sheet>
  );
}
