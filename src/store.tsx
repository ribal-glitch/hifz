import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { logicalToday, type ISODate } from './logic/dates';
import { ensureDay } from './logic/plan';
import { newId, type Profile } from './logic/profile';
import { IS_ARTIFACT, cloudBackend, localBackend, type Backend } from './platform';
import { ACCOUNTS_ENABLED, accountBackend, currentUser, logOut, signIn, signUp, type AccountUser } from './account';

const DEVICE_ONLY_KEY = 'hifz:deviceOnly';

export { saveFile } from './platform';

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
  /** Wo die Daten liegen: im Konto oder nur in diesem Browser */
  storageKind: Backend['kind'];
  /** angemeldetes Konto (App-Version mit Firebase) */
  account: AccountUser | null;
  /** Anmeldung nötig, bevor es losgeht */
  needLogin: boolean;
  login: (mode: 'signin' | 'signup', email: string, password: string) => Promise<void>;
  continueWithoutAccount: () => Promise<void>;
  logout: () => Promise<void>;
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
  const [storageKind, setStorageKind] = useState<Backend['kind']>('local');
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const backend = useRef<Backend>(localBackend);
  const pending = useRef<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;
  const timer = useRef<number | undefined>(undefined);
  // Schreibvorgänge je Schlüssel nacheinander; liegt schon einer an, gewinnt der neueste Stand.
  const writes = useRef(new Map<string, { running: boolean; next: Record<string, unknown> | null }>());

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  const write = useCallback(
    (key: string, value: Record<string, unknown>) => {
      const w = writes.current.get(key) ?? { running: false, next: null };
      writes.current.set(key, w);
      w.next = value;
      if (w.running) return;
      w.running = true;
      void (async () => {
        while (w.next) {
          const v = w.next;
          w.next = null;
          try {
            await backend.current.set(key, v);
          } catch {
            if (backend.current.kind === 'cloud') {
              // Konto-Speicher nicht beschreibbar: ab jetzt in diesem Browser speichern
              backend.current = localBackend;
              setStorageKind('local');
              toast('Speichern im Claude-Konto geht hier nicht – deine Daten bleiben auf diesem Gerät.');
              await localBackend.set(key, v);
            }
          }
        }
        w.running = false;
      })();
    },
    [toast],
  );

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) write(profileKey(p.id), p as unknown as Record<string, unknown>);
  }, [write]);

  const saveMeta = useCallback(
    (m: AppMeta) => {
      setMeta(m);
      write(META_KEY, m as unknown as Record<string, unknown>);
    },
    [write],
  );

  /** Übernimmt einmalig, was vorher nur in diesem Browser lag, wenn das Konto noch leer ist. */
  const migrateLocal = useCallback(async (cloud: Backend) => {
    if (await cloud.get(META_KEY)) return;
    const localMeta = await localBackend.get<AppMeta>(META_KEY);
    if (!localMeta?.profiles.length) return;
    for (const pm of localMeta.profiles) {
      const lp = await localBackend.get<Profile>(profileKey(pm.id));
      if (lp) await cloud.set(profileKey(pm.id), lp as unknown as Record<string, unknown>);
    }
    await cloud.set(META_KEY, localMeta as unknown as Record<string, unknown>);
  }, []);

  /** Stand aus dem aktuellen Speicher laden. */
  const loadAll = useCallback(async () => {
    const store = backend.current;
    const m = (await store.get<AppMeta>(META_KEY).catch(() => undefined)) ?? EMPTY_META;
    setMeta(m);
    setProfile(null);
    if (m.lastProfileId) {
      const p = await store.get<Profile>(profileKey(m.lastProfileId)).catch(() => undefined);
      if (p) setProfile(ensureDay(p, logicalToday()));
    }
  }, []);

  const enterAccount = useCallback(
    async (user: AccountUser) => {
      const cloud = accountBackend(user.uid);
      try {
        await migrateLocal(cloud);
      } catch {
        /* offline: später erneut */
      }
      backend.current = cloud;
      setStorageKind('cloud');
      setAccount(user);
      setNeedLogin(false);
      await loadAll();
    },
    [loadAll, migrateLocal],
  );

  // Laden: Konto (Firebase in der App, Claude-Konto in der Link-Version), sonst Browser
  useEffect(() => {
    (async () => {
      if (IS_ARTIFACT) {
        const cloud = await cloudBackend().catch(() => null);
        if (cloud) {
          backend.current = cloud;
          setStorageKind('cloud');
          try {
            await migrateLocal(cloud);
          } catch {
            backend.current = localBackend;
            setStorageKind('local');
          }
        }
      } else if (ACCOUNTS_ENABLED) {
        const user = await currentUser();
        if (user) {
          await enterAccount(user);
          setReady(true);
          return;
        }
        let deviceOnly = false;
        try {
          deviceOnly = localStorage.getItem(DEVICE_ONLY_KEY) === '1';
        } catch {
          /* egal */
        }
        if (!deviceOnly) {
          setNeedLogin(true);
          setReady(true);
          return;
        }
      }
      await loadAll();
      setReady(true);
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* nicht unterstützt */
      }
    })();
  }, [loadAll, migrateLocal, enterAccount]);

  const login = useCallback(
    async (mode: 'signin' | 'signup', email: string, password: string) => {
      const user = mode === 'signup' ? await signUp(email, password) : await signIn(email, password);
      await enterAccount(user);
    },
    [enterAccount],
  );

  const continueWithoutAccount = useCallback(async () => {
    try {
      localStorage.setItem(DEVICE_ONLY_KEY, '1');
    } catch {
      /* egal */
    }
    backend.current = localBackend;
    setStorageKind('local');
    setNeedLogin(false);
    await loadAll();
  }, [loadAll]);

  const logout = useCallback(async () => {
    flush();
    await logOut();
    try {
      localStorage.removeItem(DEVICE_ONLY_KEY);
    } catch {
      /* egal */
    }
    backend.current = localBackend;
    setStorageKind('local');
    setAccount(null);
    setProfile(null);
    setMeta(EMPTY_META);
    setNeedLogin(true);
  }, [flush]);

  // Tageswechsel erkennen; beim Zurückkehren den neueren Stand von einem anderen Gerät holen
  useEffect(() => {
    const tick = () => setToday(logicalToday());
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        flush();
        return;
      }
      tick();
      const cur = profileRef.current;
      if (backend.current.kind !== 'cloud' || pending.current || !cur) return;
      void backend.current
        .get<Profile>(profileKey(cur.id))
        .then((remote) => {
          if (remote && (remote.updatedAt ?? '') > (cur.updatedAt ?? '') && !pending.current) {
            setProfile((now) => (now && now.id === remote.id ? ensureDay(remote, logicalToday()) : now));
          }
        })
        .catch(() => {});
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
        const next = { ...fn(prev), updatedAt: new Date().toISOString() };
        pending.current = next;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 400);
        if (next.name !== prev.name || next.color !== prev.color) {
          setMeta((m) => {
            const mm = { ...m, profiles: m.profiles.map((x) => (x.id === next.id ? { ...x, name: next.name, color: next.color } : x)) };
            write(META_KEY, mm as unknown as Record<string, unknown>);
            return mm;
          });
        }
        return next;
      });
    },
    [flush, write],
  );

  const openProfile = useCallback(
    async (id: string) => {
      flush();
      const p = await backend.current.get<Profile>(profileKey(id)).catch(() => undefined);
      if (!p) return;
      setProfile(ensureDay(p, logicalToday()));
      saveMeta({ ...meta, lastProfileId: id });
    },
    [flush, meta, saveMeta],
  );

  const addProfile = useCallback(
    async (p: Profile) => {
      flush();
      write(profileKey(p.id), p as unknown as Record<string, unknown>);
      const profiles = [...meta.profiles.filter((x) => x.id !== p.id), { id: p.id, name: p.name, color: p.color }];
      saveMeta({ ...meta, profiles, lastProfileId: p.id });
      setProfile(ensureDay(p, logicalToday()));
    },
    [flush, meta, saveMeta, write],
  );

  const closeProfile = useCallback(() => {
    flush();
    setProfile(null);
  }, [flush]);

  const deleteProfile = useCallback(
    async (id: string) => {
      if (pending.current?.id === id) pending.current = null;
      await backend.current.del(profileKey(id)).catch(() => {});
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
      storageKind,
      account,
      needLogin,
      login,
      continueWithoutAccount,
      logout,
    }),
    [
      ready,
      today,
      meta,
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
      storageKind,
      account,
      needLogin,
      login,
      continueWithoutAccount,
      logout,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function profileFile(p: Profile): { name: string; text: string } {
  const data: ProfileFile = { app: 'hifz', type: 'profile', version: 1, exportedAt: new Date().toISOString(), profile: p };
  const safe = p.name.replace(/[^\p{L}\p{N}_-]+/gu, '-');
  return { name: `hifz-${safe}-${logicalToday()}.json`, text: JSON.stringify(data, null, 1) };
}
