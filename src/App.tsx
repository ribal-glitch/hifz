import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ProgressTab } from './screens/Progress';
import { Read } from './screens/Read';
import { Settings } from './screens/Settings';
import { Today, type ReadTarget } from './screens/Today';
import { Who } from './screens/Who';
import { Login } from './screens/Login';
import { useAudio, reciterById } from './audio';
import { ayahKey } from './data/quranData';
import { suraName } from './logic/quran';
import { useStore } from './store';
import { Avatar, Icon } from './ui';

/** Drei Seiten zum Wischen: Lesen ← Wiederholen → Fortschritt. Start ist „Wiederholen“. */
const SLIDES = [
  { id: 'read', label: 'Lesen', icon: 'read' },
  { id: 'review', label: 'Wiederholen', icon: 'today' },
  { id: 'progress', label: 'Fortschritt', icon: 'progress' },
] as const;
const START_SLIDE = 1;

export function App() {
  const { ready, profile, closeProfile, toastMsg, needLogin } = useStore();
  const audio = useAudio();
  const [active, setActive] = useState(START_SLIDE);
  const [settings, setSettings] = useState(false);
  const [target, setTarget] = useState<ReadTarget | null>(null);
  const slides = useRef<HTMLDivElement>(null);

  const go = useCallback((i: number, smooth = true) => {
    const el = slides.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    setActive(i);
  }, []);

  const open = useCallback(
    (t: ReadTarget) => {
      setTarget(t);
      go(0);
    },
    [go],
  );
  const targetUsed = useCallback(() => setTarget(null), []);

  // Beim Öffnen eines Profils immer mit „Wiederholen“ beginnen
  useLayoutEffect(() => {
    if (profile) go(START_SLIDE, false);
    setSettings(false);
  }, [profile?.id, go]);

  // Nach dem Drehen des Geräts wieder genau auf der aktiven Seite einrasten
  useEffect(() => {
    const onResize = () => go(active, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, go]);

  const onScroll = () => {
    const el = slides.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };

  if (!ready) return null;

  return (
    <>
      {needLogin ? (
        <Login />
      ) : !profile ? (
        <Who />
      ) : (
        <div className={`app${audio.state ? ' has-player' : ''}`}>
          <header className="topbar">
            <h1>{SLIDES[active]?.label}</h1>
            <button type="button" className="iconbtn" aria-label="Einstellungen" onClick={() => setSettings(true)}>
              <Icon name="settings" />
            </button>
            <button type="button" className="avatar-btn" onClick={closeProfile} aria-label={`Profil ${profile.name} – wechseln`}>
              <Avatar name={profile.name} color={profile.color} size={38} />
            </button>
          </header>

          <div className="slides" ref={slides} onScroll={onScroll}>
            <section className="slide" aria-label="Lesen" aria-hidden={active !== 0}>
              <div className="content">
                <Read target={target} onTargetUsed={targetUsed} />
              </div>
            </section>
            <section className="slide" aria-label="Wiederholen" aria-hidden={active !== 1}>
              <div className="content">
                <Today onOpen={open} />
              </div>
            </section>
            <section className="slide" aria-label="Fortschritt" aria-hidden={active !== 2}>
              <div className="content">
                <ProgressTab onOpen={open} />
              </div>
            </section>
          </div>

          {audio.state && (
            <div className="player" role="region" aria-label="Wiedergabe">
              <div className="info">
                <b>
                  {audio.state.ayah === -1 || audio.state.ayah === null
                    ? 'Basmala'
                    : `${suraName(ayahKey(audio.state.ayah)[0])} ${ayahKey(audio.state.ayah)[1]}`}
                  {audio.state.repeatEach > 1 ? ` · ${audio.state.rep}/${audio.state.repeatEach}` : ''}
                </b>
                <div>
                  {audio.state.label}
                  {audio.state.rounds > 1 ? ` · Durchgang ${audio.state.round}/${audio.state.rounds}` : ''} · {reciterById(profile.reciter).name}
                </div>
              </div>
              <button type="button" className="iconbtn" aria-label={audio.state.paused ? 'Weiter abspielen' : 'Pause'} onClick={audio.toggle}>
                <Icon name={audio.state.paused ? 'play' : 'pause'} />
              </button>
              <button type="button" className="iconbtn" aria-label="Wiedergabe beenden" onClick={audio.stop}>
                <Icon name="stop" />
              </button>
            </div>
          )}

          <nav className="tabbar" aria-label="Bereiche">
            {SLIDES.map((s, i) => (
              <button key={s.id} type="button" aria-current={active === i ? 'page' : undefined} onClick={() => go(i)}>
                <Icon name={s.icon} />
                {s.label}
              </button>
            ))}
            <span className="tab-indicator" style={{ transform: `translateX(${active * 100}%)` }} aria-hidden="true" />
          </nav>

          {settings && (
            <div className="fullsheet" role="dialog" aria-modal="true" aria-label="Einstellungen">
              <header className="topbar">
                <h1>Einstellungen</h1>
                <button type="button" className="btn ghost" onClick={() => setSettings(false)}>
                  Fertig
                </button>
              </header>
              <div className="fullsheet-body">
                <div className="content">
                  <Settings />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </>
  );
}
