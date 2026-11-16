import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ayahKey, useMushafData, type LayoutData, type LineData, type TextData } from '../data/quranData';
import { effectiveBestand, logFreeReview } from '../logic/plan';
import type { Rating } from '../logic/profile';
import { SURAS, suraName, type EditionId } from '../logic/quran';
import { align, buildIndex, flatten, locate, ratingFor, spokenWords, type FlatWord, type Index, type WordStatus } from '../logic/recite';
import { useStore } from '../store';
import { Icon, Switch } from '../ui';
import { tajweedAyah, type Piece } from '../logic/tajweed';
import { FONT, GAP_EM, MIN_FS, clearWidthCache, fitFontSize } from './mushaf';

// ---------- Spracherkennung des Browsers ----------

interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognizerClass(): (new () => Recognizer) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function reciteSupported(): boolean {
  return recognizerClass() !== null;
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Das Mikrofon ist nicht freigegeben. Bitte in den Browser-Einstellungen für diese Seite erlauben.',
  'service-not-allowed': 'Die Spracherkennung ist auf diesem Gerät ausgeschaltet (z. B. Diktierfunktion in den Einstellungen).',
  network: 'Die Spracherkennung braucht Internet.',
  'audio-capture': 'Kein Mikrofon gefunden.',
  'language-not-supported': 'Dieser Browser erkennt kein Arabisch.',
};

// ---------- Quran-Daten zum Abgleichen (einmal aufgebaut) ----------

interface Corpus {
  flat: FlatWord[];
  index: Index;
  /** Position des ersten Wortes jeder Ayah in `flat` */
  first: number[];
}
let corpus: Corpus | null = null;
function corpusOf(text: TextData): Corpus {
  if (!corpus) {
    const flat = flatten(text.ayahs);
    const first: number[] = [];
    flat.forEach((f, i) => {
      if (f.w === 0) first[f.a] = i;
    });
    corpus = { flat, index: buildIndex(flat), first };
  }
  return corpus;
}

const pageMaps: Partial<Record<EditionId, Uint16Array>> = {};
/** Seite jedes Wortes (Index wie in `flat`). */
function pagesOf(layout: LayoutData, c: Corpus): Uint16Array {
  let m = pageMaps[layout.edition];
  if (!m) {
    m = new Uint16Array(c.flat.length);
    layout.pages.forEach((lines, p) => {
      for (const l of lines) if (l[0] === 't') for (const [a, from, to] of l[1]) for (let w = from; w < to; w++) if (c.first[a] + w < m!.length && w < (c.first[a + 1] ?? m!.length) - c.first[a]) m![c.first[a] + w] = p + 1;
    });
    pageMaps[layout.edition] = m;
  }
  return m;
}

const ayahName = (a: number) => {
  const [s, n] = ayahKey(a);
  return `${suraName(s)} ${n}`;
};

const RATING_LABEL: Record<Rating, string> = { sitzt: 'sitzt', wackelt: 'wacklig', fehler: 'Fehler' };

/**
 * Rezitieren mit Mikrofon: Die App hört zu, findet die Stelle, zeigt die Seite und deckt Wort für Wort auf.
 * Ausgelassene und falsche Wörter werden rot markiert; am Ende gibt es eine Auswertung je Seite.
 */
