import type { Server } from "socket.io";
import { SOCKET_EVENTS, type Winner, type WinCondition } from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { deleteGameState, type RedisGameState } from "../game/state.js";

export async function endGame(
  io: Server,
  state: RedisGameState,
  gameId: string,
  winner: Winner,
  condition: WinCondition,
): Promise<void> {
  // Persist final result
  await prisma.game.update({
    where: { id: gameId },
    data: {
      winner: winner.toUpperCase() as "LIBERAL" | "FASCIST",
      winCondition: conditionToEnum(condition),
      endedAt: new Date(),
      liberalPolicies: state.liberalPolicies,
      fascistPolicies: state.fascistPolicies,
    },
  });

  await prisma.lobby.update({
    where: { id: state.lobbyId },
    data: { status: "FINISHED" },
  });

  // Reveal all roles
  const gamePlayers = await prisma.gamePlayer.findMany({ where: { gameId } });
  const roles: Record<string, "liberal" | "fascist" | "hitler"> = {};
  for (const gp of gamePlayers) {
    if (gp.playerId) {
      roles[gp.playerId] = gp.role.toLowerCase() as "liberal" | "fascist" | "hitler";
    }
  }

  io.to(state.lobbyId).emit(SOCKET_EVENTS.GAME_OVER, { winner, condition, roles });

  await deleteGameState(gameId);
}

function conditionToEnum(condition: WinCondition): "POLICIES" | "HITLER_ELECTED" | "HITLER_KILLED" {
  switch (condition) {
    case "policies": return "POLICIES";
    case "hitler_elected": return "HITLER_ELECTED";
    case "hitler_killed": return "HITLER_KILLED";
  }
}
