import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RECITERS, REPEAT_OPTIONS, listenUrl, reciterById, useAudio } from '../audio';
import { IS_ARTIFACT, quranComUrl } from '../platform';
import { ayahKey, useMushafData, type LineData, type TextData } from '../data/quranData';
import {
  JUZ_COUNT,
  PAGE_COUNT,
  SURAS,
  juzPages,
  meta,
  pageJuz,
  pageRangeLabel,
  suraName,
  suraPages,
  surasOnPage,
  type EditionId,
} from '../logic/quran';
import { logFreeReview, removeFreeReview } from '../logic/plan';
import type { Rating } from '../logic/profile';
import { useStore } from '../store';
import { Icon, Seg, Sheet, Switch } from '../ui';
import { TAJWEED_LEGEND, tajweedAyah, type Piece } from '../logic/tajweed';
import { TRANSLATIONS, useTranslation, type TranslationId } from '../data/translations';
import { suraStatus } from '../logic/stats';
import type { ReadTarget } from './Today';

const FONT = '"KFGQPC Hafs"';
const GAP_EM = 0.16;
const MAX_FS = 30;
const MIN_FS = 14;

const lastPageKey = (id: string) => `hifz:lastPage:${id}`;

/** Was im Verdecken-Modus sichtbar bleibt: nichts oder Anfang und Ende jeder Ajah */
type HintMode = 'lines' | 'ayah';
const HINT_KEY = 'hifz:hint';
function readHint(): HintMode {
  try {
    return localStorage.getItem(HINT_KEY) === 'ayah' ? 'ayah' : 'lines';
  } catch {
    return 'lines';
  }
}

