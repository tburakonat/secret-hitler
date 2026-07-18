import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  SOCKET_EVENTS,
  type LegislativePresidentDiscardPayload,
  type LegislativeChancellorEnactPayload,
  type LegislativeVetoResponsePayload,
  type GameStateSync,
} from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { getSessionId } from "../session.js";
import {
  drawCards,
  peekTopCards,
  getExecutiveAction,
  getNextPresidentId,
  checkWinCondition,
} from "../game/engine.js";
import { getGameState, setGameState } from "../game/state.js";
import { endGame } from "./endGame.js";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const PresidentDiscardSchema = z.object({ cardIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]) });
const ChancellorEnactSchema = z.object({ cardIndex: z.union([z.literal(0), z.literal(1)]) });
const VetoResponseSchema = z.object({ accept: z.boolean() });

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerLegislativeHandlers(io: Server, socket: Socket) {
  // ── PRESIDENT_DISCARD ───────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LEGISLATIVE_PRESIDENT_DISCARD, async (raw: LegislativePresidentDiscardPayload) => {
    const parsed = PresidentDiscardSchema.safeParse(raw);
    if (!parsed.success) return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    const { cardIndex } = parsed.data;

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

    if (state.phase !== "legislative_president") {
      return emitError(socket, "INVALID_PHASE", "Not in the presidential discard phase.");
    }
    if (state.presidentId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "You are not the president.");
    }
    if (!state.presidentialCards || state.presidentialCards.length !== 3) {
      return emitError(socket, "INVALID_STATE", "No presidential cards in state.");
    }

    // Remove the discarded card; remaining 2 go to chancellor
    const cards = [...state.presidentialCards];
    cards.splice(cardIndex, 1);
    state.discardPile.push(state.presidentialCards[cardIndex]);

    state.chancellorCards = cards as [string, string] as any;
    state.presidentialCards = null;
    state.phase = "legislative_chancellor";
    await setGameState(state);

    // Send 2 cards privately to chancellor
    const chancellorPlayer = await prisma.player.findUnique({
      where: { id: state.chancellorId! },
    });
    if (chancellorPlayer?.socketId) {
      io.to(chancellorPlayer.socketId).emit(SOCKET_EVENTS.LEGISLATIVE_CHANCELLOR_CARDS, {
        cards,
        vetoAvailable: state.vetoUnlocked,
      });
    }

    // Broadcast phase change to all players
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

  // ── CHANCELLOR_ENACT ────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LEGISLATIVE_CHANCELLOR_ENACT, async (raw: LegislativeChancellorEnactPayload) => {
    const parsed = ChancellorEnactSchema.safeParse(raw);
    if (!parsed.success) return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    const { cardIndex } = parsed.data;

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

    if (state.phase !== "legislative_chancellor") {
      return emitError(socket, "INVALID_PHASE", "Not in the chancellor enact phase.");
    }
    if (state.chancellorId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "You are not the chancellor.");
    }
    if (!state.chancellorCards || state.chancellorCards.length !== 2) {
      return emitError(socket, "INVALID_STATE", "No chancellor cards in state.");
    }

    const enacted = state.chancellorCards[cardIndex];
    const discarded = state.chancellorCards[cardIndex === 0 ? 1 : 0];

    state.discardPile.push(discarded);
    state.chancellorCards = null;
    state.vetoPending = false;
    state.electionTracker = 0;

    // Record last government for ineligibility
    state.lastPresidentId = state.presidentId;
    state.lastChancellorId = state.chancellorId;

    if (enacted === "liberal") {
      state.liberalPolicies += 1;
    } else {
      state.fascistPolicies += 1;
      if (state.fascistPolicies === 5) state.vetoUnlocked = true;
    }

    io.to(state.lobbyId).emit(SOCKET_EVENTS.LEGISLATIVE_POLICY_ENACTED, {
      policy: enacted,
      liberalPolicies: state.liberalPolicies,
      fascistPolicies: state.fascistPolicies,
      electionTracker: 0,
    });

    // Check win condition
    const win = checkWinCondition(state);
    if (win) {
      await setGameState(state);
      await endGame(io, state, activeGame.id, win.winner, win.condition);
      return;
    }

    // Check executive action if a fascist policy was enacted
    if (enacted === "fascist") {
      const action = getExecutiveAction(state.fascistPolicies, state.alivePlayers.length);
      if (action) {
        if (action === "peek") {
          // Peek pauses the game: president views the top 3 cards, then confirms to advance
          state.peekCards = peekTopCards(state, 3);
          state.phase = "executive_action";
          await setGameState(state);

          const presidentPlayer = await prisma.player.findUnique({ where: { id: state.presidentId } });
          if (presidentPlayer?.socketId) {
            io.to(presidentPlayer.socketId).emit(SOCKET_EVENTS.EXECUTIVE_PEEK_RESULT, { cards: state.peekCards });
          }

          io.to(state.lobbyId).emit(SOCKET_EVENTS.EXECUTIVE_ACTION_REQUIRED, { action: "peek" });

          const peekSync: GameStateSync = {
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
          io.to(state.lobbyId).emit(SOCKET_EVENTS.GAME_STATE_SYNC, peekSync);
          return;
        } else {
          // inspect / special_election / execute — president must choose a player
          state.phase = "executive_action";
          await setGameState(state);

          io.to(state.lobbyId).emit(SOCKET_EVENTS.EXECUTIVE_ACTION_REQUIRED, { action });

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
      }
    }

    // Advance to next nomination round
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

  // ── VETO_REQUEST ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LEGISLATIVE_VETO_REQUEST, async () => {
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

    if (state.phase !== "legislative_chancellor") {
      return emitError(socket, "INVALID_PHASE", "Not in the chancellor phase.");
    }
    if (state.chancellorId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "You are not the chancellor.");
    }
    if (!state.vetoUnlocked) {
      return emitError(socket, "VETO_NOT_AVAILABLE", "Veto power is not yet unlocked.");
    }

    state.vetoPending = true;
    await setGameState(state);

    // Broadcast veto request to all players — a veto request is public game information
    io.to(state.lobbyId).emit(SOCKET_EVENTS.LEGISLATIVE_VETO_REQUESTED, {});
  });

  // ── VETO_RESPONSE ───────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LEGISLATIVE_VETO_RESPONSE, async (raw: LegislativeVetoResponsePayload) => {
    const parsed = VetoResponseSchema.safeParse(raw);
    if (!parsed.success) return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    const { accept } = parsed.data;

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

    if (state.phase !== "legislative_chancellor") {
      return emitError(socket, "INVALID_PHASE", "Not in the chancellor phase.");
    }
    if (state.presidentId !== player.id) {
      return emitError(socket, "NOT_YOUR_TURN", "You are not the president.");
    }
    if (!state.vetoPending) {
      return emitError(socket, "NO_VETO_PENDING", "No veto has been requested.");
    }

    if (accept) {
      // Discard both cards, increment election tracker
      if (state.chancellorCards) {
        state.discardPile.push(...state.chancellorCards);
        state.chancellorCards = null;
      }
      state.vetoPending = false;
      state.electionTracker += 1;

      if (state.electionTracker >= 3) {
        // Force-enact
        const [topCard] = drawCards(state, 1);
        state.electionTracker = 0;

        if (topCard === "liberal") {
          state.liberalPolicies += 1;
        } else {
          state.fascistPolicies += 1;
          if (state.fascistPolicies === 5) state.vetoUnlocked = true;
        }

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

      io.to(state.lobbyId).emit(SOCKET_EVENTS.LEGISLATIVE_VETO_RESOLVED, { accepted: true });

      // Advance turn
      const { nextId, clearSpecial } = getNextPresidentId(
        state.alivePlayers,
        state.presidentId,
        state.specialElectionReturnId,
      );
      state.presidentId = nextId;
      if (clearSpecial) state.specialElectionReturnId = null;
      state.chancellorId = null;
      state.phase = "nomination";
    } else {
      // Veto denied — chancellor must enact; re-send cards without veto option
      state.vetoPending = false;
      await setGameState(state);

      io.to(state.lobbyId).emit(SOCKET_EVENTS.LEGISLATIVE_VETO_RESOLVED, { accepted: false });

      const chancellorPlayer = await prisma.player.findUnique({ where: { id: state.chancellorId! } });
      if (chancellorPlayer?.socketId) {
        io.to(chancellorPlayer.socketId).emit(SOCKET_EVENTS.LEGISLATIVE_CHANCELLOR_CARDS, {
          cards: state.chancellorCards,
          vetoAvailable: false,
        });
      }
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
