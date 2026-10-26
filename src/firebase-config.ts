// Zugangsdaten des Firebase-Projekts für Konten (Anmeldung mit E-Mail und Passwort).
// Diese Werte sind nicht geheim: Sie stehen in jeder Firebase-Web-App im Browser.
// Geschützt werden die Daten durch die Firestore-Regeln (jede Person sieht nur ihr eigenes Konto).
// Leer (null) = App läuft ohne Konten, Daten bleiben auf dem Gerät.
export const FIREBASE_CONFIG: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
} | null = null;
