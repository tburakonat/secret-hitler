import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { SOCKET_EVENTS } from '@secret-hitler/shared';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

async function main() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: CLIENT_ORIGIN,
    credentials: true,
  });
  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'dev-secret-change-in-production',
  });

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: CLIENT_ORIGIN,
      credentials: true,
    },
  });

  // ─── HTTP routes ───────────────────────────────────────────────────────────

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/lobbies', async () => []);

  // ─── Socket.io ─────────────────────────────────────────────────────────────

  io.on('connection', (socket) => {
    fastify.log.info({ socketId: socket.id }, 'client connected');

    socket.on(SOCKET_EVENTS.LOBBY_RECONNECT, (payload: { sessionId: string }) => {
      fastify.log.info({ socketId: socket.id, sessionId: payload.sessionId }, 'reconnect');
      // TODO: look up player by sessionId, re-join room, send game:state_sync
    });

    socket.on('disconnect', (reason) => {
      fastify.log.info({ socketId: socket.id, reason }, 'client disconnected');
    });
  });

  // ─── Start ─────────────────────────────────────────────────────────────────

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