function readLastPage(id: string): number {
  try {
    return Number(localStorage.getItem(lastPageKey(id))) || 0;
  } catch {
    return 0;
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
  let fs = Math.min(MAX_FS, width * 0.064);
  for (const line of lines) {
    if (line[0] !== 't') continue;
    const words = lineWords(line, text);
    const natural = words.reduce((s, w) => s + wordWidth(w), 0) + (words.length - 1) * GAP_EM * 100;
    const avail = width * (line[2] ?? 1);
    fs = Math.min(fs, (avail / natural) * 100);
  }
  return Math.max(MIN_FS, Math.floor(fs * 10) / 10);
}

export function Read({ target, onTargetUsed }: { target: ReadTarget | null; onTargetUsed: () => void }) {
  const { profile } = useStore();
  const audio = useAudio();
  const ed: EditionId = profile?.edition ?? '1405';
  const data = useMushafData(ed);
  // Ohne Sprungziel: zuletzt gelesene Seite, sonst die Dars-Seite bzw. der Anfang des Bestands
  const [page, setPageState] = useState(
    () => target?.page || (profile && (readLastPage(profile.id) || (profile.dars.enabled ? profile.dars.page : profile.bestand[0]))) || 1,
  );
  const [hl, setHl] = useState<{ from?: number; to?: number; start?: number } | null>(null);
  const [hifz, setHifz] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [jump, setJump] = useState(false);
  const [listen, setListen] = useState(false);
  const [counter, setCounter] = useState<number | null>(null);
  const [hint, setHintState] = useState<HintMode>(readHint);
  const setHint = (m: HintMode) => {
    setHintState(m);
    try {
      localStorage.setItem(HINT_KEY, m);
    } catch {
      /* egal */
    }
  };
  /** angetippte Ajah (globaler Index) für Schleife und Nachsprechen */
  const [sel, setSel] = useState<number | null>(null);
  /** Lesen beginnt mit der Suren-Übersicht; ein Sprungziel öffnet direkt die Seite */
  const [view, setView] = useState<'index' | 'page'>(() => (target ? 'page' : 'index'));
  // Bei jedem Start: Tajwīd an, Übersetzung und Verdecken aus
  const [tajweed, setTajweed] = useState(true);
  const [trans, setTrans] = useState(false);
  const [transChoice, setTransChoice] = usePref<TranslationId>('hifz:transChoice', 'bubenheim');

  // Die geöffnete Seite bekommt einen Verlaufseintrag, damit „Zurück“ (Wischgeste, Android-Taste,
  // Browser) wieder zur Suren-Übersicht führt statt die App zu verlassen.
  const pushed = useRef(false);
  const openPage = useCallback(() => {
    setView('page');
    if (pushed.current) return;
    try {
      history.pushState({ hifzRead: 'page' }, '');
      pushed.current = true;
    } catch {
      /* ohne Verlauf bleibt der Zurück-Knopf */
    }
  }, []);
  const backToIndex = () => {
    setView('index');
    setSel(null);
    if (pushed.current) {
      pushed.current = false;
      try {
        history.back();
      } catch {
        /* egal */
      }
    }
  };
  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      setView('index');
      setSel(null);
      setJump(false);
      setListen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const tjCache = useMemo(() => new Map<number, Piece[][]>(), [data]);
  const piecesOf = (idx: number, ayah: string[]) => {
    let v = tjCache.get(idx);
    if (!v) {
      v = tajweedAyah(ayah.slice(0, -1));
      tjCache.set(idx, v);
    }
    return v;
  };

  const setPage = useCallback(
    (p: number) => {
      const n = Math.max(1, Math.min(PAGE_COUNT, p));
      setPageState(n);
      setHl(null);
      setSel(null);
      setRevealed(0);
      setCounter(null);
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
    setHifz(!!target.startLine);
    if (target.counter) setCounter(0);
    openPage();
    onTargetUsed();
  }, [target, setPage, onTargetUsed, openPage]);

  const lines = data && data !== 'error' ? data.layout.pages[page - 1] : null;
  const text = data && data !== 'error' ? data.text : null;
  // Gerade gespielte Ajah hervorheben, wenn sie auf dieser Seite steht
  const playingAyah = audio.state && audio.state.page === page ? audio.state.ayah : null;
  const isPlayingHere = !!audio.state && audio.state.page === page;

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
  // Seitenrand: Innenabstand links und rechts (je 12 px, Buchstaben ragen etwas über)
  const textWidth = Math.max(0, width - 24);
  const fs = useMemo(
    () => (lines && text && fontReady && textWidth ? fitFontSize(lines, text, textWidth) : 20),
    [lines, text, fontReady, textWidth],
  );

  // ---------- Hifz-Modus ----------
  // Im Mushaf wird Zeile für Zeile aufgedeckt, mit Übersetzung Ajah für Ajah
  const coverFrom = hl?.start ?? 1;
  const coverable = lines
    ? trans
      ? pageAyahs(lines, coverFrom)
      : lines.map((l, i) => (l[0] === 't' && i + 1 >= coverFrom ? i + 1 : 0)).filter(Boolean)
    : [];
  const hiddenSet = new Set(hifz ? coverable.slice(revealed) : []);
  const revealNext = () => setRevealed((r) => Math.min(coverable.length, r + 1));
  const unit = trans ? 'Ajah' : 'Zeile';

  /** Ein Wort der Ajah, mit Tajwīd-Farben und ggf. ausgeblendet (Hinweis-Modus). */
  const renderWord = (idx: number, wi: number, w: string, masked: boolean, ayahWords: string[]) => {
    const isMarker = wi === ayahWords.length - 1;
    const hide = masked && !(wi === 0 || isMarker);
    const c = ['w', playingAyah === idx ? 'playing' : '', sel === idx ? 'sel' : '', hide ? 'masked' : ''].filter(Boolean).join(' ');
    const tj = tajweed && !hide && !isMarker ? piecesOf(idx, ayahWords)[wi] : null;
    return (
      <span key={`${idx}-${wi}`} className={c} data-a={idx}>
        {tj
          ? tj.map((p, pi) =>
              p.c ? (
                <span key={pi} className={`tj-${p.c}`}>
                  {p.t}
                </span>
              ) : (
                p.t
              ),
            )
          : w}
      </span>
    );
  };

  // ---------- Wischen ----------
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean; moved: boolean; target: EventTarget | null } | null>(null);
  const [dx, setDx] = useState(0);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: false, moved: false, target: e.target };
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
    else if (!d.moved) {
      // Tipp auf eine Ajah wählt sie zum Anhören in Schleife aus (nochmal tippen hebt die Auswahl auf)
      const w = (d.target as HTMLElement | null)?.closest?.('[data-a]') as HTMLElement | null;
      const a = w ? Number(w.dataset.a) : null;
      setSel((cur) => (a === null || a === cur ? null : a));
    }
  };

  if (!profile) return null;
  const juz = pageJuz(ed, page);

  if (view === 'index') {
    return (
      <SuraIndex
        edition={ed}
        lastPage={page}
        onOpen={(p) => {
          setPage(p);
          openPage();
        }}
        onJump={() => setJump(true)}
        jumpSheet={
          jump && (
            <JumpSheet
              edition={ed}
              onClose={() => setJump(false)}
              onGo={(p) => {
                setPage(p);
                setJump(false);
                openPage();
              }}
            />
          )
        }
      />
    );
  }

  // Welche Sura gerade gelesen wird: groß oben, beim Scrollen fest stehend
  const suras = surasOnPage(ed, page);
  const single = suras.length === 1;
  const [, a1] = meta(ed).pageFirst[page - 1];
  const [, a2] = meta(ed).pageLast[page - 1];
  const title = suras.length <= 3 ? suras.map(suraName).join(' · ') : `${suraName(suras[0])} – ${suraName(suras[suras.length - 1])}`;

  return (
    <div>
      <div className="reader-head">
        <div className="reader-bar">
          <button type="button" className="backbtn" aria-label="Zurück zur Suren-Übersicht" onClick={backToIndex}>
            <Icon name="next" />
            Suren
          </button>
          <span style={{ flex: 1 }} />
          {IS_ARTIFACT ? (
            <a
              className="iconbtn"
              href={listenUrl(ed, page, hl?.from, hl?.to)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Auf quran.com anhören"
            >
              <Icon name="play" />
            </a>
          ) : (
            <button
              type="button"
              className="iconbtn"
              aria-pressed={isPlayingHere}
              aria-label={isPlayingHere ? 'Wiedergabe beenden' : 'Anhören'}
              onClick={() => (isPlayingHere ? audio.stop() : setListen(true))}
              disabled={!lines}
            >
              <Icon name={isPlayingHere ? 'pause' : 'play'} />
            </button>
          )}
        </div>
        <div className="sura-title">
          <div className="names">
            <h2>{title}</h2>
            <div>
              {single ? `Ajah ${a1 === a2 ? a1 : `${a1}–${a2}`}` : pageRangeLabel(ed, page)} · Seite {page} · Juz {juz}
            </div>
          </div>
          {single && <span className="ar">{SURAS[suras[0] - 1].ar}</span>}
        </div>
      </div>

      <div className="switch-bar" role="group" aria-label="Ansicht">
        <Switch
          label="Verdecken"
          on={hifz}
          onChange={(v) => {
            setHifz(v);
            setRevealed(0);
            setSel(null);
          }}
        />
        <Switch label="Tajwīd" on={tajweed} onChange={setTajweed} />
        <Switch
          label="Übersetzung"
          on={trans}
          onChange={(v) => {
            setTrans(v);
            setRevealed(0);
          }}
        />
      </div>

      <div
        className="mushaf-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={trans ? 'mushaf ayah-view' : 'mushaf'}
          ref={box}
          style={{
            transform: dx ? `translateX(${dx * 0.6}px)` : undefined,
            transition: dx ? 'none' : 'transform 0.2s ease-out',
            fontSize: trans ? undefined : fs,
          }}
          aria-label={`Mushaf Seite ${page}`}
        >
          {data === null && <div className="empty">Seite wird geladen …</div>}
          {data === 'error' && <div className="empty">Die Quran-Daten konnten nicht geladen werden. Bitte einmal mit Internet öffnen.</div>}
          {trans && lines && text && (
            <AyahView
              lines={lines}
              text={text}
              transId={transChoice}
              hidden={hiddenSet}
              masked={hint === 'ayah'}
              playingAyah={playingAyah}
              sel={sel}
              renderWord={renderWord}
            />
          )}
          {!trans &&
            lines &&
            text &&
            lines.map((line, i) => {
              const n = i + 1;
              const isHl = hl?.from !== undefined && hl.to !== undefined && n >= hl.from && n <= hl.to;
              const hidden = hiddenSet.has(n);
              // Hinweis-Modi: nur einzelne Wörter bleiben sichtbar, der Rest wird ausgeblendet
              const masked = hidden && hint !== 'lines';
              const covered = hidden && hint === 'lines';
              const cls = ['mline', isHl ? 'hl' : '', hl?.start === n ? 'start' : '', covered ? 'hidden' : '', line[0] === 'h' ? 'sura-head' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <div key={n} className={cls} style={{ minHeight: `${fs * 1.9}px` }}>
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
                          text.ayahs[idx].slice(from, to).map((w, k) => renderWord(idx, from + k, w, masked, text.ayahs[idx])),
                        )}
                      </div>
                    )}
                  </div>
                  {covered && <div className="cover" aria-hidden="true" />}
                </div>
              );
            })}
        </div>
      </div>

      {counter !== null && (
        <div className="counter" aria-live="polite">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Wiederholungen</div>
            <div className="small">Ziel: etwa 10× flüssig lesen</div>
          </div>
          <button type="button" className="iconbtn" aria-label="Eine Wiederholung zurück" onClick={() => setCounter(Math.max(0, counter - 1))}>
            −
          </button>
          <span className="n">{counter}</span>
          <button type="button" className="btn primary" aria-label="Wiederholung zählen" onClick={() => setCounter(counter + 1)}>
            +1
          </button>
        </div>
      )}

      {tajweed && (
        <div className="tj-legend" aria-label="Tajwīd-Farben">
          {TAJWEED_LEGEND.map((l) => (
            <span key={l.c} title={l.hint}>
              <i className={`dot tj-bg-${l.c}`} />
              <b className={`tj-${l.c}`}>{l.label}</b> {l.hint}
            </span>
          ))}
        </div>
      )}

      {trans && (
        <div style={{ marginTop: 10 }}>
          <Seg<TranslationId>
            label="Übersetzung wählen"
            value={transChoice}
            onChange={setTransChoice}
            options={TRANSLATIONS.map((t) => ({ value: t.id, label: t.short }))}
          />
          <p className="small" style={{ margin: '6px 0 0' }}>
            Übersetzung der Bedeutungen: {TRANSLATIONS.find((t) => t.id === transChoice)!.name}.{' '}
            {TRANSLATIONS.find((t) => t.id === transChoice)!.source}
          </p>
        </div>
      )}

      {hifz && (
        <div className="switch-bar single">
          <Switch label="Anfang und Ende jeder Ajah zeigen" on={hint === 'ayah'} onChange={(v) => setHint(v ? 'ayah' : 'lines')} />
        </div>
      )}

      {sel !== null && !hifz && !audio.state && <AyahBar ayah={sel} page={page} onClose={() => setSel(null)} />}

      {hifz && (
        <div className="hifz-bar">
          <button type="button" className="btn primary" onClick={revealNext} disabled={revealed >= coverable.length}>
            Nächste {unit}
          </button>
          <button type="button" className="btn" onClick={() => setRevealed(revealed >= coverable.length ? 0 : coverable.length)}>
            {revealed >= coverable.length ? 'Neu verdecken' : 'Alles zeigen'}
          </button>
        </div>
      )}

      <PageReview page={page} />

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
        {hifz ? ` Beim Verdecken deckt ein Tipp auf die Seite die nächste ${unit} auf.` : ''}
      </p>

      {listen && (
        <ListenSheet
          page={page}
          hl={hl?.from !== undefined && hl.to !== undefined ? [hl.from, hl.to] : null}
          onClose={() => setListen(false)}
          onPlay={(from, to, repeatEach, rounds, reciter) => {
            setListen(false);
            void audio.play({ edition: ed, page, from, to, repeatEach, rounds, reciter });
          }}
        />
      )}

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

