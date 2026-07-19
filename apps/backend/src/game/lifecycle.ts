import type { Server } from "socket.io";
import { SOCKET_EVENTS, type LobbyUpdatedPayload } from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { deleteGameState } from "./state.js";

// Lobby/game lifecycle operations shared between the socket handlers and the
// REST logout route (which must leave/abort server-side without a socket).

export function buildLobbyUpdatedPayload(
  lobbyId: string,
  code: string,
  players: Array<{
    id: string;
    nickname: string;
    isAlive: boolean;
    seatIndex: number;
    isHost: boolean;
  }>,
  maxPlayers: number,
  isPublic: boolean,
): LobbyUpdatedPayload {
  return {
    lobbyId,
    code,
    players: players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isAlive: p.isAlive,
      seatIndex: p.seatIndex,
      isHost: p.isHost,
    })),
    hostId: players.find((p) => p.isHost)?.id ?? "",
    maxPlayers,
    isPublic,
  };
}

/**
 * Aborts the lobby's active game (if any): deletes the Redis state and all
 * game rows, revives every player, resets the lobby to WAITING, and broadcasts
 * GAME_ABORTED with the fresh lobby state. No-ops if the lobby has no game.
 */
export async function abortActiveGame(io: Server, lobbyId: string): Promise<void> {
  const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId } });
  if (!lobby) return;

  const activeGame = await prisma.game.findFirst({
    where: { lobbyId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (activeGame) await deleteGameState(activeGame.id);

  // No onDelete: Cascade in schema — delete in dependency order: Round → GamePlayer → Game
  await prisma.$transaction([
    ...(activeGame ? [
      prisma.round.deleteMany({ where: { gameId: activeGame.id } }),
      prisma.gamePlayer.deleteMany({ where: { gameId: activeGame.id } }),
      prisma.game.delete({ where: { id: activeGame.id } }),
    ] : []),
    prisma.player.updateMany({ where: { lobbyId }, data: { isAlive: true } }),
    prisma.lobby.update({ where: { id: lobbyId }, data: { status: "WAITING" } }),
  ]);

  const freshPlayers = await prisma.player.findMany({ where: { lobbyId } });
  const payload = buildLobbyUpdatedPayload(lobbyId, lobby.code, freshPlayers, lobby.maxPlayers, lobby.isPublic);
  io.to(lobbyId).emit(SOCKET_EVENTS.GAME_ABORTED, payload);
}

/**
 * Removes a player from their lobby: deletes the row, deletes the lobby when
 * it becomes empty, otherwise reassigns the host (lowest seatIndex) if needed
 * and broadcasts LOBBY_UPDATED. The caller is responsible for socket room
 * membership (socket.leave / disconnectSockets).
 */
export async function leaveLobby(io: Server, playerId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { lobby: { include: { players: true } } },
  });
  if (!player?.lobby) return;

  const { lobby } = player;
  const remainingPlayers = lobby.players.filter((p) => p.id !== player.id);

  if (remainingPlayers.length === 0) {
    await prisma.$transaction([
      prisma.player.delete({ where: { id: player.id } }),
      prisma.lobby.delete({ where: { id: lobby.id } }),
    ]);
    return;
  }

  await prisma.$transaction([
    prisma.player.delete({ where: { id: player.id } }),
    ...(player.isHost
      ? [prisma.player.update({
          where: { id: remainingPlayers.sort((a, b) => a.seatIndex - b.seatIndex)[0].id },
          data: { isHost: true },
        })]
      : []),
  ]);

  const freshPlayers = await prisma.player.findMany({ where: { lobbyId: lobby.id } });
  const payload = buildLobbyUpdatedPayload(lobby.id, lobby.code, freshPlayers, lobby.maxPlayers, lobby.isPublic);
  io.to(lobby.id).emit(SOCKET_EVENTS.LOBBY_UPDATED, payload);
}
