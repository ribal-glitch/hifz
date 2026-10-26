import { useState } from 'react';
import { accountError, resetPassword } from '../account';
import { useStore } from '../store';
import { Seg } from '../ui';

/** Anmeldung mit E-Mail und Passwort; der Stand liegt dann im Konto und ist auf jedem Gerät gleich. */
export function Login() {
  const { login, continueWithoutAccount, toast } = useStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(mode, email, password);
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError('Bitte zuerst die E-Mail-Adresse eingeben.');
      return;
    }
    try {
      await resetPassword(email);
      toast('E-Mail zum Zurücksetzen ist unterwegs.');
    } catch (err) {
      setError(accountError(err));
    }
  };

  return (
    <div className="who">
      <h1>Hifz</h1>
      <p className="sub" style={{ marginTop: 0, marginBottom: 22 }}>
        Melde dich an, damit dein Stand sicher in deinem Konto liegt – auf jedem Handy derselbe.
      </p>
      <Seg
        label="Anmelden oder Konto erstellen"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: 'signin', label: 'Anmelden' },
          { value: 'signup', label: 'Konto erstellen' },
        ]}
      />
      <form className="stack" style={{ marginTop: 18 }} onSubmit={submit}>
        <div>
          <label className="lbl" htmlFor="login-email">
            E-Mail
          </label>
          <input
            id="login-email"
            className="field"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="lbl" htmlFor="login-password">
            Passwort {mode === 'signup' ? '(mindestens 6 Zeichen)' : ''}
          </label>
          <input
            id="login-password"
            className="field"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error && (
          <p role="alert" style={{ color: 'var(--err)', margin: 0, fontWeight: 600 }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'Einen Moment …' : mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}
        </button>
        {mode === 'signin' && (
          <button type="button" className="btn ghost block" onClick={forgot}>
            Passwort vergessen?
          </button>
        )}
      </form>
      <div className="ornament" aria-hidden="true">
        <i />
      </div>
      <button type="button" className="btn block" onClick={() => void continueWithoutAccount()}>
        Ohne Konto, nur auf diesem Gerät
      </button>
      <p className="small" style={{ textAlign: 'center' }}>
        Ohne Konto bleiben die Daten nur auf diesem Handy. Du kannst dich später jederzeit anmelden; dein Stand wird dann übernommen.
      </p>
    </div>
  );
}
