import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { REPEAT_OPTIONS, ayahRangeLabel, ayahsForLines, rangeUrl, reciterById, sliceAyahs, useAudio } from '../audio';
import { AyahRange, ReciterSelect } from '../components/Listen';
import { FONT, GAP_EM, MIN_FS, ayahsFromLine, clearWidthCache, fitFontSize, wordLines } from '../components/mushaf';
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
import { useStore } from '../store';
import { Icon, Seg, Sheet, Switch } from '../ui';
import { TAJWEED_LEGEND, tajweedAyah, type Piece } from '../logic/tajweed';
import { TRANSLATIONS, useTranslation, type TranslationId } from '../data/translations';
import { suraStatus } from '../logic/stats';
import type { ReadTarget } from './Today';


/** Innenabstand der Seite oben und unten zusammen (siehe .mushaf) */
const PAGE_PAD_V = 26;

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

export function Read({
  target,
  onTargetUsed,
  onReading,
}: {
  target: ReadTarget | null;
  onTargetUsed: () => void;
  onReading: (open: boolean) => void;
}) {
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
  const [legend, setLegend] = useState(false);
  /** Richtung des letzten Umblätterns, für die kleine Animation */
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);
  /** Lesen beginnt mit der Suren-Übersicht; ein Sprungziel öffnet direkt die Seite */
  const [view, setView] = useState<'index' | 'page'>(() => (target ? 'page' : 'index'));
  // Bei jedem Start: Tajwīd an, Übersetzung und Verdecken aus
  const [tajweed, setTajweed] = useState(true);
  const [trans, setTrans] = useState(false);
  const [transChoice, setTransChoice] = usePref<TranslationId>('hifz:transChoice', 'bubenheim');
  useEffect(() => onReading(view === 'page'), [view, onReading]);

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
      setPageState((cur) => {
        setTurn(n > cur ? 'next' : n < cur ? 'prev' : null);
        return n;
      });
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
  // Breite des Textes (Seite ohne Innenabstand) und Höhe des freien Platzes für die Seite
  const box = useRef<HTMLDivElement>(null);
  const vp = useRef<HTMLDivElement>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [vpHeight, setVpHeight] = useState(0);
  const [fontReady, setFontReady] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    const v = vp.current;
    if (!el || !v) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setTextWidth(Math.max(0, el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
      setVpHeight(v.clientHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(v);
    measure();
    return () => ro.disconnect();
  }, [lines, view, trans]);
  useEffect(() => {
    document.fonts.load(`100px ${FONT}`).then(() => {
      clearWidthCache();
      setFontReady(true);
    });
  }, []);
  const fitW = useMemo(
    () => (lines && text && fontReady && textWidth ? fitFontSize(lines, text, textWidth) : 20),
    [lines, text, fontReady, textWidth],
  );
  // Die ganze Seite passt ohne Scrollen auf den Bildschirm: Zeilenhöhe füllt den freien Platz,
  // nur wenn der nicht reicht, wird die Schrift kleiner.
  let fs = fitW;
  let lineH = fitW * 1.9;
  if (!trans && lines && vpHeight) {
    const per = (vpHeight - PAGE_PAD_V) / lines.length;
    lineH = Math.min(fitW * 2.1, per);
    // unter 1,7 Zeilenhöhen stoßen Zeichen mit Vokalzeichen an die Nachbarzeilen
    if (lineH < fitW * 1.7) {
      fs = Math.max(MIN_FS, per / 1.7);
      lineH = per;
    }
  }

  // ---------- Hifz-Modus ----------
  // Ajah für Ajah aufdecken; verdeckt wird ab der Startzeile (eine Ajah, die davor beginnt, nur ab dort)
  const coverFrom = hl?.start ?? 1;
  const lineOf = useMemo(() => (lines ? wordLines(lines) : new Map<number, number[]>()), [lines]);
  const coverable = lines ? ayahsFromLine(lines, coverFrom) : [];
  const hiddenAyahs = new Set(hifz ? coverable.slice(revealed) : []);
  const wordHidden = (idx: number, wi: number) => hiddenAyahs.has(idx) && (lineOf.get(idx)?.[wi] ?? 0) >= coverFrom;
  const revealNext = () => setRevealed((r) => Math.min(coverable.length, r + 1));

  /** Ein Wort der Ajah, mit Tajwīd-Farben und ggf. ausgeblendet (Hinweis-Modus oder ganz verdeckt). */
  const renderWord = (idx: number, wi: number, w: string, masked: boolean, ayahWords: string[], full = false) => {
    const isMarker = wi === ayahWords.length - 1;
    const hide = full || (masked && !(wi === 0 || isMarker));
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

  // Am Laptop: Pfeiltasten blättern wie im Mushaf (links = weiter, rechts = zurück)
  useEffect(() => {
    if (view !== 'page') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft' && page < PAGE_COUNT) setPage(page + 1);
      else if (e.key === 'ArrowRight' && page > 1) setPage(page - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, page, setPage]);

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
    <div className={trans ? 'reader' : 'reader fit'}>
      <div className="reader-head">
        <div className="reader-bar">
          <button type="button" className="backbtn" aria-label="Zurück zur Suren-Übersicht" onClick={backToIndex}>
            <Icon name="next" />
          </button>
          <div className="sura-title">
            <h2>{title}</h2>
            <div>
              {single ? `Ajah ${a1 === a2 ? a1 : `${a1}–${a2}`}` : pageRangeLabel(ed, page)} · S. {page} · Juz {juz}
            </div>
          </div>
          {single && <span className="sura-ar">{SURAS[suras[0] - 1].ar}</span>}
          {tajweed && (
            <button type="button" className="iconbtn" aria-label="Tajwīd-Farben erklären" onClick={() => setLegend(true)}>
              <Icon name="info" />
            </button>
          )}
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
      </div>

      <div
        className="mushaf-viewport"
        ref={vp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          key={page}
          className={`${trans ? 'mushaf ayah-view' : 'mushaf'}${turn ? ` turn-${turn}` : ''}`}
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
              hiddenWord={wordHidden}
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
              // Zeile ganz verdeckt, wenn alle ihre Wörter zu verdeckten Ajat gehören
              const allHidden =
                line[0] === 't' &&
                line[1].every(([idx, a, b]) => Array.from({ length: b - a }, (_, k) => a + k).every((wi) => wordHidden(idx, wi)));
              const covered = allHidden && hint === 'lines';
              const cls = ['mline', isHl ? 'hl' : '', hl?.start === n ? 'start' : '', covered ? 'hidden' : '', line[0] === 'h' ? 'sura-head' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <div key={n} className={cls} style={{ height: `${lineH}px` }}>
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
                          text.ayahs[idx].slice(from, to).map((w, k) => {
                            const h = wordHidden(idx, from + k);
                            // Hinweis-Modus: Anfang und Ende jeder Ajah bleiben sichtbar, sonst ganz verdeckt
                            return renderWord(idx, from + k, w, h && hint === 'ayah', text.ayahs[idx], h && hint !== 'ayah' && !covered);
                          }),
                        )}
                      </div>
                    )}
                  </div>
                  {covered && <div className="cover" aria-hidden="true" />}
                </div>
              );
            })}
        </div>
        {/* kurz eingeblendet nach dem Umblättern */}
        {turn && (
          <div key={`badge-${page}`} className="page-badge" aria-live="polite">
            Seite {page}
          </div>
        )}
      </div>
      {/* Blättern mit der Maus (nur an Geräten mit Mauszeiger sichtbar) */}
      <button
        type="button"
        className="page-arrow next"
        aria-label="Nächste Seite"
        disabled={page >= PAGE_COUNT}
        onClick={() => setPage(page + 1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="page-arrow prev"
        aria-label="Vorherige Seite"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        ›
      </button>

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
        <div className="hifz-tools">
          <div className="switch-bar single">
            <Switch label="Anfang und Ende jeder Ajah zeigen" on={hint === 'ayah'} onChange={(v) => setHint(v ? 'ayah' : 'lines')} />
          </div>
          <div className="hifz-bar">
            <button type="button" className="btn primary" onClick={revealNext} disabled={revealed >= coverable.length}>
              Nächste Ajah
            </button>
            <button type="button" className="btn" onClick={() => setRevealed(revealed >= coverable.length ? 0 : coverable.length)}>
              {revealed >= coverable.length ? 'Neu verdecken' : 'Alles zeigen'}
            </button>
          </div>
        </div>
      )}

      {sel !== null && !hifz && !audio.state && <AyahBar ayah={sel} page={page} onClose={() => setSel(null)} />}

      {legend && (
        <Sheet title="Tajwīd-Farben" onClose={() => setLegend(false)}>
          <div className="tj-legend">
            {TAJWEED_LEGEND.map((l) => (
              <span key={l.c}>
                <i className={`dot tj-bg-${l.c}`} />
                <b className={`tj-${l.c}`}>{l.label}</b> {l.hint}
              </span>
            ))}
          </div>
        </Sheet>
      )}

      {listen && data && data !== 'error' && (
        <ListenSheet
          page={page}
          all={ayahsForLines(data.layout, page)}
          hl={hl?.from !== undefined && hl.to !== undefined ? ayahsForLines(data.layout, page, hl.from, hl.to).filter((a) => a >= 0) : null}
          onClose={() => setListen(false)}
          onPlay={(ayahs, label, repeatEach, rounds, reciter) => {
            setListen(false);
            void audio.play({ edition: ed, page, ayahs, label, repeatEach, rounds, reciter });
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
  all,
  hl,
  onClose,
  onPlay,
}: {
  page: number;
  /** Ajat der Seite in Lesereihenfolge, -1 = Basmala */
  all: number[];
  /** Ajat der hervorgehobenen Zeilen */
  hl: number[] | null;
  onClose: () => void;
  onPlay: (ayahs: number[], label: string, repeatEach: number, rounds: number, reciter: string) => void;
}) {
  const { profile, update } = useStore();
  const ayahs = all.filter((a) => a >= 0);
  const start = hl?.length ? hl : ayahs;
  const [from, setFrom] = useState(start[0]);
  const [to, setTo] = useState(start[start.length - 1]);
  const [rounds, setRounds] = useState(1);
  if (!profile || !ayahs.length) return null;
  const repeatEach = profile.repeatEach ?? 3;
  const reciter = reciterById(profile.reciter);
  const range = (
    <AyahRange
      ayahs={ayahs}
      from={from}
      to={to}
      onChange={(f, t) => {
        setFrom(f);
        setTo(t);
      }}
    />
  );
  // In claude.ai darf die App kein Audio von fremden Servern laden: dort spielt quran.com den Bereich ab
  if (IS_ARTIFACT)
    return (
      <Sheet title="Anhören" onClose={onClose}>
        <div className="stack">
          {range}
          <a className="btn primary block" href={rangeUrl(page, from, to)} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            <Icon name="play" /> {ayahRangeLabel(from, to)} auf quran.com
          </a>
          <p className="small" style={{ margin: 0 }}>
            In dieser Link-Version kann die App selbst kein Audio abspielen. Den Rezitator wählst du auf quran.com über die
            Wiedergabe-Leiste; er bleibt dort gespeichert.
          </p>
        </div>
      </Sheet>
    );
  return (
    <Sheet title="Anhören" onClose={onClose}>
      <div className="stack">
        {range}
        <ReciterSelect value={reciter.id} onChange={(id) => update((p) => ({ ...p, reciter: id }))} />
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
          onClick={() => onPlay(sliceAyahs(all, from, to), `S. ${page} · ${ayahRangeLabel(from, to)}`, repeatEach, rounds, reciter.id)}
        >
          <Icon name="play" /> Abspielen
        </button>
        <p className="small" style={{ margin: 0 }}>
          Zum Auswendiglernen hilft es, immer denselben Rezitator zu hören. Ein Tipp auf die Wiedergabe-Leiste ändert Rezitator
          und Bereich unterwegs. Audio von EveryAyah.com, nur mit Internet.
        </p>
      </div>
    </Sheet>
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

/** Lesen mit Übersetzung: Ajah für Ajah, die deutsche Bedeutung direkt unter dem arabischen Text. */
function AyahView({
  lines,
  text,
  transId,
  hiddenWord: isHidden,
  masked,
  playingAyah,
  sel,
  renderWord,
}: {
  lines: LineData[];
  text: TextData;
  transId: TranslationId;
  /** ob ein Wort einer Ajah verdeckt ist */
  hiddenWord: (idx: number, wi: number) => boolean;
  masked: boolean;
  playingAyah: number | null;
  sel: number | null;
  renderWord: (idx: number, wi: number, w: string, masked: boolean, ayahWords: string[], full?: boolean) => ReactNode;
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
        const hiddenWord = (wi: number) => isHidden(idx, wi);
        const allHidden = words.every((_, wi) => hiddenWord(wi));
        const anyHidden = words.some((_, wi) => hiddenWord(wi));
        const covered = allHidden && !masked;
        const word = (w: string, wi: number) => renderWord(idx, wi, w, hiddenWord(wi) && masked, words, hiddenWord(wi) && !masked && !covered);
        blocks.push(
          <div key={idx} className={`ayah-item${playingAyah === idx ? ' playing' : ''}${sel === idx ? ' sel' : ''}`} data-a={idx}>
            <div className={`ayah-ar${covered ? ' covered' : ''}`}>
              {words.slice(0, -2).map((w, wi) => word(w, wi))}
              {/* letztes Wort und Ajah-Nummer bleiben zusammen in einer Zeile */}
              <span className="ayah-end">{words.slice(-2).map((w, k) => word(w, words.length - 2 + k))}</span>
              {covered && <div className="cover" aria-hidden="true" />}
            </div>
            <p className={`tr-ayah${anyHidden ? ' tr-hidden' : ''}`}>
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
