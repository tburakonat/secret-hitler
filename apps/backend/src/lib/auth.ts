import { createHash, randomBytes } from "node:crypto";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyRequest } from "fastify";
import type { Socket } from "socket.io";
import { prisma } from "./prisma.js";

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

export const AUTH_COOKIE = "authToken";
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Cross-origin (CLIENT_ORIGIN set) requires SameSite=None + Secure, i.e. HTTPS.
// Same-origin works with Lax on plain HTTP; COOKIE_SECURE=true when behind a TLS proxy.
export function cookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: CLIENT_ORIGIN ? "none" : "lax",
    secure: CLIENT_ORIGIN ? true : process.env.COOKIE_SECURE === "true",
    path: "/",
  };
}

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

// Only the sha256 of the token is persisted, so a DB dump cannot be replayed as a cookie.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mints a new auth session for the user and returns the raw token to be set as a cookie. */
export async function createAuthSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + AUTH_SESSION_TTL_MS),
    },
  });
  return token;
}

export async function deleteAuthSession(token: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

async function resolveUserIdFromToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.userId;
}

/** Auth user for a socket connection. Guests (no or invalid cookie) resolve to null. */
export function getAuthUserId(socket: Socket): Promise<string | null> {
  return resolveUserIdFromToken(getCookie(socket, AUTH_COOKIE));
}

/** Auth user for a REST request. Guests resolve to null. */
export function resolveAuthUserId(request: FastifyRequest): Promise<string | null> {
  return resolveUserIdFromToken(request.cookies[AUTH_COOKIE]);
}