export function ReciteScreen({ edition, hintPage, onClose }: { edition: EditionId; hintPage?: number; onClose: () => void }) {
  const { profile, today, update, toast } = useStore();
  const data = useMushafData(edition);
  const ready = !!data && data !== 'error';
  const c = useMemo(() => (ready ? corpusOf(data.text) : null), [ready, data]);
  const pages = useMemo(() => (ready && c ? pagesOf(data.layout, c) : null), [ready, data, c]);

  const [phase, setPhase] = useState<'idle' | 'listening' | 'done'>('idle');
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Standard: die Mushaf-Seite ist zu sehen; Verdecken lässt sich einschalten und bleibt gemerkt
  const [cover, setCoverState] = useState(() => {
    try {
      return localStorage.getItem('hifz:reciteCover') === '1';
    } catch {
      return false;
    }
  });
  const setCover = (v: boolean) => {
    setCoverState(v);
    try {
      localStorage.setItem('hifz:reciteCover', v ? '1' : '0');
    } catch {
      /* egal */
    }
  };
  // wie beim Lesen: Tajwīd-Farben und Wortanfänge als Hilfe
  const [tajweed, setTajweed] = useState(true);
  const [hint, setHint] = useState(false);
  /** laufender Abschnitt: Position im Quran und ab welchem gesprochenen Wort er gilt */
  const [seg, setSeg] = useState<{ pos: number; from: number } | null>(null);
  /** Ergebnisse früherer Abschnitte (wenn an anderer Stelle weiter rezitiert wurde) */
  const [frozen, setFrozen] = useState<Map<number, WordStatus>>(() => new Map());
  const [saved, setSaved] = useState(false);

  const rec = useRef<Recognizer | null>(null);
  const active = useRef(false);
  const committed = useRef('');

  const words = useMemo(() => spokenWords(finalText), [finalText]);
  const bestand = useMemo(() => (profile ? effectiveBestand(profile, today) : new Set<number>()), [profile, today]);
  const prefer = useMemo(
    () => (pos: number) => (pages ? (hintPage ? Math.abs(pages[pos] - hintPage) <= 1 : bestand.has(pages[pos])) : false),
    [pages, hintPage, bestand],
  );

  // Stelle finden bzw. bemerken, wenn an anderer Stelle weiter rezitiert wird
  useEffect(() => {
    if (!c) return;
    if (!seg) {
      const p = locate(c.index, [...words, ...spokenWords(interim)], prefer);
      if (p !== null) setSeg({ pos: p, from: 0 });
      return;
    }
    const r = align(c.flat, seg.pos, words.slice(seg.from));
    if (r.tailMisses < 6 || words.length - seg.from < 8) return;
    const cut = words.length - 8;
    const p = locate(c.index, words.slice(cut), prefer);
    if (p === null || (p >= seg.pos && p <= seg.pos + r.reached + 5)) return;
    const before = align(c.flat, seg.pos, words.slice(seg.from, cut));
    setFrozen((prev) => {
      const next = new Map(prev);
      before.status.forEach((s, i) => next.set(seg.pos + i, s));
      return next;
    });
    setSeg({ pos: p, from: cut });
  }, [c, words, interim, seg, prefer]);

  const current = useMemo(() => (c && seg ? align(c.flat, seg.pos, words.slice(seg.from)) : null), [c, seg, words]);
  const marks = useMemo(() => {
    const m = new Map(frozen);
    if (seg && current) current.status.forEach((s, i) => m.set(seg.pos + i, s));
    return m;
  }, [frozen, seg, current]);
  // noch nicht bestätigte Wörter (während des Sprechens) rücken die Stelle schon vor, Fehler zählen erst danach
  const liveReach = useMemo(() => {
    if (!c || !seg || !interim.trim()) return 0;
    return align(c.flat, seg.pos, [...words.slice(seg.from), ...spokenWords(interim)]).reached;
  }, [c, seg, words, interim]);
  const cursor = seg && current ? seg.pos + Math.max(current.reached, liveReach) : null;
  const page = pages && cursor !== null ? pages[Math.max(0, Math.min(pages.length - 1, cursor === seg!.pos ? cursor : cursor - 1))] : (hintPage ?? null);

  // ---------- Mikrofon ----------
  const stop = (finish: boolean) => {
    active.current = false;
    try {
      rec.current?.stop();
    } catch {
      /* schon beendet */
    }
    if (finish) setPhase('done');
  };
  const start = () => {
    const Cls = recognizerClass();
    if (!Cls) return;
    setError(null);
    setPhase('listening');
    active.current = true;
    const run = () => {
      const r = new Cls();
      rec.current = r;
      r.lang = 'ar-SA';
      // Android liefert im Dauerbetrieb Ergebnisse doppelt: dort Satz für Satz und danach neu starten
      r.continuous = !/Android/i.test(navigator.userAgent);
      r.interimResults = true;
      let sessionFinal = '';
      r.onresult = (e) => {
        let fin = '';
        let inter = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) fin += ` ${res[0].transcript}`;
          else inter += ` ${res[0].transcript}`;
        }
        sessionFinal = fin;
        setFinalText(`${committed.current}${fin}`);
        setInterim(inter);
      };
      r.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        setError(ERROR_TEXT[e.error] ?? 'Die Spracherkennung wurde unterbrochen.');
        active.current = false;
        setPhase((p) => (p === 'listening' ? 'idle' : p));
      };
      r.onend = () => {
        committed.current += sessionFinal;
        setInterim('');
        if (active.current) {
          try {
            run();
          } catch {
            active.current = false;
            setPhase('idle');
          }
        }
      };
      r.start();
    };
    try {
      run();
    } catch {
      setError('Die Spracherkennung konnte nicht gestartet werden.');
      setPhase('idle');
    }
  };
  useEffect(
    () => () => {
      active.current = false;
      try {
        rec.current?.abort();
      } catch {
        /* egal */
      }
    },
    [],
  );
  // Vollbild: Seite darunter nicht mitscrollen
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---------- Größe der Seite ----------
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fontReady, setFontReady] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth - 16, h: el.clientHeight - 8 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [ready, phase]);
  useEffect(() => {
    document.fonts.load(`100px ${FONT}`).then(() => {
      clearWidthCache();
      setFontReady(true);
    });
  }, []);

  // ---------- Auswertung ----------
  const result = useMemo(() => {
    if (!c || !pages || !marks.size) return null;
    const positions = [...marks.keys()].sort((x, y) => x - y);
    const errors = positions.filter((p) => marks.get(p) !== 'ok');
    const perPage = new Map<number, { total: number; seen: number; errors: number }>();
    for (const p of positions) {
      const pg = pages[p];
      const e = perPage.get(pg) ?? { total: 0, seen: 0, errors: 0 };
      e.seen++;
      if (marks.get(p) !== 'ok') e.errors++;
      perPage.set(pg, e);
    }
    for (const [pg, e] of perPage) {
      let n = 0;
      for (let i = 0; i < pages.length; i++) if (pages[i] === pg) n++;
      e.total = n;
    }
    return {
      first: positions[0],
      last: positions[positions.length - 1],
      words: positions.length,
      errors,
      // ganz rezitierte Seiten (ein, zwei fehlende Wörter am Rand zählen nicht)
      full: [...perPage.entries()].filter(([, e]) => e.seen >= e.total - 2).map(([pg, e]) => ({ page: pg, rating: ratingFor(e.errors), errors: e.errors })),
    };
  }, [c, pages, marks]);

  const save = () => {
    if (!result?.full.length) return;
    update((p) => result.full.reduce((q, f) => logFreeReview(q, today, [f.page], f.rating), p));
    setSaved(true);
    toast(result.full.length === 1 ? `S. ${result.full[0].page} eingetragen` : `${result.full.length} Seiten eingetragen`);
  };

  const supported = reciteSupported();
  const heard = `${finalText} ${interim}`.trim();
  const errorCount = result?.errors.length ?? 0;

  return (
    <div className="quiz-screen recite" role="dialog" aria-modal="true" aria-label="Rezitieren">
      <header className="quiz-top">
        <button type="button" className="iconbtn" aria-label="Schließen" onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="quiz-title">
          <b>Rezitieren</b>
          <span>
            {phase === 'done'
              ? 'Auswertung'
              : cursor !== null && c
                ? `${ayahName(c.flat[Math.min(c.flat.length - 1, cursor)].a)}${page ? ` · S. ${page}` : ''}`
                : phase === 'listening'
                  ? 'Ich höre zu …'
                  : 'Mikrofon antippen und losrezitieren'}
          </span>
        </div>
        {phase !== 'done' && seg && (
          <span className={`recite-count${errorCount ? ' err' : ''}`} aria-label={`${errorCount} Fehler`}>
            {errorCount}
          </span>
        )}
      </header>

      {phase !== 'done' ? (
        <>
          <div className="switch-bar recite-switches" role="group" aria-label="Ansicht">
            <Switch label="Verdecken" on={cover} onChange={setCover} />
            <Switch label="Wortanfang" on={cover && hint} onChange={(v) => (setHint(v), v && setCover(true))} />
            <Switch label="Tajwīd" on={tajweed} onChange={setTajweed} />
          </div>
          <div className="quiz-stage" ref={box}>
            {data === null && <div className="empty">Seite wird geladen …</div>}
            {data === 'error' && <div className="empty">Die Quran-Daten konnten nicht geladen werden.</div>}
            {ready && c && page && seg ? (
              <RecitePage
                key={page}
                lines={data.layout.pages[page - 1]}
                text={data.text}
                first={c.first}
                marks={marks}
                cursor={cursor ?? 0}
                cover={cover}
                hint={hint}
                tajweed={tajweed}
                width={size.w}
                height={size.h}
                fontReady={fontReady}
              />
            ) : (
              ready && (
                <div className="recite-intro">
                  {!supported ? (
                    <p>
                      Dieser Browser hat keine Spracherkennung. Sie funktioniert in Chrome (Android, Computer) und in Safari auf dem iPhone.
                    </p>
                  ) : phase === 'listening' ? (
                    <>
                      <div className="recite-pulse" aria-hidden="true">
                        <Icon name="mic" />
                      </div>
                      <p>Rezitiere einfach los – nach ein paar Wörtern finde ich die Stelle.</p>
                    </>
                  ) : (
                    <>
                      <p>
                        <b>Rezitiere auswendig.</b> Die App erkennt die Stelle, zeigt die Seite und deckt Wort für Wort auf.
                        Ausgelassene oder falsche Wörter werden rot.
                      </p>
                      <p className="small">
                        Geprüft werden die Wörter, nicht Vokale und Tajwīd. Die Erkennung läuft über den Sprachdienst deines Browsers
                        (Google bzw. Apple) und braucht Internet.
                      </p>
                    </>
                  )}
                </div>
              )
            )}
          </div>
          {error && (
            <p className="recite-error" role="alert">
              {error}
            </p>
          )}
          <div className="recite-heard" dir="rtl" aria-live="off">
            {heard ? heard.split(/\s+/).slice(-9).join(' ') : ' '}
          </div>
          <div className="recite-actions">
            <span />
            {phase === 'listening' ? (
              <button type="button" className="mic-btn live" aria-label="Rezitation beenden" onClick={() => stop(marks.size > 0)}>
                <Icon name="stop" />
              </button>
            ) : (
              <button type="button" className="mic-btn" aria-label="Rezitation starten" onClick={start} disabled={!supported || !ready}>
                <Icon name="mic" />
              </button>
            )}
            <button type="button" className="qbtn" aria-label="Auswertung" onClick={() => stop(true)} disabled={!marks.size}>
              <Icon name="check" />
            </button>
          </div>
        </>
      ) : (
        <div className="recite-result">
          {result && c ? (
            <>
              <div className="quiz-score">
                <span className="emoji" aria-hidden="true">
                  {errorCount === 0 ? '🎉' : errorCount <= 3 ? '👍' : '💪'}
                </span>
                <b>{errorCount === 0 ? 'Fehlerfrei' : `${errorCount} Fehler`}</b>
              </div>
              <p className="recite-range">
                {ayahName(c.flat[result.first].a)} – {ayahName(c.flat[result.last].a)} · {result.words} Wörter
              </p>
              {result.errors.length > 0 && (
                <ul className="recite-errors">
                  {result.errors.slice(0, 30).map((p) => {
                    const f = c.flat[p];
                    const [s, a] = ayahKey(f.a);
                    return (
                      <li key={p}>
                        <span className="ar">{data !== null && data !== 'error' ? data.text.ayahs[f.a][f.w] : ''}</span>
                        <span>
                          {SURAS[s - 1].tr} {a}
                        </span>
                        <span className="tag err">{marks.get(p) === 'missed' ? 'ausgelassen' : 'anders gehört'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {result.full.length > 0 && (
                <div className="recite-pages">
                  {result.full.map((f) => (
                    <span key={f.page} className={`free-item rated-${f.rating}`}>
                      S. {f.page}: {RATING_LABEL[f.rating]}
                    </span>
                  ))}
                </div>
              )}
              {result.full.length > 0 ? (
                <button type="button" className="btn primary block" onClick={save} disabled={saved}>
                  {saved ? 'Eingetragen' : 'Als Wiederholung eintragen'}
                </button>
              ) : (
                <p className="small" style={{ textAlign: 'center' }}>
                  Eine ganz rezitierte Seite kannst du danach als Wiederholung eintragen.
                </p>
              )}
            </>
          ) : (
            <p style={{ textAlign: 'center' }}>Es wurde nichts erkannt.</p>
          )}
          <button
            type="button"
            className="btn block"
            onClick={() => {
              committed.current = '';
              setFinalText('');
              setInterim('');
              setSeg(null);
              setFrozen(new Map());
              setSaved(false);
              setPhase('idle');
            }}
          >
            <Icon name="mic" /> Noch einmal
          </button>
          <button type="button" className="btn ghost block" onClick={onClose}>
            Fertig
          </button>
        </div>
      )}
    </div>
  );
}

function RecitePage({
  lines,
  text,
  first,
  marks,
  cursor,
  cover,
  hint,
  tajweed,
  width,
  height,
  fontReady,
}: {
  lines: LineData[];
  text: TextData;
  first: number[];
  marks: Map<number, WordStatus>;
  cursor: number;
  cover: boolean;
  /** beim Verdecken das erste Wort jeder Ayah zeigen */
  hint: boolean;
  tajweed: boolean;
  width: number;
  height: number;
  fontReady: boolean;
}) {
  const fitW = fontReady && width > 0 ? fitFontSize(lines, text, width) : 20;
  const per = height > 0 ? height / lines.length : fitW * 2;
  const fs = Math.max(MIN_FS, Math.min(fitW, per / 1.6));
  const lineH = Math.min(per, fs * 2.2);
  const tjCache = useMemo(() => new Map<number, Piece[][]>(), [text]);
  const pieces = (a: number, wi: number): Piece[] | null => {
    const words = text.ayahs[a];
    if (wi >= words.length - 1) return null;
    let v = tjCache.get(a);
    if (!v) {
      v = tajweedAyah(words.slice(0, -1));
      tjCache.set(a, v);
    }
    return v[wi];
  };
  return (
    <div className="mushaf quiz-page" style={{ fontSize: fs }}>
      {lines.map((line, i) => {
        if (line[0] === 'h')
          return (
            <div key={i} className="mline sura-head" style={{ height: lineH }}>
              <div className="mtext">
                <div className="sura-frame" style={{ fontSize: fs * 1.05 }}>
                  {SURAS[line[1] - 1].ar}
                </div>
              </div>
            </div>
          );
        if (line[0] === 'b')
          return (
            <div key={i} className="mline" style={{ height: lineH }}>
              <div className="mtext">
                <div className="words" style={{ justifyContent: 'center', gap: `${GAP_EM * 2}em` }}>
                  {text.basmala.map((w, k) => (
                    <span key={k} className="w">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        return (
          <div key={i} className="mline" style={{ height: lineH }}>
            <div className="mtext">
              <div className="words" style={line[2] ? { width: `${line[2] * 100}%`, gap: `${GAP_EM}em` } : { gap: `${GAP_EM}em` }}>
                {line[1].flatMap(([a, from, to]) =>
                  text.ayahs[a].slice(from, to).map((w, k) => {
                    const wi = from + k;
                    const last = text.ayahs[a].length - 1;
                    // die Ayah-Nummer erscheint zusammen mit dem letzten Wort der Ayah
                    const pos = first[a] + Math.min(wi, last - 1);
                    const st = marks.get(pos);
                    const hidden = cover && !(hint && (wi === 0 || wi === last));
                    const cls = st
                      ? st === 'ok'
                        ? 'w r-ok'
                        : 'w r-err'
                      : pos < cursor
                        ? 'w r-ok'
                        : pos === cursor
                          ? `w r-next${hidden ? ' masked' : ''}`
                          : hidden
                            ? 'w masked'
                            : 'w r-open';
                    const tj = tajweed && !cls.includes('masked') && !cls.includes('r-err') ? pieces(a, wi) : null;
                    return (
                      <span key={`${a}-${wi}`} className={cls}>
                        {tj ? tj.map((p, pi) => (p.c ? <span key={pi} className={`tj-${p.c}`}>{p.t}</span> : p.t)) : w}
                      </span>
                    );
                  }),
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
