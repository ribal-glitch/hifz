import { useCallback, useEffect, useState } from 'react';
import { ProgressTab } from './screens/Progress';
import { Read } from './screens/Read';
import { Settings } from './screens/Settings';
import { Today, type ReadTarget } from './screens/Today';
import { Who } from './screens/Who';
import { useStore } from './store';
import { Avatar, Icon } from './ui';

type Tab = 'today' | 'progress' | 'read' | 'settings';

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'today', label: 'Heute', title: 'Heute' },
  { id: 'progress', label: 'Fortschritt', title: 'Fortschritt' },
  { id: 'read', label: 'Lesen', title: 'Lesen' },
  { id: 'settings', label: 'Einstellungen', title: 'Einstellungen' },
];

export function App() {
  const { ready, profile, closeProfile, toastMsg } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [target, setTarget] = useState<ReadTarget | null>(null);

  const open = useCallback((t: ReadTarget) => {
    setTarget(t);
    setTab('read');
  }, []);
  const targetUsed = useCallback(() => setTarget(null), []);

  // Beim Profilwechsel immer mit „Heute“ beginnen
  useEffect(() => {
    setTab('today');
  }, [profile?.id]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  if (!ready) return null;

  return (
    <>
      {!profile ? (
        <Who />
      ) : (
        <div className="app">
          <header className="topbar">
            <h1>{TABS.find((t) => t.id === tab)!.title}</h1>
            <button type="button" className="avatar-btn" onClick={closeProfile} aria-label={`Profil ${profile.name} – wechseln`}>
              <Avatar name={profile.name} color={profile.color} size={38} />
            </button>
          </header>
          <main className="content">
            {tab === 'today' && <Today onOpen={open} />}
            {tab === 'progress' && <ProgressTab onOpen={open} />}
            {tab === 'read' && <Read target={target} onTargetUsed={targetUsed} />}
            {tab === 'settings' && <Settings />}
          </main>
          <nav className="tabbar" aria-label="Bereiche">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <Icon name={t.id} />
                {t.label}
              </button>
            ))}
          </nav>
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
