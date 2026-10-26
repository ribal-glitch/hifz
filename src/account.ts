import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, initializeFirestore, persistentLocalCache, setDoc } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './firebase-config';
import type { Profile } from './logic/profile';
import { IS_ARTIFACT, compactProfile, type Backend } from './platform';

/**
 * Konten über Firebase: Anmeldung mit E-Mail und Passwort, Daten in Firestore unter
 * users/<uid>/store/<schlüssel>. Die Firestore-Regeln erlauben jeder Person nur ihr eigenes Konto.
 * Firestore hält eine Kopie auf dem Gerät, die App funktioniert also auch offline.
 */
// In der claude.ai-Link-Version gibt es Claude-Konten, dort bleibt Firebase aus.
const app = FIREBASE_CONFIG && !IS_ARTIFACT ? initializeApp(FIREBASE_CONFIG) : null;
const auth = app ? getAuth(app) : null;
const db = app ? initializeFirestore(app, { localCache: persistentLocalCache() }) : null;

export const ACCOUNTS_ENABLED = !!app;

export interface AccountUser {
  uid: string;
  email: string;
}

const toUser = (u: User | null): AccountUser | null => (u ? { uid: u.uid, email: u.email ?? '' } : null);

/** Wartet auf den ersten Anmeldestatus (angemeldet bleibt man auch nach dem Schließen der App). */
export function currentUser(): Promise<AccountUser | null> {
  if (!auth) return Promise.resolve(null);
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => {
      stop();
      resolve(toUser(u));
    });
  });
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
  'auth/wrong-password': 'E-Mail oder Passwort stimmt nicht.',
  'auth/user-not-found': 'Zu dieser E-Mail gibt es noch kein Konto.',
  'auth/email-already-in-use': 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.',
  'auth/weak-password': 'Das Passwort braucht mindestens 6 Zeichen.',
  'auth/invalid-email': 'Diese E-Mail-Adresse ist ungültig.',
  'auth/missing-password': 'Bitte ein Passwort eingeben.',
  'auth/network-request-failed': 'Keine Verbindung. Für die Anmeldung braucht es Internet.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte in ein paar Minuten nochmal.',
};

export function accountError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  return MESSAGES[code] ?? 'Das hat nicht geklappt. Bitte nochmal versuchen.';
}

export async function signIn(email: string, password: string): Promise<AccountUser> {
  if (!auth) throw new Error('Konten sind nicht eingerichtet');
  return toUser((await signInWithEmailAndPassword(auth, email.trim(), password)).user)!;
}

export async function signUp(email: string, password: string): Promise<AccountUser> {
  if (!auth) throw new Error('Konten sind nicht eingerichtet');
  return toUser((await createUserWithEmailAndPassword(auth, email.trim(), password)).user)!;
}

export async function resetPassword(email: string): Promise<void> {
  if (!auth) return;
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logOut(): Promise<void> {
  if (auth) await signOut(auth);
}

/** Speicher im Konto: ein Dokument je Schlüssel (Meta-Daten und je Profil). */
export function accountBackend(uid: string): Backend {
  if (!db) throw new Error('Konten sind nicht eingerichtet');
  const docId = (key: string) => (key === 'hifz:meta' ? 'meta' : `p-${key.replace('hifz:profile:', '')}`);
  const ref = (key: string) => doc(db, 'users', uid, 'store', docId(key));
  return {
    kind: 'cloud',
    async get<T>(key: string) {
      const snap = await getDoc(ref(key));
      return snap.exists() ? (snap.data() as T) : undefined;
    },
    async set(key, value) {
      const body = key.startsWith('hifz:profile:') ? compactProfile(value as unknown as Profile) : value;
      // Firestore kennt kein undefined: über JSON entfernen
      await setDoc(ref(key), JSON.parse(JSON.stringify(body)));
    },
    async del(key) {
      await deleteDoc(ref(key));
    },
  };
}
