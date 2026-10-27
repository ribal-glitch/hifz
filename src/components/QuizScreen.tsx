import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ayahKey, useMushafData, type LineData, type TextData } from '../data/quranData';
import type { QuizItem } from '../logic/profile';
import { SURAS, suraName, type EditionId } from '../logic/quran';
import { Icon } from '../ui';
import { Confetti } from './Celebrate';
import { FONT, GAP_EM, MIN_FS, clearWidthCache, fitFontSize } from './mushaf';

/** Ab welcher Ayah gefragt wird: die erste Ayah, die auf oder nach der Zeile beginnt. */
function cueAyah(lines: LineData[], line: number): number | null {
  for (let i = line - 1; i < lines.length; i++) {
    const l = lines[i];
    if (l[0] === 't') for (const [idx, from] of l[1]) if (from === 0) return idx;
  }
  const l = lines[line - 1];
  return l && l[0] === 't' ? l[1][0][0] : null;
}

/** Ayat einer Seite in Lesereihenfolge. */
function pageAyahList(lines: LineData[]): number[] {
  const out: number[] = [];
  for (const l of lines) if (l[0] === 't') for (const [idx] of l[1]) if (!out.includes(idx)) out.push(idx);
  return out;
}

const ayahName = (idx: number) => {
  const [s, a] = ayahKey(idx);
  return `${suraName(s)} ${a}`;
};

/**
 * Prüfung im Vollbild: die Mushaf-Seite ist verdeckt bis auf die Ayah, ab der gefragt wird.
 * Ein Tipp deckt die nächste Ayah auf; danach abhaken oder Fehler ankreuzen.
 * Bei einem Übergang steht die letzte Ayah der Vorseite als Stichwort über der Seite.
 */
