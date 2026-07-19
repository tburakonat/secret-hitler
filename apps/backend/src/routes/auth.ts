import type { FastifyInstance } from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import argon2 from "argon2";
import { z } from "zod";
import type { AuthUser, MeResponse } from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { abortActiveGame, leaveLobby } from "../game/lifecycle.js";
import {
  AUTH_COOKIE,
  AUTH_SESSION_TTL_MS,
  cookieOptions,
  createAuthSession,
  deleteAuthSession,
  resolveAuthUserId,
} from "../lib/auth.js";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(128),
});

const RegisterSchema = LoginSchema.extend({
  nickname: z.string().trim().min(2).max(32),
});

// Verified against on unknown emails so login timing does not reveal whether an email exists.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  return (dummyHash ??= argon2.hash("dummy-password-for-timing"));
}

function authCookie() {
  return { ...cookieOptions(), maxAge: AUTH_SESSION_TTL_MS / 1000 };
}

function toAuthUser(user: { id: string; email: string; nickname: string }): AuthUser {
  return { id: user.id, email: user.email, nickname: user.nickname };
}

/** Maps a Prisma unique-constraint violation to the offending field, if any. */
function uniqueViolationField(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return null;
  }
  // Driver-adapter engine (P2002 via @prisma/adapter-pg): fields live in
  // meta.driverAdapterError.cause.constraint.fields; classic engine: meta.target.
  const meta = err.meta as {
    target?: string | string[];
    driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
  } | undefined;
  const fields = meta?.driverAdapterError?.cause?.constraint?.fields ?? meta?.target;
  if (Array.isArray(fields)) return String(fields[0]);
  if (typeof fields === "string") return fields;
  return "unknown";
}

export async function authRoutes(fastify: FastifyInstance, opts: { io: SocketIOServer }) {
  const { io } = opts;
  const strictLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  fastify.post("/register", strictLimit, async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const { email, nickname, password } = parsed.data;

    const passwordHash = await argon2.hash(password);
    try {
      const user = await prisma.user.create({ data: { email, nickname, passwordHash } });
      const token = await createAuthSession(user.id);
      reply.setCookie(AUTH_COOKIE, token, authCookie());
      return reply.code(201).send({ user: toAuthUser(user) });
    } catch (err) {
      const field = uniqueViolationField(err);
      if (field) {
        return reply
          .code(409)
          .send({ error: field.includes("nickname") ? "NICKNAME_TAKEN" : "EMAIL_TAKEN" });
      }
      throw err;
    }
  });

  fastify.post("/login", strictLimit, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await argon2.verify(await getDummyHash(), password);
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    const token = await createAuthSession(user.id);
    reply.setCookie(AUTH_COOKIE, token, authCookie());
    return reply.send({ user: toAuthUser(user) });
  });

  fastify.post("/logout", async (request, reply) => {
    // Resolve the user BEFORE revoking the session — we still need the identity
    // to clean up their lobby/game membership.
    const userId = await resolveAuthUserId(request);

    if (userId) {
      // Kill every socket of this user first (all tabs/devices), so the
      // departing player doesn't receive the abort/leave broadcasts below.
      io.in(`user:${userId}`).disconnectSockets(true);

      const player = await prisma.player.findUnique({
        where: { userId },
        include: { lobby: true },
      });
      if (player) {
        // Mid-game logout aborts the game for everyone (a Secret Hitler round
        // cannot continue with a missing player); then always leave the lobby.
        if (player.lobby.status === "IN_GAME") {
          await abortActiveGame(io, player.lobbyId);
        }
        await leaveLobby(io, player.id);
      }
    }

    const token = request.cookies[AUTH_COOKIE];
    if (token) {
      await deleteAuthSession(token);
    }

    reply.clearCookie(AUTH_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  fastify.get("/me", async (request): Promise<MeResponse> => {
    const userId = await resolveAuthUserId(request);
    if (!userId) return { user: null };
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return { user: user ? toAuthUser(user) : null };
  });
}
