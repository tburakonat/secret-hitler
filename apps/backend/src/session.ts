import type { Socket } from "socket.io";

/**
 * Parses the sessionId from the socket's HTTP handshake cookie.
 * Returns null if the cookie is absent or unparseable.
 */
export function getSessionId(socket: Socket): string | null {
  const raw = socket.handshake.headers.cookie;
  if (!raw) return null;

  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "sessionId") return rest.join("=");
  }

  return null;
}
