import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  SOCKET_EVENTS,
  type NominationChancellorPayload,
  type GameStateSync,
} from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { getSessionId } from "../session.js";
import { getEligibleChancellors } from "../game/engine.js";
import { getGameState, setGameState } from "../game/state.js";

const NominationSchema = z.object({
  chancellorId: z.string().uuid(),
});

function emitError(socket: Socket, code: string, message: string) {
  socket.emit(SOCKET_EVENTS.ERROR, { code, message });
}

export function registerNominationHandlers(io: Server, socket: Socket) {
  socket.on(SOCKET_EVENTS.NOMINATION_CHANCELLOR, async (raw: NominationChancellorPayload) => {
    const parsed = NominationSchema.safeParse(raw);
    if (!parsed.success) {
      return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    }
    const { chancellorId } = parsed.data;

    const sessionId = getSessionId(socket);
    if (!sessionId) return emitError(socket, "NO_SESSION", "No session.");

    const player = await prisma.player.findFirst({ where: { sessionId } });
    if (!player) return emitError(socket, "SESSION_NOT_FOUND", "Player not found.");

    // Find the active game for this player's lobby
    const activeGame = await prisma.game.findFirst({
      where: { lobbyId: player.lobbyId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!activeGame) return emitError(socket, "GAME_NOT_FOUND", "No active game.");

    const state = await getGameState(activeGame.id);
    if (!state) return emitError(socket, "GAME_NOT_FOUND", "Game state not found.");

    if (state.phase !== "nomination") {
      return emitError(socket, "INVALID_PHASE", "Not in the nomination phase.");
    }
    if (state.presidentId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "You are not the president.");
    }

    const eligible = getEligibleChancellors(state);
    if (!eligible.includes(chancellorId)) {
      return emitError(socket, "PLAYER_INELIGIBLE", "That player cannot be nominated as chancellor.");
    }

    state.chancellorId = chancellorId;
    state.phase = "election";
    state.votes = {};
    await setGameState(state);

    io.to(state.lobbyId).emit(SOCKET_EVENTS.NOMINATION_MADE, {
      presidentId: state.presidentId,
      chancellorId,
    });

    const sync: GameStateSync = {
      phase: state.phase,
      presidentId: state.presidentId,
      chancellorId: state.chancellorId,
      lastPresidentId: state.lastPresidentId,
      lastChancellorId: state.lastChancellorId,
      electionTracker: state.electionTracker,
      liberalPolicies: state.liberalPolicies,
      fascistPolicies: state.fascistPolicies,
      vetoUnlocked: state.vetoUnlocked,
      players: await getPublicPlayers(player.lobbyId),
    };
    io.to(state.lobbyId).emit(SOCKET_EVENTS.GAME_STATE_SYNC, sync);
  });
}

async function getPublicPlayers(lobbyId: string) {
  const players = await prisma.player.findMany({ where: { lobbyId } });
  return players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    isAlive: p.isAlive,
    seatIndex: p.seatIndex,
  }));
}
