import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { del, get, set } from 'idb-keyval';
import { logicalToday, type ISODate } from './logic/dates';
import { ensureDay } from './logic/plan';
import { newId, type Profile } from './logic/profile';

export type Theme = 'system' | 'light' | 'dark';

export interface ProfileMeta {
  id: string;
  name: string;
  color: string;
}

interface AppMeta {
  version: 1;
  profiles: ProfileMeta[];
  lastProfileId: string | null;
  theme: Theme;
}

const META_KEY = 'hifz:meta';
const profileKey = (id: string) => `hifz:profile:${id}`;
const EMPTY_META: AppMeta = { version: 1, profiles: [], lastProfileId: null, theme: 'system' };

// IndexedDB, bei Problemen (z. B. privater Modus) ersatzweise localStorage.
const storage = {
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
  async set(key: string, value: unknown) {
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
  async del(key: string) {
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

export interface ProfileFile {
  app: 'hifz';
  type: 'profile';
  version: 1;
  exportedAt: string;
  profile: Profile;
}

export function parseProfileFile(text: string): Profile | null {
  try {
    const data = JSON.parse(text) as Partial<ProfileFile>;
    const p = data?.profile;
    if (data?.app !== 'hifz' || !p || typeof p.id !== 'string' || typeof p.name !== 'string') return null;
    if (!Array.isArray(p.bestand) || typeof p.days !== 'object' || typeof p.dars !== 'object') return null;
    return p;
  } catch {
    return null;
  }
}

interface Store {
  ready: boolean;
  today: ISODate;
  profiles: ProfileMeta[];
  theme: Theme;
  profile: Profile | null;
  openProfile: (id: string) => Promise<void>;
  addProfile: (p: Profile) => Promise<void>;
  closeProfile: () => void;
  update: (fn: (p: Profile) => Profile) => void;
  deleteProfile: (id: string) => Promise<void>;
  importProfile: (p: Profile, asCopy: boolean) => Promise<void>;
  setTheme: (t: Theme) => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider fehlt');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState<AppMeta>(EMPTY_META);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [today, setToday] = useState<ISODate>(() => logicalToday());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const pending = useRef<Profile | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) void storage.set(profileKey(p.id), p);
  }, []);

  const saveMeta = useCallback((m: AppMeta) => {
    setMeta(m);
    void storage.set(META_KEY, m);
  }, []);

  // Laden
  useEffect(() => {
    (async () => {
      const m = (await storage.get<AppMeta>(META_KEY)) ?? EMPTY_META;
      setMeta(m);
      if (m.lastProfileId) {
        const p = await storage.get<Profile>(profileKey(m.lastProfileId));
        if (p) setProfile(ensureDay(p, logicalToday()));
      }
      setReady(true);
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* nicht unterstützt */
      }
    })();
  }, []);

  // Tageswechsel erkennen (auch wenn die App im Hintergrund war)
  useEffect(() => {
    const tick = () => setToday(logicalToday());
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
      else tick();
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  // Plan des (neuen) Tages festlegen
  useEffect(() => {
    if (profile && !profile.days[today]?.muraja) {
      const p = ensureDay(profile, today);
      setProfile(p);
      pending.current = p;
      flush();
    }
  }, [today, profile, flush]);

  // Darstellung
  useEffect(() => {
    const root = document.documentElement;
    if (meta.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', meta.theme);
  }, [meta.theme]);

  const update = useCallback(
    (fn: (p: Profile) => Profile) => {
      setProfile((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        pending.current = next;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 300);
        if (next.name !== prev.name || next.color !== prev.color) {
          setMeta((m) => {
            const mm = { ...m, profiles: m.profiles.map((x) => (x.id === next.id ? { ...x, name: next.name, color: next.color } : x)) };
            void storage.set(META_KEY, mm);
            return mm;
          });
        }
        return next;
      });
    },
    [flush],
  );

  const openProfile = useCallback(
    async (id: string) => {
      flush();
      const p = await storage.get<Profile>(profileKey(id));
      if (!p) return;
      setProfile(ensureDay(p, logicalToday()));
      saveMeta({ ...meta, lastProfileId: id });
    },
    [flush, meta, saveMeta],
  );

  const addProfile = useCallback(
    async (p: Profile) => {
      flush();
      await storage.set(profileKey(p.id), p);
      const profiles = [...meta.profiles.filter((x) => x.id !== p.id), { id: p.id, name: p.name, color: p.color }];
      saveMeta({ ...meta, profiles, lastProfileId: p.id });
      setProfile(ensureDay(p, logicalToday()));
    },
    [flush, meta, saveMeta],
  );

  const closeProfile = useCallback(() => {
    flush();
    setProfile(null);
  }, [flush]);

  const deleteProfile = useCallback(
    async (id: string) => {
      if (pending.current?.id === id) pending.current = null;
      await storage.del(profileKey(id));
      saveMeta({
        ...meta,
        profiles: meta.profiles.filter((x) => x.id !== id),
        lastProfileId: meta.lastProfileId === id ? null : meta.lastProfileId,
      });
      if (profile?.id === id) setProfile(null);
    },
    [meta, profile, saveMeta],
  );

  const importProfile = useCallback(
    async (p: Profile, asCopy: boolean) => {
      const prof = asCopy ? { ...p, id: newId(), name: `${p.name} (Kopie)` } : p;
      await addProfile(prof);
    },
    [addProfile],
  );

  const setTheme = useCallback((theme: Theme) => saveMeta({ ...meta, theme }), [meta, saveMeta]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      today,
      profiles: meta.profiles,
      theme: meta.theme,
      profile,
      openProfile,
      addProfile,
      closeProfile,
      update,
      deleteProfile,
      importProfile,
      setTheme,
      toast,
      toastMsg,
    }),
    [ready, today, meta, profile, openProfile, addProfile, closeProfile, update, deleteProfile, importProfile, setTheme, toast, toastMsg],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Datei speichern: auf dem Handy über „Teilen“ (z. B. „In Dateien sichern“), sonst als Download. */
export async function saveFile(name: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
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

export function profileFile(p: Profile): { name: string; text: string } {
  const data: ProfileFile = { app: 'hifz', type: 'profile', version: 1, exportedAt: new Date().toISOString(), profile: p };
  const safe = p.name.replace(/[^\p{L}\p{N}_-]+/gu, '-');
  return { name: `hifz-${safe}-${logicalToday()}.json`, text: JSON.stringify(data, null, 1) };
}
