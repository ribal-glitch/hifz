import { useEffect, useState } from 'react';
import type { EditionId } from './meta.generated';
import { SURA_AYAH_START } from './meta.generated';

export interface TextData {
  source: string;
  /** Wörter der Basmala (aus 1:1, ohne Nummer) */
  basmala: string[];
  /** Wörter jeder Ajah; das letzte Element ist die Ajah-Nummer */
  ayahs: string[][];
}

/** [Ajah-Index, erstes Wort, Ende (exklusiv)] */
export type LinePart = [number, number, number];
export type LineData = ['h', number] | ['b'] | ['t', LinePart[]] | ['t', LinePart[], number];

export interface LayoutData {
  edition: EditionId;
  pages: LineData[][];
}

const base = import.meta.env.BASE_URL;
let textPromise: Promise<TextData> | null = null;
const layoutPromises: Partial<Record<EditionId, Promise<LayoutData>>> = {};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function loadText(): Promise<TextData> {
  textPromise ??= fetchJson<TextData>('data/text.json').catch((e) => {
    textPromise = null;
    throw e;
  });
  return textPromise;
}

const layoutCache: Partial<Record<EditionId, LayoutData>> = {};

export function loadLayout(ed: EditionId): Promise<LayoutData> {
  layoutPromises[ed] ??= fetchJson<LayoutData>(`data/layout-${ed}.json`)
    .then((l) => (layoutCache[ed] = l))
    .catch((e) => {
      delete layoutPromises[ed];
      throw e;
    });
  return layoutPromises[ed]!;
}

/** Schon geladenes Layout (oder null), für Aufrufe, die sofort reagieren müssen. */
export function cachedLayout(ed: EditionId): LayoutData | null {
  return layoutCache[ed] ?? null;
}

export function useMushafData(ed: EditionId): { text: TextData; layout: LayoutData } | 'error' | null {
  const [state, setState] = useState<{ text: TextData; layout: LayoutData } | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    Promise.all([loadText(), loadLayout(ed)])
      .then(([text, layout]) => alive && setState({ text, layout }))
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [ed]);
  return state;
}

/** Globaler Ajah-Index → [Sura, Ajah] */
export function ayahKey(idx: number): [number, number] {
  let lo = 0;
  let hi = SURA_AYAH_START.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SURA_AYAH_START[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return [lo + 1, idx - SURA_AYAH_START[lo] + 1];
}
