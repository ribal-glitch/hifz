import type { LineData, TextData } from '../data/quranData';

export const FONT = '"KFGQPC Hafs"';
export const GAP_EM = 0.12;
const MAX_FS = 30;
export const MIN_FS = 14;

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

/** Nach dem Laden der Mushaf-Schrift neu messen. */
export function clearWidthCache() {
  widthCache.clear();
}

function lineWords(line: LineData, text: TextData): string[] {
  if (line[0] !== 't') return [];
  return line[1].flatMap(([idx, from, to]) => text.ayahs[idx].slice(from, to));
}

/** Größte Schriftgröße, bei der jede Zeile der Seite in die Breite passt. */
export function fitFontSize(lines: LineData[], text: TextData, width: number): number {
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

/** Zu jeder Ajah: auf welcher Zeile der Seite jedes ihrer Wörter steht. */
export function wordLines(lines: LineData[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  lines.forEach((l, i) => {
    if (l[0] !== 't') return;
    for (const [idx, from, to] of l[1]) {
      const arr = out.get(idx) ?? [];
      for (let w = from; w < to; w++) arr[w] = i + 1;
      out.set(idx, arr);
    }
  });
  return out;
}
