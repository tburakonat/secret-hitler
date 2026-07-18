// Leer = same-origin (nginx-Proxy in Prod, Vite-Proxy in Dev). Nur für Split-Deployments gesetzt.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';

/** Holt oder erstellt die sessionId via HTTP-Cookie. Muss vor socket.connect() aufgerufen werden. */
export async function initSession(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/session`, { credentials: 'include' });
  if (!res.ok) throw new Error('Session konnte nicht initialisiert werden.');
  const data = await res.json() as { sessionId: string };
  return data.sessionId;
}

export async function fetchLobbies() {
  const res = await fetch(`${BACKEND_URL}/api/lobbies`, { credentials: 'include' });
  if (!res.ok) throw new Error('Lobbys konnten nicht geladen werden.');
  return res.json();
}
