import { del, get, set } from 'idb-keyval';
import { logicalToday } from './logic/dates';
import type { Profile } from './logic/profile';

/**
 * Die App läuft in zwei Formen: als installierbare Web-App (GitHub Pages) und als
 * Link-Version in claude.ai. Dort gibt es keinen Service Worker und kein Audio von
 * fremden Servern, dafür speichert die App im Claude-Konto des Nutzers.
 */
export const IS_ARTIFACT = import.meta.env.VITE_TARGET === 'artifact';

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

export async function claudeUse<T>(name: string): Promise<T | null> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return null;
  try {
    return ((await host.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

export interface Backend {
  /** 'cloud' = im Claude-Konto (geräteübergreifend), 'local' = nur in diesem Browser */
  kind: 'cloud' | 'local';
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: Record<string, unknown>): Promise<void>;
  del(key: string): Promise<void>;
}

// IndexedDB, bei Problemen (z. B. privater Modus) ersatzweise localStorage.
export const localBackend: Backend = {
  kind: 'local',
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await get<T>(key);
    } catch {
      try {
        const v = localStorage.getItem(key);
        return v ? (JSON.parse(v) as T) : undefined;
      } catch {
        return undefined;
      }
    }
  },
  async set(key, value) {
    try {
      await set(key, value);
    } catch {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* nichts zu tun */
      }
    }
  },
  async del(key) {
    try {
      await del(key);
    } catch {
      /* nichts zu tun */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* nichts zu tun */
    }
  },
};

interface DocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface Db {
  doc(path: string): DocRef;
}
interface UserCap {
  id(): Promise<string | null>;
  can(name: string): Promise<boolean | null>;
}

/** Hält ein Profil unter der Dokumentgrenze von 256 KiB: alte Tage und Zwischenstände entfernen. */
export function compactProfile(p: Profile): Profile {
  const today = logicalToday();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 400);
  const keep = cutoff.toISOString().slice(0, 10);
  const days = Object.fromEntries(Object.entries(p.days).filter(([d]) => d >= keep));
  const pages = Object.fromEntries(
    Object.entries(p.pages).map(([k, s]) => {
      if (s.d === today || !s.prev) return [k, s];
      const { prev: _drop, ...rest } = s;
      return [k, rest];
    }),
  );
  return { ...p, days, pages };
}

/** Speicher im Claude-Konto: jede Person hat einen privaten Bereich (data/users/<id>). */
export async function cloudBackend(): Promise<Backend | null> {
  const [db, user] = await Promise.all([claudeUse<Db>('db'), claudeUse<UserCap>('user')]);
  if (!db || !user) return null;
  const uid = await user.id().catch(() => null);
  if (!uid) return null;
  if ((await user.can('data.write').catch(() => null)) === false) return null;
  const docId = (key: string) => (key === 'hifz:meta' ? 'meta' : `p-${key.replace('hifz:profile:', '')}`);
  const ref = (key: string) => db.doc(`data/users/${uid}/${docId(key)}`);
  return {
    kind: 'cloud',
    async get<T>(key: string) {
      const snap = await ref(key).get();
      return snap.exists ? (structuredClone(snap.data()) as T) : undefined;
    },
    async set(key, value) {
      const body = key.startsWith('hifz:profile:') ? compactProfile(value as unknown as Profile) : value;
      await ref(key).set(JSON.parse(JSON.stringify(body)) as Record<string, unknown>);
    },
    async del(key) {
      await ref(key).delete();
    },
  };
}

interface Downloads {
  save(req: { filename: string; data: string }): Promise<{ status: string }>;
}

/** Datei anbieten: in claude.ai über die Download-Funktion, sonst Teilen oder Download. */
export async function saveFile(name: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled' | 'unavailable'> {
  if (IS_ARTIFACT) {
    const dl = await claudeUse<Downloads>('downloads');
    if (!dl) return 'unavailable';
    try {
      await dl.save({ filename: name, data: text });
      return 'downloaded';
    } catch (e) {
      return (e as { code?: string }).code === 'unavailable' ? 'unavailable' : 'cancelled';
    }
  }
  const file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/** Link zur Rezitation auf quran.com (für die Link-Version ohne eigenen Player). */
export function quranComUrl(sura: number, from: number, to: number): string {
  return from === to ? `https://quran.com/${sura}/${from}` : `https://quran.com/${sura}/${from}-${to}`;
}

export function quranComPageUrl(page: number): string {
  return `https://quran.com/page/${page}`;
}
