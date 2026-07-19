import "dotenv/config";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { cookieOptions } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { registerLobbyHandlers } from "./handlers/lobby.js";
import { registerNominationHandlers } from "./handlers/nomination.js";
import { registerElectionHandlers } from "./handlers/election.js";
import { registerLegislativeHandlers } from "./handlers/legislative.js";
import { registerExecutiveHandlers } from "./handlers/executive.js";

const PORT = Number(process.env.PORT) || 3000;
// Unset = same-origin deployment (nginx proxies /api and /socket.io); set only for split deployments.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) throw new Error("COOKIE_SECRET environment variable is required");

async function main() {
  const fastify = Fastify({
    trustProxy: true,
    logger: IS_PRODUCTION
      ? true
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        },
  });

  if (CLIENT_ORIGIN) {
    await fastify.register(fastifyCors, {
      origin: CLIENT_ORIGIN.split(","),
      credentials: true,
    });
  }
  await fastify.register(fastifyCookie, {
    secret: COOKIE_SECRET,
  });
  // Opt-in only: routes enable it via their own `config.rateLimit` (see routes/auth.ts).
  await fastify.register(fastifyRateLimit, {
    global: false,
    // statusCode ist Pflicht — ohne ihn behandelt Fastify die Antwort als 500er.
    errorResponseBuilder: () => ({ statusCode: 429, error: "RATE_LIMITED" }),
  });

  const io = new SocketIOServer(
    fastify.server,
    CLIENT_ORIGIN
      ? {
          cors: {
            origin: CLIENT_ORIGIN.split(","),
            credentials: true,
          },
        }
      : {},
  );

  // ─── HTTP routes ───────────────────────────────────────────────────────────

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.get("/api/session", async (request, reply) => {
    let sessionId = request.cookies.sessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      reply.setCookie("sessionId", sessionId, cookieOptions());
    }
    return { sessionId };
  });

  await fastify.register(authRoutes, { prefix: "/api/auth" });

  fastify.get("/api/lobbies", async () => {
    const lobbies = await prisma.lobby.findMany({
      where: { status: "WAITING", isPublic: true },
      include: { players: true },
    });
    return lobbies;
  });

  // ─── Socket.io ─────────────────────────────────────────────────────────────

  io.on("connection", (socket) => {
    fastify.log.info({ socketId: socket.id }, "client connected");

    registerLobbyHandlers(io, socket);
    registerNominationHandlers(io, socket);
    registerElectionHandlers(io, socket);
    registerLegislativeHandlers(io, socket);
    registerExecutiveHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      fastify.log.info({ socketId: socket.id, reason }, "client disconnected");
    });
  });

  // ─── Start ─────────────────────────────────────────────────────────────────

  try {
    await redis.ping();
    fastify.log.info("Redis connected");
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
