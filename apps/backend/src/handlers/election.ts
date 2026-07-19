import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  SOCKET_EVENTS,
  type ElectionVotePayload,
  type GameStateSync,
} from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { requirePlayer } from "../lib/socketAuth.js";
import { countVotes, drawCards, getNextPresidentId, checkWinCondition } from "../game/engine.js";
import { getGameState, setGameState } from "../game/state.js";
import { endGame } from "./endGame.js";

const VoteSchema = z.object({
  vote: z.enum(["ja", "nein"]),
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

export function registerElectionHandlers(io: Server, socket: Socket) {
  socket.on(SOCKET_EVENTS.ELECTION_VOTE, async (raw: ElectionVotePayload) => {
    const parsed = VoteSchema.safeParse(raw);
    if (!parsed.success) {
      return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    }
    const { vote } = parsed.data;

    const player = await requirePlayer(socket);
    if (!player) return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    if (!player.isAlive) return emitError(socket, "PLAYER_DEAD", "Dead players cannot vote.");

    const activeGame = await prisma.game.findFirst({
      where: { lobbyId: player.lobbyId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!activeGame) return emitError(socket, "GAME_NOT_FOUND", "No active game.");

    const state = await getGameState(activeGame.id);
    if (!state) return emitError(socket, "GAME_NOT_FOUND", "Game state not found.");

    if (state.phase !== "election") {
      return emitError(socket, "INVALID_PHASE", "Not in the election phase.");
    }
    if (player.id in state.votes) {
      return emitError(socket, "ALREADY_VOTED", "You have already voted.");
    }

    state.votes[player.id] = vote;

    // Broadcast vote count to all players (without revealing individual votes)
    io.to(state.lobbyId).emit(SOCKET_EVENTS.ELECTION_VOTE_CAST, {
      voteCount: Object.keys(state.votes).length,
    });

    // Check if all living players have voted
    const allVoted = state.alivePlayers.every((id) => id in state.votes);
    if (!allVoted) {
      await setGameState(state);
      return;
    }

    // All votes are in — resolve the election
    const { passed } = countVotes(state.votes);

    io.to(state.lobbyId).emit(SOCKET_EVENTS.ELECTION_RESULT, {
      votes: state.votes,
      passed,
      electionTracker: passed ? 0 : state.electionTracker + 1,
    });

    if (passed) {
      // Check Hitler-as-Chancellor win condition
      if (state.fascistPolicies >= 3 && state.chancellorId) {
        const chancellorRecord = await prisma.gamePlayer.findFirst({
          where: { gameId: activeGame.id, playerId: state.chancellorId },
        });
        if (chancellorRecord?.role === "HITLER") {
          await endGame(io, state, activeGame.id, "fascist", "hitler_elected");
          return;
        }
      }

      // Draw 3 cards for the president
      const cards = drawCards(state, 3) as [string, string, string];
      state.presidentialCards = cards as any;
      state.phase = "legislative_president";
      state.electionTracker = 0;
      await setGameState(state);

      // Send cards privately to president
      const presidentPlayer = await prisma.player.findUnique({ where: { id: state.presidentId } });
      if (presidentPlayer?.socketId) {
        io.to(presidentPlayer.socketId).emit(SOCKET_EVENTS.LEGISLATIVE_PRESIDENT_CARDS, {
          cards,
        });
      }
    } else {
      state.electionTracker += 1;

      if (state.electionTracker >= 3) {
        // Force-enact the top card
        const [topCard] = drawCards(state, 1);
        state.electionTracker = 0;

        if (topCard === "liberal") {
          state.liberalPolicies += 1;
        } else {
          state.fascistPolicies += 1;
        }

        // Record last government as null (no government was formed)
        state.lastPresidentId = null;
        state.lastChancellorId = null;

        io.to(state.lobbyId).emit(SOCKET_EVENTS.LEGISLATIVE_POLICY_ENACTED, {
          policy: topCard,
          liberalPolicies: state.liberalPolicies,
          fascistPolicies: state.fascistPolicies,
          electionTracker: 0,
        });

        const win = checkWinCondition(state);
        if (win) {
          await setGameState(state);
          await endGame(io, state, activeGame.id, win.winner, win.condition);
          return;
        }
      }

      // Advance to next president
      const { nextId, clearSpecial } = getNextPresidentId(
        state.alivePlayers,
        state.presidentId,
        state.specialElectionReturnId,
      );
      state.presidentId = nextId;
      if (clearSpecial) state.specialElectionReturnId = null;
      state.chancellorId = null;
      state.phase = "nomination";
    }

    await setGameState(state);

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
  });
}
