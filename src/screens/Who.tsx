import { useRef, useState } from 'react';
import { ribalPreset, type Profile } from '../logic/profile';
import { markMilestonesSeen } from '../logic/stats';
import { parseProfileFile, useStore } from '../store';
import { Avatar, Confirm, Icon } from '../ui';
import { Onboarding } from './Onboarding';

export function Who() {
  const { profiles, openProfile, addProfile, importProfile, today, toast } = useStore();
  const [creating, setCreating] = useState(false);
  const [pendingImport, setPendingImport] = useState<Profile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (creating) return <Onboarding onCancel={() => setCreating(false)} />;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const p = parseProfileFile(await f.text());
    if (!p) {
      toast('Diese Datei ist kein Hifz-Profil.');
      return;
    }
    if (profiles.some((x) => x.id === p.id)) setPendingImport(p);
    else await importProfile(p, false);
  };

  return (
    <div className="who">
      <h1>Wer lernt?</h1>
      <p className="sub" style={{ marginTop: 0, marginBottom: 24 }}>
        Jedes Profil hat seinen eigenen Stand. Die Daten bleiben auf diesem Gerät.
      </p>

      {profiles.map((p) => (
        <button key={p.id} type="button" className="profile-btn" onClick={() => openProfile(p.id)}>
          <Avatar name={p.name} color={p.color} size={48} />
          <span className="pname" style={{ flex: 1 }}>
            {p.name}
          </span>
          <span style={{ color: 'var(--muted)', transform: 'rotate(-90deg)' }}>
            <Icon name="chevron" />
          </span>
        </button>
      ))}

      {profiles.length === 0 && (
        <button
          type="button"
          className="profile-btn"
          onClick={() => addProfile(markMilestonesSeen(ribalPreset(today), today))}
        >
          <Avatar name="Ribal" color="#1F5A44" size={48} />
          <span style={{ flex: 1 }}>
            <span className="pname" style={{ display: 'block' }}>
              Ribal
            </span>
            <span className="small">Vorbelegt: 227 Seiten · Dars al-ʿAnkabūt</span>
          </span>
          <span style={{ color: 'var(--muted)', transform: 'rotate(-90deg)' }}>
            <Icon name="chevron" />
          </span>
        </button>
      )}

      <button type="button" className="btn block" style={{ marginTop: 8, minHeight: 56 }} onClick={() => setCreating(true)}>
        <Icon name="plus" /> Neues Profil anlegen
      </button>
      <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
        Profil aus Datei importieren
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {pendingImport && (
        <Confirm
          title="Profil existiert schon"
          text={`„${pendingImport.name}“ ist auf diesem Gerät schon vorhanden. Mit dem Stand aus der Datei überschreiben?`}
          confirmLabel="Überschreiben"
          onConfirm={() => {
            void importProfile(pendingImport, false);
            setPendingImport(null);
          }}
          secondaryLabel="Als Kopie anlegen"
          onSecondary={() => {
            void importProfile(pendingImport, true);
            setPendingImport(null);
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
