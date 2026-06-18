import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  SOCKET_EVENTS,
  type ExecutiveChoosePlayerPayload,
  type GameStateSync,
} from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { getSessionId } from "../session.js";
import { getNextPresidentId, getExecutiveAction } from "../game/engine.js";
import { getGameState, setGameState } from "../game/state.js";
import { endGame } from "./endGame.js";

const ChoosePlayerSchema = z.object({
  targetId: z.string().uuid(),
});

function emitError(socket: Socket, code: string, message: string) {
  socket.emit(SOCKET_EVENTS.ERROR, { code, message });
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

export function registerExecutiveHandlers(io: Server, socket: Socket) {
  socket.on(SOCKET_EVENTS.EXECUTIVE_CHOOSE_PLAYER, async (raw: ExecutiveChoosePlayerPayload) => {
    const parsed = ChoosePlayerSchema.safeParse(raw);
    if (!parsed.success) return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    const { targetId } = parsed.data;

    const sessionId = getSessionId(socket);
    if (!sessionId) return emitError(socket, "NO_SESSION", "No session.");

    const player = await prisma.player.findFirst({ where: { sessionId } });
    if (!player) return emitError(socket, "SESSION_NOT_FOUND", "Player not found.");

    const activeGame = await prisma.game.findFirst({
      where: { lobbyId: player.lobbyId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!activeGame) return emitError(socket, "GAME_NOT_FOUND", "No active game.");

    const state = await getGameState(activeGame.id);
    if (!state) return emitError(socket, "GAME_NOT_FOUND", "Game state not found.");

    if (state.phase !== "executive_action") {
      return emitError(socket, "INVALID_PHASE", "Not in the executive action phase.");
    }
    if (state.presidentId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "Only the president can perform executive actions.");
    }
    if (!state.alivePlayers.includes(targetId)) {
      return emitError(socket, "PLAYER_INELIGIBLE", "Target player is not alive.");
    }

    // Determine which action is currently required
    const action = getExecutiveAction(state.fascistPolicies, state.alivePlayers.length);
    if (!action) return emitError(socket, "INVALID_STATE", "No executive action expected.");

    if (action === "inspect") {
      const targetGamePlayer = await prisma.gamePlayer.findFirst({
        where: { gameId: activeGame.id, playerId: targetId },
      });
      if (!targetGamePlayer) return emitError(socket, "PLAYER_NOT_FOUND", "Target not in this game.");

      const party = targetGamePlayer.role === "LIBERAL" ? "liberal" : "fascist";
      state.inspectResult = { targetId, party };
      await setGameState(state);

      io.to(socket.id).emit(SOCKET_EVENTS.EXECUTIVE_INSPECT_RESULT, { targetId, party });
      return;
    }

    if (action === "special_election") {
      // Store where to return after this one special round
      const { nextId: normalNext } = getNextPresidentId(
        state.alivePlayers,
        state.presidentId,
        null,
      );
      state.specialElectionReturnId = normalNext;
      state.presidentId = targetId;
      state.chancellorId = null;
      state.phase = "nomination";
      await setGameState(state);

      io.to(state.lobbyId).emit(SOCKET_EVENTS.EXECUTIVE_SPECIAL_ELECTION, { newPresidentId: targetId });

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
        isSpecialElection: !!state.specialElectionReturnId,
        specialElectionReturnId: state.specialElectionReturnId,
        players: await getPublicPlayers(player.lobbyId),
      };
      io.to(state.lobbyId).emit(SOCKET_EVENTS.GAME_STATE_SYNC, sync);
      return;
    }

    if (action === "execute") {
      // Mark the target as executed in Postgres
      await prisma.gamePlayer.updateMany({
        where: { gameId: activeGame.id, playerId: targetId },
        data: { wasExecuted: true },
      });
      await prisma.player.update({
        where: { id: targetId },
        data: { isAlive: false },
      });

      // Remove from alive list in Redis
      const executedIdx = state.alivePlayers.indexOf(targetId);
      state.alivePlayers = state.alivePlayers.filter((id) => id !== targetId);

      // If the executed player was the special-election return point, advance it to the
      // next alive player at the same rotation position (avoids a dead president next turn)
      if (state.specialElectionReturnId === targetId) {
        state.specialElectionReturnId =
          state.alivePlayers.length > 0
            ? state.alivePlayers[executedIdx % state.alivePlayers.length]
            : null;
      }

      const targetGamePlayer = await prisma.gamePlayer.findFirst({
        where: { gameId: activeGame.id, playerId: targetId },
      });
      const wasHitler = targetGamePlayer?.role === "HITLER";

      io.to(state.lobbyId).emit(SOCKET_EVENTS.EXECUTIVE_PLAYER_EXECUTED, {
        playerId: targetId,
        wasHitler,
      });

      if (wasHitler) {
        await setGameState(state);
        await endGame(io, state, activeGame.id, "liberal", "hitler_killed");
        return;
      }

      await advanceTurn(io, state, player.lobbyId);
      return;
    }
  });

  socket.on(SOCKET_EVENTS.EXECUTIVE_INSPECT_CONFIRM, async () => {
    const sessionId = getSessionId(socket);
    if (!sessionId) return emitError(socket, "NO_SESSION", "No session.");

    const player = await prisma.player.findFirst({ where: { sessionId } });
    if (!player) return emitError(socket, "SESSION_NOT_FOUND", "Player not found.");

    const activeGame = await prisma.game.findFirst({
      where: { lobbyId: player.lobbyId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!activeGame) return emitError(socket, "GAME_NOT_FOUND", "No active game.");

    const state = await getGameState(activeGame.id);
    if (!state) return emitError(socket, "GAME_NOT_FOUND", "Game state not found.");

    if (state.phase !== "executive_action") {
      return emitError(socket, "INVALID_PHASE", "Not in the executive action phase.");
    }
    if (state.presidentId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "Only the president can confirm the inspect.");
    }

    const action = getExecutiveAction(state.fascistPolicies, state.alivePlayers.length);
    if (action !== "inspect") {
      return emitError(socket, "INVALID_STATE", "Current executive action is not inspect.");
    }

    const inspectedId = state.inspectResult?.targetId;
    const inspectingPresidentId = state.presidentId;
    state.inspectResult = null;

    if (inspectedId) {
      io.to(state.lobbyId).emit(SOCKET_EVENTS.EXECUTIVE_INSPECT_CONFIRMED, {
        inspectedPlayerId: inspectedId,
        presidentId: inspectingPresidentId,
      });
    }

    await advanceTurn(io, state, player.lobbyId);
  });

  socket.on(SOCKET_EVENTS.EXECUTIVE_PEEK_CONFIRM, async () => {
    const sessionId = getSessionId(socket);
    if (!sessionId) return emitError(socket, "NO_SESSION", "No session.");

    const player = await prisma.player.findFirst({ where: { sessionId } });
    if (!player) return emitError(socket, "SESSION_NOT_FOUND", "Player not found.");

    const activeGame = await prisma.game.findFirst({
      where: { lobbyId: player.lobbyId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!activeGame) return emitError(socket, "GAME_NOT_FOUND", "No active game.");

    const state = await getGameState(activeGame.id);
    if (!state) return emitError(socket, "GAME_NOT_FOUND", "Game state not found.");

    if (state.phase !== "executive_action") {
      return emitError(socket, "INVALID_PHASE", "Not in the executive action phase.");
    }
    if (state.presidentId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "Only the president can confirm the peek.");
    }

    const action = getExecutiveAction(state.fascistPolicies, state.alivePlayers.length);
    if (action !== "peek") {
      return emitError(socket, "INVALID_STATE", "Current executive action is not peek.");
    }

    state.peekCards = null;
    await advanceTurn(io, state, player.lobbyId);
  });
}

async function advanceTurn(io: Server, state: Awaited<ReturnType<typeof getGameState>>, lobbyId: string) {
  if (!state) return;

  const { nextId, clearSpecial } = getNextPresidentId(
    state.alivePlayers,
    state.presidentId,
    state.specialElectionReturnId,
  );
  state.presidentId = nextId;
  if (clearSpecial) state.specialElectionReturnId = null;
  state.chancellorId = null;
  state.phase = "nomination";

  await setGameState(state);

  const publicPlayers = await prisma.player.findMany({ where: { lobbyId } });
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
    isSpecialElection: !!state.specialElectionReturnId,
    specialElectionReturnId: state.specialElectionReturnId,
    players: publicPlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isAlive: p.isAlive,
      seatIndex: p.seatIndex,
    })),
  };
  io.to(state.lobbyId).emit(SOCKET_EVENTS.GAME_STATE_SYNC, sync);
}
