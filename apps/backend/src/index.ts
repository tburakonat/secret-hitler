import "dotenv/config";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { registerLobbyHandlers } from "./handlers/lobby.js";
import { registerNominationHandlers } from "./handlers/nomination.js";
import { registerElectionHandlers } from "./handlers/election.js";
import { registerLegislativeHandlers } from "./handlers/legislative.js";
import { registerExecutiveHandlers } from "./handlers/executive.js";

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) throw new Error("COOKIE_SECRET environment variable is required");

async function main() {
  const fastify = Fastify({
    logger: {
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

  await fastify.register(fastifyCors, {
    origin: CLIENT_ORIGIN,
    credentials: true,
  });
  await fastify.register(fastifyCookie, {
    secret: COOKIE_SECRET,
  });

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: CLIENT_ORIGIN,
      credentials: true,
    },
  });

  // ─── HTTP routes ───────────────────────────────────────────────────────────

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.get("/session", async (request, reply) => {
    let sessionId = request.cookies.sessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      reply.setCookie("sessionId", sessionId, {
        httpOnly: true,
        sameSite: IS_PRODUCTION ? "none" : "lax",
        secure: IS_PRODUCTION,
        path: "/",
      });
    }
    return { sessionId };
  });

  fastify.get("/lobbies", async () => {
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
