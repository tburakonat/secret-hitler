import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import type { AuthUser, MeResponse } from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AUTH_COOKIE,
  AUTH_SESSION_TTL_MS,
  cookieOptions,
  createAuthSession,
  deleteAuthSession,
  resolveAuthUserId,
} from "../lib/auth.js";

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(128),
});

// Verified against on unknown emails so login timing does not reveal whether an email exists.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  return (dummyHash ??= argon2.hash("dummy-password-for-timing"));
}

function authCookie() {
  return { ...cookieOptions(), maxAge: AUTH_SESSION_TTL_MS / 1000 };
}

function toAuthUser(user: { id: string; email: string }): AuthUser {
  return { id: user.id, email: user.email };
}

export async function authRoutes(fastify: FastifyInstance) {
  const strictLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  fastify.post("/register", strictLimit, async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const { email, password } = parsed.data;

    const passwordHash = await argon2.hash(password);
    try {
      const user = await prisma.user.create({ data: { email, passwordHash } });
      const token = await createAuthSession(user.id);
      reply.setCookie(AUTH_COOKIE, token, authCookie());
      return reply.code(201).send({ user: toAuthUser(user) });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.code(409).send({ error: "EMAIL_TAKEN" });
      }
      throw err;
    }
  });

  fastify.post("/login", strictLimit, async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
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
