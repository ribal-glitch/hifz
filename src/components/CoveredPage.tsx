import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMushafData } from '../data/quranData';
import { SURAS, type EditionId } from '../logic/quran';
import { useAudio } from '../audio';
import { Switch } from '../ui';
import { FONT, GAP_EM, ayahsFromLine, clearWidthCache, fitFontSize, wordLines } from './mushaf';

const FIRST_WORD_KEY = 'hifz:firstWord';

function readFirstWord(): boolean {
  try {
    return localStorage.getItem(FIRST_WORD_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Mushaf-Seite zum Abfragen direkt in der Liste: verdeckt, ein Tipp deckt die nächste Ajah auf.
 * Mit `from` beginnt das Verdecken erst ab dieser Zeile; mit `cue` bleibt nur die Zeile davor
 * als Stichwort stehen und alles darüber ist ebenfalls verdeckt (Prüfung mitten auf der Seite).
 * Mit `read` ist nichts verdeckt: zum Lesen, mit hervorgehobenen Zeilen `hl` und Wiederholungszähler
 * (ohne Zähler bei `listen`). Die gerade abgespielte Ajah ist immer markiert.
 */
export function CoveredPage({
  edition,
  page,
  from = 1,
  cue = false,
  read = false,
  listen = false,
  hl,
}: {
  edition: EditionId;
  page: number;
  from?: number;
  cue?: boolean;
  read?: boolean;
  listen?: boolean;
  hl?: [number, number];
}) {
  const data = useMushafData(edition);
  const audio = useAudio();
  const playing = audio.state?.page === page ? audio.state.ayah : null;
  const [count, setCount] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [firstWord, setFirstWordState] = useState(readFirstWord);
  const setFirstWord = (v: boolean) => {
    setFirstWordState(v);
    try {
      localStorage.setItem(FIRST_WORD_KEY, v ? '1' : '0');
    } catch {
      /* egal */
    }
  };

  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fontReady, setFontReady] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setWidth(Math.max(0, el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [data]);
  useEffect(() => {
    document.fonts.load(`100px ${FONT}`).then(() => {
      clearWidthCache();
      setFontReady(true);
    });
  }, []);

  if (data === null) return <div className="mushaf inline empty">Seite wird geladen …</div>;
  if (data === 'error') return <div className="mushaf inline empty">Die Quran-Daten konnten nicht geladen werden.</div>;
  const lines = data.layout.pages[page - 1];
  const text = data.text;
  const fs = fontReady && width ? fitFontSize(lines, text, width) : 20;
  const lineH = fs * 1.9;

  const plain = read || listen;
  const lineOf = wordLines(lines);
  const coverable = ayahsFromLine(lines, from);
  const open = new Set(coverable.slice(0, revealed));
  /** Wort verdeckt: Ajah noch nicht aufgedeckt (ab der Startzeile) oder bei `cue` alles über dem Stichwort */
  const wordHidden = (idx: number, wi: number) => {
    if (plain || showAll) return false;
    const n = lineOf.get(idx)?.[wi] ?? 0;
    if (n >= from) return !open.has(idx);
    return cue && n < from - 1;
  };
  const done = showAll || revealed >= coverable.length;
  const next = () => !plain && setRevealed((r) => Math.min(coverable.length, r + 1));

  return (
    <div className="covered-page">
      <div
        className={`mushaf inline${plain ? ' reading' : ''}`}
        ref={box}
        style={{ fontSize: fs }}
        onClick={next}
        aria-label={plain ? `Seite ${page}` : `Seite ${page}, verdeckt`}
      >
        {lines.map((line, i) => {
          const n = i + 1;
          const allHidden =
            line[0] === 't' &&
            line[1].every(([idx, a, b]) => Array.from({ length: b - a }, (_, k) => a + k).every((wi) => wordHidden(idx, wi)));
          const covered = allHidden && !firstWord;
          const isHl = (cue && n === from - 1) || (!!hl && n >= hl[0] && n <= hl[1]);
          const cls = ['mline', covered ? 'hidden' : '', isHl ? 'hl' : '', line[0] === 'h' ? 'sura-head' : '']
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
                  <div className="words" style={{ justifyContent: 'center', gap: `${GAP_EM * 2}em` }}>
                    {text.basmala.map((w, k) => (
                      <span key={k} className={playing === -1 ? 'w playing' : 'w'}>
                        {w}
                      </span>
                    ))}
                  </div>
                )}
                {line[0] === 't' && (
                  <div className="words" style={line[2] ? { width: `${line[2] * 100}%`, gap: `${GAP_EM}em` } : { gap: `${GAP_EM}em` }}>
                    {line[1].flatMap(([idx, a, b]) =>
                      text.ayahs[idx].slice(a, b).map((w, k) => {
                        const wi = a + k;
                        const isMarker = wi === text.ayahs[idx].length - 1;
                        // Hinweis: nur das erste Wort jeder Ajah (und die Ajah-Nummer) bleibt sichtbar
                        const masked = wordHidden(idx, wi) && !covered && !(firstWord && (wi === 0 || isMarker));
                        const cls = ['w', masked ? 'masked' : '', playing === idx ? 'playing' : ''].filter(Boolean).join(' ');
                        return (
                          <span key={`${idx}-${wi}`} className={cls}>
                            {w}
                          </span>
                        );
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
      {listen ? null : read ? (
        <div className="counter" aria-live="polite">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Wiederholungen</div>
            <div className="small">Ziel: etwa 10× flüssig lesen</div>
          </div>
          <button type="button" className="iconbtn" aria-label="Eine Wiederholung zurück" onClick={() => setCount(Math.max(0, count - 1))}>
            −
          </button>
          <span className="n">{count}</span>
          <button type="button" className="btn primary" aria-label="Wiederholung zählen" onClick={() => setCount(count + 1)}>
            +1
          </button>
        </div>
      ) : (
        <>
          <div className="switch-bar single">
            <Switch label="Erstes Wort jeder Ajah zeigen" on={firstWord} onChange={setFirstWord} />
          </div>
          <div className="hifz-bar">
            <button type="button" className="btn primary" onClick={next} disabled={done}>
              Nächste Ajah
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (done) {
                  setShowAll(false);
                  setRevealed(0);
                } else setShowAll(true);
              }}
            >
              {done ? 'Neu verdecken' : 'Alles zeigen'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
