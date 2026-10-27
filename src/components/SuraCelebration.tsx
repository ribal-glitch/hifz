import { useEffect, useState } from 'react';
import { suraStatus } from '../logic/stats';
import { suraName } from '../logic/quran';
import { useStore } from '../store';
import { Celebration } from './Celebrate';

/**
 * Feiert jede Sura, die neu auswendig ist, einmal mit Emoji und Konfetti.
 * Beim ersten Start gelten alle schon auswendigen Suren als gefeiert.
 */
export function SuraCelebration() {
  const { profile, today, update } = useStore();
  const [show, setShow] = useState<number | null>(null);
  const known = profile ? suraStatus(profile, today).filter((s) => s.state === 'auswendig').map((s) => s.sura) : [];
  const key = known.join(',');

  useEffect(() => {
    if (!profile) return;
    if (!profile.celebrated) {
      update((p) => ({ ...p, celebrated: known }));
      return;
    }
    const fresh = known.find((s) => !profile.celebrated!.includes(s));
    if (fresh !== undefined && show === null) setShow(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, key, show]);

  if (show === null) return null;
  return (
    <Celebration
      emoji="🎉"
      title={suraName(show)}
      sub="auswendig gelernt"
      onDone={() => {
        update((p) => ({ ...p, celebrated: [...new Set([...(p.celebrated ?? []), show])] }));
        setShow(null);
      }}
    />
  );
}