function ListenSheet({
  page,
  hl,
  onClose,
  onPlay,
}: {
  page: number;
  hl: [number, number] | null;
  onClose: () => void;
  onPlay: (from: number | undefined, to: number | undefined, repeatEach: number, rounds: number, reciter: string) => void;
}) {
  const { profile, update } = useStore();
  const [range, setRange] = useState<'hl' | 'page'>(hl ? 'hl' : 'page');
  const [rounds, setRounds] = useState(1);
  if (!profile) return null;
  const repeatEach = profile.repeatEach ?? 3;
  const reciter = reciterById(profile.reciter);
  return (
    <Sheet title="Anhören" onClose={onClose}>
      <div className="stack">
        {hl && (
          <div>
            <label className="lbl">Bereich</label>
            <Seg<'hl' | 'page'>
              label="Bereich"
              value={range}
              onChange={setRange}
              options={[
                { value: 'hl', label: `Zeilen ${hl[0]}–${hl[1]}` },
                { value: 'page', label: `Ganze Seite ${page}` },
              ]}
            />
          </div>
        )}
        <div>
          <label className="lbl" htmlFor="reciter">
            Rezitator
          </label>
          <select id="reciter" className="field" value={reciter.id} onChange={(e) => update((p) => ({ ...p, reciter: e.target.value }))}>
            {RECITERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.style !== 'Murattal' ? ` – ${r.style}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">Jede Ajah wiederholen</label>
          <div className="chips-row">
            {REPEAT_OPTIONS.map((n) => (
              <button key={n} type="button" aria-pressed={repeatEach === n} onClick={() => update((p) => ({ ...p, repeatEach: n }))}>
                {n}×
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="lbl">Nachsprech-Pause nach jeder Ajah</label>
          <Seg<string>
            label="Nachsprech-Pause"
            value={profile.echoPause ? 'an' : 'aus'}
            onChange={(v) => update((p) => ({ ...p, echoPause: v === 'an' }))}
            options={[
              { value: 'aus', label: 'Aus' },
              { value: 'an', label: 'An – so lang wie die Ajah' },
            ]}
          />
        </div>
        <div>
          <label className="lbl">Den ganzen Bereich</label>
          <div className="chips-row">
            {[1, 3, 5].map((n) => (
              <button key={n} type="button" aria-pressed={rounds === n} onClick={() => setRounds(n)}>
                {n}×
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn primary block"
          onClick={() => onPlay(range === 'hl' && hl ? hl[0] : undefined, range === 'hl' && hl ? hl[1] : undefined, repeatEach, rounds, reciter.id)}
        >
          <Icon name="play" /> Abspielen
        </button>
        <p className="small" style={{ margin: 0 }}>
          Zum Auswendiglernen hilft es, immer denselben Rezitator zu hören. Audio von EveryAyah.com, nur mit Internet.
        </p>
      </div>
    </Sheet>
  );
}

/** Diese Seite als Wiederholung außerhalb des Plans eintragen. */
function PageReview({ page }: { page: number }) {
  const { profile, today, update } = useStore();
  if (!profile) return null;
  const planned = profile.days[today]?.muraja;
  const inPlan = !!planned && [...planned.pages, ...planned.extra].includes(page);
  const current = profile.days[today]?.free?.find((f) => f.page === page)?.r;
  const opts: { r: Rating; label: string }[] = [
    { r: 'sitzt', label: 'sitzt' },
    { r: 'wackelt', label: 'wackelt' },
    { r: 'fehler', label: 'Fehler' },
  ];
  if (inPlan) return null;
  return (
    <div className="read-review">
      <div style={{ fontWeight: 600, fontSize: 15 }}>
        {current ? `S. ${page} heute zusätzlich wiederholt` : `S. ${page} zusätzlich wiederholt?`}
      </div>
      <div className="rate" role="group" aria-label={`Seite ${page} außerhalb des Plans bewerten`}>
        {opts.map(({ r, label }) => (
          <button
            key={r}
            type="button"
            className={r}
            aria-pressed={current === r}
            onClick={() => update((p) => (current === r ? removeFreeReview(p, today, page) : logFreeReview(p, today, [page], r)))}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Leiste für eine angetippte Ajah: in Schleife hören, mit oder ohne Nachsprech-Pause. */
function AyahBar({ ayah, page, onClose }: { ayah: number; page: number; onClose: () => void }) {
  const { profile, update } = useStore();
  const audio = useAudio();
  if (!profile) return null;
  const [s, a] = ayahKey(ayah);
  const echo = profile.echoPause ?? false;
  return (
    <div className="ayah-bar" role="region" aria-label="Ausgewählte Ajah">
      <div className="info">
        <b>
          {suraName(s)} {a}
        </b>
        <div>{IS_ARTIFACT ? 'auf quran.com' : 'in Schleife'}</div>
      </div>
      {IS_ARTIFACT ? (
        <a className="btn primary" href={quranComUrl(s, a, a)} target="_blank" rel="noopener noreferrer">
          <Icon name="play" /> Hören
        </a>
      ) : (
        <>
          <button
            type="button"
            className="btn"
            aria-pressed={echo}
            onClick={() => update((p) => ({ ...p, echoPause: !echo }))}
            title="Nach jeder Wiederholung eine Pause zum Nachsprechen"
          >
            {echo ? '✓ ' : ''}Nachsprechen
          </button>
          <button
            type="button"
            className="btn primary"
            aria-label={`${suraName(s)} ${a} in Schleife hören`}
            onClick={() =>
              void audio.play({
                edition: profile.edition,
                page,
                ayahs: [ayah],
                loop: true,
                echo,
                label: `${suraName(s)} ${a} · Schleife${echo ? ' mit Nachsprech-Pause' : ''}`,
              })
            }
          >
            <Icon name="play" />
          </button>
        </>
      )}
      <button type="button" className="iconbtn" aria-label="Auswahl schließen" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** Einstellung dieses Geräts in localStorage (z. B. Tajwīd an/aus). */
function usePref<T extends string | boolean>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, JSON.stringify(nv));
    } catch {
      /* egal */
    }
  };
  return [v, set];
}

/** Ajat dieser Seite in Reihenfolge (globaler Index), ab einer Zeile. */
function pageAyahs(lines: LineData[], fromLine = 1): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (l[0] === 't' && i + 1 >= fromLine) for (const [idx] of l[1]) if (!out.includes(idx)) out.push(idx);
  });
  return out;
}

/** Lesen mit Übersetzung: Ajah für Ajah, die deutsche Bedeutung direkt unter dem arabischen Text. */
function AyahView({
  lines,
  text,
  transId,
  hidden,
  masked,
  playingAyah,
  sel,
  renderWord,
}: {
  lines: LineData[];
  text: TextData;
  transId: TranslationId;
  hidden: Set<number>;
  masked: boolean;
  playingAyah: number | null;
  sel: number | null;
  renderWord: (idx: number, wi: number, w: string, masked: boolean, ayahWords: string[]) => ReactNode;
}) {
  const tr = useTranslation(transId);
  const seen = new Set<number>();
  const blocks: ReactNode[] = [];
  lines.forEach((l, i) => {
    if (l[0] === 'h') {
      blocks.push(
        <div key={`h${i}`} className="sura-frame">
          {SURAS[l[1] - 1].ar}
          <span className="tr-sura">{SURAS[l[1] - 1].tr}</span>
        </div>,
      );
    } else if (l[0] === 'b') {
      blocks.push(
        <div key={`b${i}`} className={`ayah-ar basmala${playingAyah === -1 ? ' playing' : ''}`}>
          {text.basmala.join(' ')}
        </div>,
      );
    } else {
      for (const [idx] of l[1]) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        const [s, a] = ayahKey(idx);
        const words = text.ayahs[idx];
        const isHidden = hidden.has(idx);
        const covered = isHidden && !masked;
        blocks.push(
          <div key={idx} className={`ayah-item${playingAyah === idx ? ' playing' : ''}${sel === idx ? ' sel' : ''}`} data-a={idx}>
            <div className={`ayah-ar${covered ? ' covered' : ''}`}>
              {words.slice(0, -2).map((w, wi) => renderWord(idx, wi, w, isHidden && masked, words))}
              {/* letztes Wort und Ajah-Nummer bleiben zusammen in einer Zeile */}
              <span className="ayah-end">
                {words.slice(-2).map((w, k) => renderWord(idx, words.length - 2 + k, w, isHidden && masked, words))}
              </span>
              {covered && <div className="cover" aria-hidden="true" />}
            </div>
            <p className="tr-ayah">
              <span className="tr-ref">
                {s}:{a}
              </span>{' '}
              {Array.isArray(tr) ? tr[idx] : ''}
            </p>
          </div>,
        );
      }
    }
  });
  return (
    <>
      {blocks}
      {tr === null && <p className="small">Übersetzung wird geladen …</p>}
      {tr === 'error' && <p className="small">Die Übersetzung konnte nicht geladen werden. Bitte einmal mit Internet öffnen.</p>}
    </>
  );
}

/** Startansicht von „Lesen“: alle Suren (oder Juz), zum Öffnen antippen. */
function SuraIndex({
  edition,
  lastPage,
  onOpen,
  onJump,
  jumpSheet,
}: {
  edition: EditionId;
  lastPage: number;
  onOpen: (page: number) => void;
  onJump: () => void;
  jumpSheet: ReactNode;
}) {
  const { profile, today } = useStore();
  const [mode, setMode] = useState<'sura' | 'juz'>('sura');
  const [q, setQ] = useState('');
  if (!profile) return null;
  const status = suraStatus(profile, today);
  const query = q.trim().toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const simple = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const suras = SURAS.filter((s) => !query || String(s.n) === query || simple(s.tr).includes(query));
  const label = { auswendig: 'auswendig', dars: 'im Dars', teilweise: 'teilweise', offen: '' } as const;
  return (
    <div>
      <button type="button" className="continue" onClick={() => onOpen(lastPage)}>
        <span className="small">Weiterlesen</span>
        <b>
          S. {lastPage} · {pageRangeLabel(edition, lastPage)}
        </b>
      </button>
      <div className="row" style={{ margin: '14px 0 10px' }}>
        <input
          id="sura-search"
          className="field"
          placeholder="Sura suchen (Name oder Nummer)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" className="iconbtn" aria-label="Zu einer Seite springen" onClick={onJump} style={{ border: '1px solid var(--border)' }}>
          <Icon name="jump" />
        </button>
      </div>
      <Seg<'sura' | 'juz'>
        label="Übersicht nach"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'sura', label: '114 Suren' },
          { value: 'juz', label: '30 Juz' },
        ]}
      />
      <div style={{ marginTop: 6 }}>
        {mode === 'sura' &&
          suras.map((s) => {
            const st = status[s.n - 1];
            const [from] = suraPages(edition, s.n);
            return (
              <button key={s.n} type="button" className="index-row" onClick={() => onOpen(from)}>
                <span className="num">{s.n}</span>
                <span className="name">
                  {s.tr}
                  <span className="sub" style={{ display: 'block', fontSize: 13 }}>
                    S. {from} · {s.ayahs} Ajat{label[st.state] ? ` · ${label[st.state]}` : ''}
                  </span>
                </span>
                <span className="leader" aria-hidden="true" />
                <span className="ar">{s.ar}</span>
              </button>
            );
          })}
        {mode === 'sura' && suras.length === 0 && <p className="empty">Keine Sura gefunden.</p>}
        {mode === 'juz' &&
          Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((j) => {
            const [a, b] = juzPages(edition, j);
            return (
              <button key={j} type="button" className="index-row" onClick={() => onOpen(a)}>
                <span className="num">{j}</span>
                <span className="name">
                  Juz {j}
                  <span className="sub" style={{ display: 'block', fontSize: 13 }}>
                    {pageRangeLabel(edition, a).split(' – ')[0]}
                  </span>
                </span>
                <span className="leader" aria-hidden="true" />
                <span className="state">
                  S. {a}–{b}
                </span>
              </button>
            );
          })}
      </div>
      {jumpSheet}
    </div>
  );
}
