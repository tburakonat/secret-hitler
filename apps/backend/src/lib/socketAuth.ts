import type { Socket } from "socket.io";
import type { ExtendedError } from "socket.io";
import { prisma } from "./prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import { getAuthUserId } from "./auth.js";

/**
 * Handshake middleware: resolves the authToken cookie to a userId exactly once
 * per connection and rejects unauthenticated sockets with a connect_error.
 * The cookie is read at handshake time, so the frontend must reconnect the
 * socket after login and disconnect it on logout.
 */
export async function socketAuthMiddleware(socket: Socket, next: (err?: ExtendedError) => void) {
  const userId = await getAuthUserId(socket);
  if (!userId) return next(new Error("UNAUTHORIZED"));
  socket.data.userId = userId;
  next();
}

/** The authenticated user's id, set by socketAuthMiddleware. */
export function getUserId(socket: Socket): string {
  return socket.data.userId as string;
}

/**
 * The Player row of the connection's user, or null if they are not in a lobby.
 * Player.userId is unique, so this is at most one row.
 */
export function requirePlayer<I extends Prisma.PlayerInclude | undefined = undefined>(
  socket: Socket,
  include?: I,
): Promise<Prisma.PlayerGetPayload<{ include: I }> | null> {
  return prisma.player.findUnique({
    where: { userId: getUserId(socket) },
    include,
  }) as Promise<Prisma.PlayerGetPayload<{ include: I }> | null>;
}
