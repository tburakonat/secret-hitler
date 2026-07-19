import type { AuthCredentials, AuthErrorCode, AuthUser, MeResponse } from '@secret-hitler/shared';

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

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Fehler mit dem Auth-Fehlercode des Servers, damit die UI ihn auf i18n mappen kann. */
export class AuthApiError extends Error {
  constructor(public code: AuthErrorCode) {
    super(`Auth request failed: ${code}`);
  }
}

async function authPost(path: string, body: AuthCredentials): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/api/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: AuthErrorCode } | null;
    throw new AuthApiError(data?.error ?? 'INVALID_INPUT');
  }
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

export const register = (creds: AuthCredentials) => authPost('register', creds);
export const login = (creds: AuthCredentials) => authPost('login', creds);

export async function logout(): Promise<void> {
  await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

/** Liefert den eingeloggten User oder null (Gast). Wirft nie — Fehler zählen als Gast. */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json() as MeResponse;
    return data.user;
  } catch {
    return null;
  }
}
