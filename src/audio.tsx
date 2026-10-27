import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ayahKey, cachedLayout, loadLayout, type LayoutData } from './data/quranData';
import { suraName, type EditionId } from './logic/quran';
import { quranComPageUrl, quranComUrl } from './platform';
import { useStore } from './store';

export interface Reciter {
  /** Ordner auf everyayah.com */
  id: string;
  name: string;
  style: string;
}

/** Bekannte Rezitatoren (Hafs ʿan ʿĀṣim), Audio pro Ayah von EveryAyah.com */
export const RECITERS: Reciter[] = [
  { id: 'Husary_128kbps', name: 'Maḥmūd Khalīl al-Ḥuṣarī', style: 'Murattal' },
  { id: 'Husary_Muallim_128kbps', name: 'Maḥmūd Khalīl al-Ḥuṣarī', style: 'Muʿallim – Lehr-Rezitation zum Nachsprechen' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Muḥammad Ṣiddīq al-Minshāwī', style: 'Murattal' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'ʿAbd al-Bāsiṭ ʿAbd aṣ-Ṣamad', style: 'Murattal' },
  { id: 'Alafasy_128kbps', name: 'Mishārī Rāshid al-ʿAfāsī', style: 'Murattal' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'ʿAbd ar-Raḥmān as-Sudais', style: 'Murattal' },
  { id: 'Saood_ash-Shuraym_128kbps', name: 'Saʿūd ash-Shuraim', style: 'Murattal' },
  { id: 'MaherAlMuaiqly128kbps', name: 'Māhir al-Muʿaiqlī', style: 'Murattal' },
  { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'Abū Bakr ash-Shāṭirī', style: 'Murattal' },
  { id: 'Ghamadi_40kbps', name: 'Saʿd al-Ghāmidī', style: 'Murattal' },
  { id: 'Hudhaify_128kbps', name: 'ʿAlī al-Ḥudhaifī', style: 'Murattal' },
  { id: 'Muhammad_Ayyoub_128kbps', name: 'Muḥammad Ayyūb', style: 'Murattal' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yāsir ad-Dausarī', style: 'Murattal' },
  { id: 'Nasser_Alqatami_128kbps', name: 'Nāṣir al-Qaṭāmī', style: 'Murattal' },
  { id: 'Hani_Rifai_192kbps', name: 'Hānī ar-Rifāʿī', style: 'Murattal' },
  { id: 'Muhammad_Jibreel_128kbps', name: 'Muḥammad Jibrīl', style: 'Murattal' },
];

export const DEFAULT_RECITER = RECITERS[0].id;
export const REPEAT_OPTIONS = [1, 3, 5, 10];

export function reciterById(id: string | undefined): Reciter {
  return RECITERS.find((r) => r.id === id) ?? RECITERS[0];
}

function audioUrl(reciter: string, sura: number, aya: number): string {
  const p = (n: number) => String(n).padStart(3, '0');
  return `https://everyayah.com/data/${reciter}/${p(sura)}${p(aya)}.mp3`;
}

/** Ayat einer Seite (optional nur Zeilen from–to) in Lesereihenfolge; -1 = Basmala. */
export function ayahsForLines(layout: LayoutData, page: number, from?: number, to?: number): number[] {
  const out: number[] = [];
  layout.pages[page - 1].forEach((line, i) => {
    const n = i + 1;
    if ((from && n < from) || (to && n > to)) return;
    if (line[0] === 'b') out.push(-1);
    if (line[0] === 't') for (const [idx] of line[1]) if (!out.includes(idx)) out.push(idx);
  });
  return out;
}

/** Link zum Anhören auf quran.com (Link-Version): Ayat der Zeilen, sonst die ganze Seite. */
export function listenUrl(ed: EditionId, page: number, from?: number, to?: number): string {
  const layout = cachedLayout(ed);
  if (layout && from && to) {
    const list = ayahsForLines(layout, page, from, to).filter((i) => i >= 0);
    if (list.length) {
      const [s1, a1] = ayahKey(list[0]);
      const [s2, a2] = ayahKey(list[list.length - 1]);
      if (s1 === s2) return quranComUrl(s1, a1, a2);
    }
  }
  return quranComPageUrl(page);
}

/** Ayat von–bis aus der Seitenliste; eine Basmala direkt davor wird mitgenommen. */
export function sliceAyahs(all: number[], from: number, to: number): number[] {
  let i = all.indexOf(Math.min(from, to));
  const j = all.indexOf(Math.max(from, to));
  if (i < 0 || j < 0) return [];
  if (i > 0 && all[i - 1] === -1) i--;
  return all.slice(i, j + 1);
}

/** „Al-‘Ankabūt 8–14“ oder „Al-Qaṣaṣ 85 – Al-‘Ankabūt 6“ */
export function ayahRangeLabel(from: number, to: number): string {
  const [s1, a1] = ayahKey(Math.min(from, to));
  const [s2, a2] = ayahKey(Math.max(from, to));
  if (s1 !== s2) return `${suraName(s1)} ${a1} – ${suraName(s2)} ${a2}`;
  return a1 === a2 ? `${suraName(s1)} ${a1}` : `${suraName(s1)} ${a1}–${a2}`;
}

/** quran.com für einen Ayah-Bereich; über eine Sura-Grenze hinweg die ganze Seite. */
export function rangeUrl(page: number, from: number, to: number): string {
  const [s1, a1] = ayahKey(Math.min(from, to));
  const [s2, a2] = ayahKey(Math.max(from, to));
  return s1 === s2 ? quranComUrl(s1, a1, a2) : quranComPageUrl(page);
}

export interface PlayRequest {
  edition: EditionId;
  page: number;
  from?: number;
  to?: number;
  /** Wiederholungen pro Ayah (Standard: Einstellung des Profils) */
  repeatEach?: number;
  /** Wie oft der ganze Bereich läuft */
  rounds?: number;
  reciter?: string;
  /** Bestimmte Ayat statt der Zeilen einer Seite (globale Indizes) */
  ayahs?: number[];
  label?: string;
  /** endlos wiederholen, bis man stoppt */
  loop?: boolean;
  /** Nachsprech-Pause: nach jeder Ayah so lange Stille, wie die Ayah dauerte */
  echo?: boolean;
}

export interface AudioState {
  page: number;
  label: string;
  /** aktuelle Ayah (globaler Index, -1 = Basmala) */
  ayah: number | null;
  index: number;
  total: number;
  rep: number;
  repeatEach: number;
  round: number;
  rounds: number;
  paused: boolean;
  loop: boolean;
  echo: boolean;
  /** gerade in der Nachsprech-Pause */
  echoing: boolean;
  /** gespielte Ayat und alle Ayat der Seite (für Von/Bis), globale Indizes, -1 = Basmala */
  list: number[];
  all: number[];
  reciter: string;
}

/** Neustart der laufenden Wiedergabe mit geänderten Einstellungen */
export interface RestartRequest {
  list?: number[];
  reciter?: string;
  repeatEach?: number;
  echo?: boolean;
  label?: string;
}

interface AudioCtx {
  state: AudioState | null;
  play: (req: PlayRequest) => Promise<void>;
  toggle: () => void;
  stop: () => void;
  restart: (req: RestartRequest) => void;
}

const Ctx = createContext<AudioCtx | null>(null);

export function useAudio(): AudioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AudioProvider fehlt');
  return c;
}

/** Nächste Stelle im Ablauf (Wiederholung, nächste Ayah, nächster Durchgang) oder null am Ende. */
function nextPos(s: AudioState, len: number): AudioState | null {
  if (s.rep < s.repeatEach) return { ...s, rep: s.rep + 1 };
  if (s.index + 1 < len) return { ...s, index: s.index + 1, rep: 1 };
  if (s.loop || s.round < s.rounds) return { ...s, index: 0, rep: 1, round: s.round + 1 };
  return null;
}

/** Stille am Anfang und Ende einer Aufnahme (MP3-Polster) überspringen, damit die Ayat nahtlos ineinander übergehen. */
const trimCache = new WeakMap<AudioBuffer, [number, number]>();
function trimmed(buf: AudioBuffer): [number, number] {
  let v = trimCache.get(buf);
  if (!v) {
    const d = buf.getChannelData(0);
    const th = 0.003;
    let a = 0;
    while (a < d.length && Math.abs(d[a]) < th) a++;
    let b = d.length - 1;
    while (b > a && Math.abs(d[b]) < th) b--;
    // etwas Luft lassen, damit nichts abgeschnitten klingt
    const margin = 0.03 * buf.sampleRate;
    const start = Math.max(0, a - margin) / buf.sampleRate;
    const end = Math.min(d.length, b + margin) / buf.sampleRate;
    v = [start, Math.max(0.05, end - start)];
    trimCache.set(buf, v);
  }
  return v;
}

/**
 * Wiedergabe über die Web Audio API: jede Ayah wird vorab geladen und dekodiert und
 * sample-genau direkt im Anschluss an die vorige gestartet – ohne Lücke.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  const { profile, toast } = useStore();
  const [state, setState] = useState<AudioState | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer>>());
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const timers = useRef<number[]>([]);
  /** erhöht sich bei jedem Stopp/Neustart; alte, noch laufende Ladevorgänge verfallen damit */
  const gen = useRef(0);
  const job = useRef<{ list: number[]; reciter: string; s: AudioState } | null>(null);

  /** AudioContext beim ersten Abspielen anlegen (muss in der Tipp-Geste passieren) */
  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
      // iPhone: auch bei Stummschalter abspielen
      try {
        (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = 'playback';
      } catch {
        /* nicht unterstützt */
      }
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const load = useCallback((url: string) => {
    let p = buffers.current.get(url);
    if (!p) {
      const ctx = ctxRef.current!;
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.arrayBuffer();
        })
        .then((b) => ctx.decodeAudioData(b));
      buffers.current.set(url, p);
      p.catch(() => buffers.current.delete(url));
    }
    return p;
  }, []);

  const urlOf = (reciter: string, idx: number) => {
    const [s, a] = idx === -1 ? [1, 1] : ayahKey(idx);
    return audioUrl(reciter, s, a);
  };

  /** Alles Geplante anhalten (die Wiedergabe-Daten bleiben erhalten). */
  const halt = useCallback(() => {
    gen.current++;
    for (const src of sources.current) {
      try {
        src.stop();
      } catch {
        /* schon beendet */
      }
    }
    sources.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const stop = useCallback(() => {
    halt();
    job.current = null;
    setState(null);
  }, [halt]);

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, Math.max(0, ms)));

  /** Stelle `pos` zum Zeitpunkt `when` (AudioContext-Zeit) einplanen und die nächste vorbereiten. */
  const schedule = useCallback(
    (g: number, pos: AudioState, when: number) => {
      const j = job.current;
      const ctx = ctxRef.current;
      if (!j || !ctx || g !== gen.current) return;
      const idx = j.list[pos.index];
      load(urlOf(j.reciter, idx))
        .then((buf) => {
          if (g !== gen.current) return;
          const [off, dur] = trimmed(buf);
          const start = Math.max(when, ctx.currentTime + 0.03);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(start, off, dur);
          sources.current.push(src);
          src.onended = () => {
            sources.current = sources.current.filter((x) => x !== src);
          };
          const msUntil = (t: number) => (t - ctx.currentTime) * 1000;
          // Anzeige umschalten, wenn die Ayah tatsächlich beginnt
          later(msUntil(start), () => {
            if (g !== gen.current || !job.current) return;
            job.current.s = { ...pos, ayah: idx, paused: false, echoing: false };
            setState(job.current.s);
          });
          const next = nextPos(pos, j.list.length);
          const end = start + dur;
          if (!next) {
            later(msUntil(end) + 80, () => g === gen.current && stop());
            return;
          }
          // Nachsprech-Pause so lang wie die Ayah (1–30 s)
          const pause = pos.echo ? Math.min(30, Math.max(1, dur)) : 0;
          if (pause)
            later(msUntil(end), () => {
              if (g !== gen.current || !job.current) return;
              job.current.s = { ...job.current.s, echoing: true };
              setState(job.current.s);
            });
          // die nächste Ayah gleich laden und einplanen, sobald diese beginnt
          void load(urlOf(j.reciter, j.list[next.index])).catch(() => {});
          later(msUntil(start), () => schedule(g, next, end + pause));
        })
        .catch(() => {
          if (g !== gen.current) return;
          stop();
          toast('Audio nicht erreichbar – bist du online?');
        });
    },
    [load, stop, toast],
  );

  // Profilwechsel beendet die Wiedergabe; Layout schon einmal vorladen
  useEffect(() => {
    if (profile) loadLayout(profile.edition).catch(() => {});
    return stop;
  }, [profile?.id, profile?.edition, stop]);

  const play = useCallback(
    async (req: PlayRequest) => {
      stop();
      // noch innerhalb der Tipp-Geste: Audio freischalten (wichtig für iOS)
      const ctx = ensureCtx();
      const layout = cachedLayout(req.edition) ?? (req.ayahs ? null : await loadLayout(req.edition));
      const list = req.ayahs ?? ayahsForLines(layout!, req.page, req.from, req.to);
      if (!list.length) return;
      const all = layout ? ayahsForLines(layout, req.page) : list;
      const reciter = req.reciter ?? profile?.reciter ?? DEFAULT_RECITER;
      const repeatEach = req.loop ? 1 : (req.repeatEach ?? profile?.repeatEach ?? 3);
      const label = req.label ?? (req.from ? `S. ${req.page}, Zeilen ${req.from}–${req.to}` : `S. ${req.page}`);
      const s: AudioState = {
        page: req.page,
        label,
        ayah: list[0],
        index: 0,
        total: list.length,
        rep: 1,
        repeatEach,
        round: 1,
        rounds: req.rounds ?? 1,
        paused: false,
        loop: !!req.loop,
        echo: req.echo ?? profile?.echoPause ?? false,
        echoing: false,
        list,
        all,
        reciter,
      };
      job.current = { list, reciter, s };
      setState(s);
      schedule(gen.current, s, ctx.currentTime);
    },
    [ensureCtx, schedule, profile?.reciter, profile?.repeatEach, profile?.echoPause, stop],
  );

  /** Pause hält alles an; Weiter beginnt die aktuelle Ayah von vorn. */
  const toggle = useCallback(() => {
    const j = job.current;
    if (!j) return;
    if (j.s.paused) {
      const ctx = ensureCtx();
      j.s = { ...j.s, paused: false, echoing: false };
      setState(j.s);
      schedule(gen.current, j.s, ctx.currentTime);
    } else {
      halt();
      j.s = { ...j.s, paused: true };
      setState(j.s);
    }
  }, [ensureCtx, halt, schedule]);

  const restart = useCallback(
    (req: RestartRequest) => {
      const j = job.current;
      if (!j) return;
      halt();
      const ctx = ensureCtx();
      const list = req.list ?? j.list;
      const reciter = req.reciter ?? j.reciter;
      j.list = list;
      j.reciter = reciter;
      j.s = {
        ...j.s,
        list,
        reciter,
        total: list.length,
        index: 0,
        rep: 1,
        round: 1,
        paused: false,
        echoing: false,
        label: req.label ?? j.s.label,
        repeatEach: j.s.loop ? 1 : (req.repeatEach ?? j.s.repeatEach),
        echo: req.echo ?? j.s.echo,
      };
      setState(j.s);
      schedule(gen.current, j.s, ctx.currentTime);
    },
    [ensureCtx, halt, schedule],
  );

  const value = useMemo(() => ({ state, play, toggle, stop, restart }), [state, play, toggle, stop, restart]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
