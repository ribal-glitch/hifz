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

/** Bekannte Rezitatoren (Hafs ʿan ʿĀṣim), Audio pro Ajah von EveryAyah.com */
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

/** Ajat einer Seite (optional nur Zeilen from–to) in Lesereihenfolge; -1 = Basmala. */
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

/** Link zum Anhören auf quran.com (Link-Version): Ajat der Zeilen, sonst die ganze Seite. */
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

/** Ajat von–bis aus der Seitenliste; eine Basmala direkt davor wird mitgenommen. */
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

/** quran.com für einen Ajah-Bereich; über eine Sura-Grenze hinweg die ganze Seite. */
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
  /** Wiederholungen pro Ajah (Standard: Einstellung des Profils) */
  repeatEach?: number;
  /** Wie oft der ganze Bereich läuft */
  rounds?: number;
  reciter?: string;
  /** Bestimmte Ajat statt der Zeilen einer Seite (globale Indizes) */
  ayahs?: number[];
  label?: string;
  /** endlos wiederholen, bis man stoppt */
  loop?: boolean;
  /** Nachsprech-Pause: nach jeder Ajah so lange Stille, wie die Ajah dauerte */
  echo?: boolean;
}

export interface AudioState {
  page: number;
  label: string;
  /** aktuelle Ajah (globaler Index, -1 = Basmala) */
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
  /** gespielte Ajat und alle Ajat der Seite (für Von/Bis), globale Indizes, -1 = Basmala */
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

export function AudioProvider({ children }: { children: ReactNode }) {
  const { profile, toast } = useStore();
  const [state, setState] = useState<AudioState | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);
  const job = useRef<{ list: number[]; reciter: string; s: AudioState } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    el.current?.pause();
    job.current = null;
    setState(null);
  }, []);

  const playCurrent = useCallback(() => {
    const j = job.current;
    if (!j) return;
    const idx = j.list[j.s.index];
    const [s, a] = idx === -1 ? [1, 1] : ayahKey(idx);
    el.current ??= new Audio();
    const audio = el.current;
    audio.src = audioUrl(j.reciter, s, a);
    j.s = { ...j.s, ayah: idx, paused: false, echoing: false };
    setState(j.s);
    audio.play().catch(() => {
      /* Fehler meldet onerror */
    });
  }, []);

  const advance = useCallback(() => {
    const j = job.current;
    if (!j) return;
    const s = j.s;
    if (s.rep < s.repeatEach) j.s = { ...s, rep: s.rep + 1 };
    else if (s.index + 1 < j.list.length) j.s = { ...s, index: s.index + 1, rep: 1 };
    else if (s.loop || s.round < s.rounds) j.s = { ...s, index: 0, rep: 1, round: s.round + 1 };
    else {
      stop();
      return;
    }
    // Nachsprech-Pause so lang wie die gehörte Ajah (1–30 s), sonst nur ein kurzer Atemzug
    const dur = el.current?.duration ?? 0;
    const wait = s.echo && Number.isFinite(dur) && dur > 0 ? Math.min(30_000, Math.max(1000, dur * 1000)) : 350;
    if (s.echo) {
      j.s = { ...j.s, echoing: true };
      setState(j.s);
    }
    timer.current = window.setTimeout(playCurrent, wait);
  }, [playCurrent, stop]);

  useEffect(() => {
    el.current ??= new Audio();
    const audio = el.current;
    audio.onended = advance;
    audio.onerror = () => {
      if (!job.current) return;
      stop();
      toast('Audio nicht erreichbar – bist du online?');
    };
  }, [advance, stop, toast]);

  // Profilwechsel beendet die Wiedergabe; Layout schon einmal vorladen
  useEffect(() => {
    if (profile) loadLayout(profile.edition).catch(() => {});
    return stop;
  }, [profile?.id, profile?.edition, stop]);

  const play = useCallback(
    async (req: PlayRequest) => {
      stop();
      // Das Layout ist normalerweise schon geladen; dann startet die Wiedergabe noch
      // innerhalb der Tipp-Geste (wichtig für iOS).
      const layout = cachedLayout(req.edition) ?? (req.ayahs ? null : await loadLayout(req.edition));
      const list = req.ayahs ?? ayahsForLines(layout!, req.page, req.from, req.to);
      if (!list.length) return;
      const all = layout ? ayahsForLines(layout, req.page) : list;
      const reciter = req.reciter ?? profile?.reciter ?? DEFAULT_RECITER;
      const repeatEach = req.loop ? 1 : (req.repeatEach ?? profile?.repeatEach ?? 3);
      const label = req.label ?? (req.from ? `S. ${req.page}, Zeilen ${req.from}–${req.to}` : `S. ${req.page}`);
      job.current = {
        list,
        reciter,
        s: {
          page: req.page,
          label,
          ayah: null,
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
        },
      };
      playCurrent();
    },
    [playCurrent, profile?.reciter, profile?.repeatEach, profile?.echoPause, stop],
  );

  const toggle = useCallback(() => {
    const audio = el.current;
    const j = job.current;
    if (!audio || !j) return;
    if (j.s.paused) {
      // aus der Pause (auch einer unterbrochenen Nachsprech-Pause) weiter
      if (j.s.echoing) playCurrent();
      else audio.play().catch(() => {});
      j.s = { ...j.s, paused: false };
    } else {
      window.clearTimeout(timer.current);
      audio.pause();
      j.s = { ...j.s, paused: true };
    }
    setState(j.s);
  }, [playCurrent]);

  const restart = useCallback(
    (req: RestartRequest) => {
      const j = job.current;
      if (!j) return;
      window.clearTimeout(timer.current);
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
        label: req.label ?? j.s.label,
        repeatEach: j.s.loop ? 1 : (req.repeatEach ?? j.s.repeatEach),
        echo: req.echo ?? j.s.echo,
      };
      playCurrent();
    },
    [playCurrent],
  );

  const value = useMemo(() => ({ state, play, toggle, stop, restart }), [state, play, toggle, stop, restart]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
