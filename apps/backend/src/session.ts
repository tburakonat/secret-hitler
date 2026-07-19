import type { Socket } from "socket.io";

/**
 * Parses a single cookie value from the socket's HTTP handshake cookie header.
 * Returns null if the cookie is absent or unparseable.
 */
export function getCookie(socket: Socket, name: string): string | null {
  const raw = socket.handshake.headers.cookie;
  if (!raw) return null;

  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }

  return null;
}

/**
 * Parses the sessionId from the socket's HTTP handshake cookie.
 * Returns null if the cookie is absent or unparseable.
 */
export function getSessionId(socket: Socket): string | null {
  return getCookie(socket, "sessionId");
}