export function QuizScreen({
  edition,
  questions,
  title,
  onAnswer,
  onClose,
  onMore,
}: {
  edition: EditionId;
  questions: QuizItem[];
  title: string;
  onAnswer: (index: number, ok: boolean) => void;
  onClose: () => void;
  /** „Noch eine Frage“ (Mini-Prüfung) */
  onMore?: () => void;
}) {
  const data = useMushafData(edition);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => questions.map(() => null));
  const [revealed, setRevealed] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => setAnswers((a) => [...a, ...questions.slice(a.length).map(() => null)]), [questions]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth - 16, h: el.clientHeight - 16 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [data, at]);
  useEffect(() => {
    document.fonts.load(`100px ${FONT}`).then(() => {
      clearWidthCache();
      setFontReady(true);
    });
  }, []);
  // Vollbild: Seite darunter nicht mitscrollen
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const finished = at >= questions.length;
  const q = finished ? null : questions[at];
  const right = answers.filter((a) => a === true).length;
  const success = finished && questions.length > 0 && right / questions.length >= 0.8;

  const answer = (ok: boolean) => {
    onAnswer(at, ok);
    setAnswers((a) => a.map((x, i) => (i === at ? ok : x)));
    setRevealed(0);
    setShowAll(false);
    setAt(at + 1);
  };

  let body = null;
  let cueBox = null;
  let info = '';
  if (q && data && data !== 'error') {
    // Übergang: Seite danach, Stichwort ist die letzte Ayah der Vorseite
    const page = q.kind === 'transition' ? q.page + 1 : q.page;
    const lines = data.layout.pages[page - 1];
    const text = data.text;
    const list = pageAyahList(lines);
    let visible: number[];
    let order: number[];
    if (q.kind === 'transition') {
      const prev = pageAyahList(data.layout.pages[q.page - 1]);
      const cue = prev[prev.length - 1];
      cueBox = (
        <div className="quiz-cue" dir="rtl">
          {text.ayahs[cue].join(' ')}
        </div>
      );
      info = `${ayahName(cue)} → weiter auf S. ${page}`;
      visible = [];
      order = list;
    } else {
      const cue = cueAyah(lines, q.line ?? 1) ?? list[0];
      info = `ab ${ayahName(cue)} · S. ${page}`;
      visible = [cue];
      order = list.slice(list.indexOf(cue) + 1);
    }
    const shown = new Set(showAll ? list : [...visible, ...order.slice(0, revealed)]);
    body = (
      <QuizPage
        lines={lines}
        text={text}
        shown={shown}
        cue={new Set(visible)}
        width={size.w}
        height={size.h - (cueBox ? 64 : 0)}
        fontReady={fontReady}
        onTap={() => setRevealed((r) => Math.min(order.length, r + 1))}
      />
    );
  }

  return (
    <div className="quiz-screen" role="dialog" aria-modal="true" aria-label={title}>
      <header className="quiz-top">
        <button type="button" className="iconbtn" aria-label="Schließen" onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="quiz-title">
          <b>{title}</b>
          {!finished && <span>{info}</span>}
        </div>
        {questions.length > 1 && !finished && (
          <div className="quiz-dots" aria-label={`Frage ${at + 1} von ${questions.length}`}>
            {questions.map((_, i) => (
              <i key={i} className={answers[i] === true ? 'ok' : answers[i] === false ? 'err' : i === at ? 'now' : ''} />
            ))}
          </div>
        )}
      </header>

      {!finished ? (
        <>
          <div className="quiz-stage" ref={box}>
            {cueBox}
            {data === null && <div className="empty">Seite wird geladen …</div>}
            {body}
          </div>
          <div className="quiz-actions">
            <button type="button" className="qbtn" aria-label="Nächste Ayah aufdecken" onClick={() => setRevealed((r) => r + 1)}>
              <Icon name="reveal" />
            </button>
            <button type="button" className="qbtn" aria-label="Alles aufdecken" onClick={() => setShowAll(true)}>
              <Icon name="revealAll" />
            </button>
            <button type="button" className="qbtn ok" aria-label="Konnte ich" onClick={() => answer(true)}>
              <Icon name="check" />
            </button>
            <button type="button" className="qbtn err" aria-label="Fehler" onClick={() => answer(false)}>
              <Icon name="cross" />
            </button>
          </div>
        </>
      ) : (
        <div className="quiz-result">
          {success && <Confetti />}
          <div className="quiz-score">
            <span className="emoji" aria-hidden="true">
              {success ? '🎉' : '💪'}
            </span>
            <b>
              {right} / {questions.length}
            </b>
          </div>
          <div className="quiz-dots big">
            {answers.map((a, i) => (
              <i key={i} className={a ? 'ok' : 'err'} />
            ))}
          </div>
          {onMore && (
            <button type="button" className="btn primary block" onClick={onMore}>
              <Icon name="quiz" /> Noch eine Frage
            </button>
          )}
          <button type="button" className="btn block" onClick={onClose}>
            Fertig
          </button>
        </div>
      )}
    </div>
  );
}

function QuizPage({
  lines,
  text,
  shown,
  cue,
  width,
  height,
  fontReady,
  onTap,
}: {
  lines: LineData[];
  text: TextData;
  shown: Set<number>;
  cue: Set<number>;
  width: number;
  height: number;
  fontReady: boolean;
  onTap: () => void;
}) {
  const fitW = fontReady && width > 0 ? fitFontSize(lines, text, width) : 20;
  // so groß wie möglich: Breite begrenzt die Schrift, die Höhe den Zeilenabstand
  const per = height > 0 ? height / lines.length : fitW * 2;
  const fs = Math.max(MIN_FS, Math.min(fitW, per / 1.6));
  const lineH = Math.min(per, fs * 2.2);
  return (
    <div className="mushaf quiz-page" style={{ fontSize: fs }} onClick={onTap}>
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
        const allHidden = line[1].every(([idx]) => !shown.has(idx));
        return (
          <div key={i} className={`mline${allHidden ? ' hidden' : ''}`} style={{ height: lineH }}>
            <div className="mtext">
              <div className="words" style={line[2] ? { width: `${line[2] * 100}%`, gap: `${GAP_EM}em` } : { gap: `${GAP_EM}em` }}>
                {line[1].flatMap(([idx, a, b]) =>
                  text.ayahs[idx].slice(a, b).map((w, k) => (
                    <span key={`${idx}-${a + k}`} className={!shown.has(idx) ? 'w masked' : cue.has(idx) ? 'w cue' : 'w'}>
                      {w}
                    </span>
                  )),
                )}
              </div>
            </div>
            {allHidden && <div className="cover" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
