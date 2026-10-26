import { useEffect, useState } from 'react';

export type TranslationId = 'bubenheim' | 'aburida';

/** Die zwei deutschen Übersetzungen, die auch quran.com anbietet. */
export const TRANSLATIONS: { id: TranslationId; short: string; name: string; source: string }[] = [
  { id: 'bubenheim', short: 'Bubenheim & Elyas', name: 'Frank Bubenheim und Nadeem Elyas', source: 'Quelle: QuranEnc.com' },
  { id: 'aburida', short: 'Abu Rida', name: 'Abu Rida Muhammad Ibn Ahmad Ibn Rassoul', source: 'Quelle: Tanzil.net' },
];

const cache: Partial<Record<TranslationId, Promise<string[]>>> = {};

function load(id: TranslationId): Promise<string[]> {
  cache[id] ??= fetch(`${import.meta.env.BASE_URL}data/tr-${id}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<string[]>;
    })
    .catch((e) => {
      delete cache[id];
      throw e;
    });
  return cache[id]!;
}

/** Übersetzung laden (einmal je Sitzung); null = lädt noch. */
export function useTranslation(id: TranslationId): string[] | 'error' | null {
  const [v, setV] = useState<string[] | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    setV(null);
    load(id)
      .then((t) => alive && setV(t))
      .catch(() => alive && setV('error'));
    return () => {
      alive = false;
    };
  }, [id]);
  return v;
}
