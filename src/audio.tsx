import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ayahKey, cachedLayout, loadLayout, type LayoutData } from './data/quranData';
import type { EditionId } from './logic/quran';
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
}

interface AudioCtx {
  state: AudioState | null;
  play: (req: PlayRequest) => Promise<void>;
  toggle: () => void;
  stop: () => void;
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
    j.s = { ...j.s, ayah: idx, paused: false };
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
    else if (s.round < s.rounds) j.s = { ...s, index: 0, rep: 1, round: s.round + 1 };
    else {
      stop();
      return;
    }
    // kurze Pause zwischen den Wiederholungen, zum Nachsprechen
    timer.current = window.setTimeout(playCurrent, 350);
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
      const layout = cachedLayout(req.edition) ?? (await loadLayout(req.edition));
      const list = ayahsForLines(layout, req.page, req.from, req.to);
      if (!list.length) return;
      const reciter = req.reciter ?? profile?.reciter ?? DEFAULT_RECITER;
      const repeatEach = req.repeatEach ?? profile?.repeatEach ?? 3;
      const label = req.from ? `S. ${req.page}, Zeilen ${req.from}–${req.to}` : `S. ${req.page}`;
      job.current = {
        list,
        reciter,
        s: { page: req.page, label, ayah: null, index: 0, total: list.length, rep: 1, repeatEach, round: 1, rounds: req.rounds ?? 1, paused: false },
      };
      playCurrent();
    },
    [playCurrent, profile?.reciter, profile?.repeatEach, stop],
  );

  const toggle = useCallback(() => {
    const audio = el.current;
    const j = job.current;
    if (!audio || !j) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      j.s = { ...j.s, paused: false };
    } else {
      audio.pause();
      j.s = { ...j.s, paused: true };
    }
    setState(j.s);
  }, []);

  const value = useMemo(() => ({ state, play, toggle, stop }), [state, play, toggle, stop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
