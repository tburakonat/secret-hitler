import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  SOCKET_EVENTS,
  GAME_CONSTANTS,
  type LobbyCreatePayload,
  type LobbyJoinPayload,
  type LobbyUpdatedPayload,
  type LobbyUpdateSettingsPayload,
  type GameStateSync,
} from "@secret-hitler/shared";
import { prisma } from "../lib/prisma.js";
import { getUserId, requirePlayer } from "../lib/socketAuth.js";
import { abortActiveGame, buildLobbyUpdatedPayload, leaveLobby } from "../game/lifecycle.js";
import { assignRoles, buildDeck } from "../game/engine.js";
import { setGameState, getGameState } from "../game/state.js";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const LobbyCreateSchema = z.object({
  isPublic: z.boolean(),
  maxPlayers: z.number().int().min(GAME_CONSTANTS.MIN_PLAYERS).max(GAME_CONSTANTS.MAX_PLAYERS),
});

const LobbyUpdateSettingsSchema = z.object({
  isPublic: z.boolean(),
  maxPlayers: z.number().int().min(GAME_CONSTANTS.MIN_PLAYERS).max(GAME_CONSTANTS.MAX_PLAYERS),
});

const LobbyJoinSchema = z.object({
  code: z.string().length(GAME_CONSTANTS.LOBBY_CODE_LENGTH).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitError(socket: Socket, code: string, message: string) {
  socket.emit(SOCKET_EVENTS.ERROR, { code, message });
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const existing = await prisma.lobby.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique lobby code");
}

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerLobbyHandlers(io: Server, socket: Socket) {
  // ── LOBBY_CREATE ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_CREATE, async (raw: LobbyCreatePayload) => {
    const parsed = LobbyCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    }
    const { isPublic, maxPlayers } = parsed.data;

    const userId = getUserId(socket);

    // If this user is already in a lobby, reject (DB unique on userId as backstop)
    const existing = await requirePlayer(socket);
    if (existing) {
      return emitError(socket, "ALREADY_IN_LOBBY", "You are already in a lobby.");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return emitError(socket, "USER_NOT_FOUND", "Your account no longer exists.");
    }

    const code = await generateUniqueCode();

    const lobby = await prisma.lobby.create({
      data: {
        code,
        isPublic,
        maxPlayers,
        players: {
          create: {
            socketId: socket.id,
            nickname: user.nickname,
            isHost: true,
            seatIndex: 0,
            userId,
          },
        },
      },
      include: { players: true },
    });

    socket.join(lobby.id);

    const hostPlayer = lobby.players.find((p) => p.isHost)!;
    const payload = buildLobbyUpdatedPayload(lobby.id, lobby.code, lobby.players, lobby.maxPlayers, lobby.isPublic);
    socket.emit(SOCKET_EVENTS.LOBBY_UPDATED, { ...payload, selfId: hostPlayer.id });
  });

  // ── LOBBY_JOIN ──────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_JOIN, async (raw: LobbyJoinPayload) => {
    const parsed = LobbyJoinSchema.safeParse(raw);
    if (!parsed.success) {
      return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    }
    const { code } = parsed.data;

    const userId = getUserId(socket);

    const alreadyIn = await requirePlayer(socket);
    if (alreadyIn) {
      return emitError(socket, "ALREADY_IN_LOBBY", "You are already in a lobby.");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return emitError(socket, "USER_NOT_FOUND", "Your account no longer exists.");
    }

    let lobby;
    if (code) {
      lobby = await prisma.lobby.findUnique({
        where: { code },
        include: { players: true },
      });
    } else {
      // Find any public lobby with room that is still waiting
      const lobbies = await prisma.lobby.findMany({
        where: { isPublic: true, status: "WAITING" },
        include: { players: true },
      });
      lobby = lobbies.find((l) => l.players.length < l.maxPlayers) ?? null;
    }

    if (!lobby) {
      return emitError(socket, "LOBBY_NOT_FOUND", "No lobby found with that code.");
    }
    if (lobby.status !== "WAITING") {
      return emitError(socket, "GAME_ALREADY_STARTED", "This lobby's game has already started.");
    }
    if (lobby.players.length >= lobby.maxPlayers) {
      return emitError(socket, "LOBBY_FULL", "This lobby is full.");
    }

    const player = await prisma.player.create({
      data: {
        lobbyId: lobby.id,
        socketId: socket.id,
        nickname: user.nickname,
        isHost: false,
        seatIndex: lobby.players.length,
        userId,
      },
    });

    socket.join(lobby.id);

    const updatedPlayers = [...lobby.players, player];
    const payload = buildLobbyUpdatedPayload(lobby.id, lobby.code, updatedPlayers, lobby.maxPlayers, lobby.isPublic);
    // Private to the joiner (with selfId), broadcast to everyone else
    socket.emit(SOCKET_EVENTS.LOBBY_UPDATED, { ...payload, selfId: player.id });
    socket.to(lobby.id).emit(SOCKET_EVENTS.LOBBY_UPDATED, payload);
  });

  // ── LOBBY_RECONNECT ─────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_RECONNECT, async () => {
    const player = await requirePlayer(socket, {
      lobby: {
        include: {
          players: true,
          games: {
            orderBy: { startedAt: "desc" },
            take: 1,
            include: { gamePlayers: { include: { player: true } } },
          },
        },
      },
    });

    if (!player) {
      return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    }

    await prisma.player.update({
      where: { id: player.id },
      data: { socketId: socket.id },
    });

    socket.join(player.lobbyId);

    const lobby = player.lobby;
    const activeGame = lobby.games[0];

    if (activeGame && lobby.status === "IN_GAME") {
      const state = await getGameState(activeGame.id);
      if (state) {
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
          players: lobby.players.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            isAlive: p.isAlive,
            seatIndex: p.seatIndex,
          })),
        };

        // 1. GAME_STATE_SYNC first (triggers applyStateSync which resets private state)
        const hostPlayer = lobby.players.find((p) => p.isHost);
        socket.emit(SOCKET_EVENTS.GAME_STATE_SYNC, { ...sync, selfId: player.id, hostId: hostPlayer?.id });

        // 2. Re-send private role + vote so the client can restore them after the reset
        const myGamePlayer = activeGame.gamePlayers.find((gp) => gp.playerId === player.id);
        if (myGamePlayer) {
          const role = myGamePlayer.role.toLowerCase() as "liberal" | "fascist" | "hitler";
          let teammates: { id: string; nickname: string; role: "fascist" | "hitler" }[] | undefined;
          if (role === "fascist") {
            teammates = activeGame.gamePlayers
              .filter((gp) => gp.playerId !== player.id && (gp.role === "FASCIST" || gp.role === "HITLER"))
              .map((gp) => ({ id: gp.playerId ?? gp.player?.id ?? "", nickname: gp.player?.nickname ?? gp.nickname ?? "", role: gp.role.toLowerCase() as "fascist" | "hitler" }));
          } else if (role === "hitler" && lobby.players.length <= 6) {
            teammates = activeGame.gamePlayers
              .filter((gp) => gp.role === "FASCIST")
              .map((gp) => ({ id: gp.playerId ?? gp.player?.id ?? "", nickname: gp.player?.nickname ?? gp.nickname ?? "", role: "fascist" as const }));
          }
          const myVote = state.votes[player.id] as import("@secret-hitler/shared").Vote | undefined;
          socket.emit(SOCKET_EVENTS.GAME_ROLE_ASSIGNED, { role, teammates, myVote });
        }

        // 3. Restore election progress if voting is currently in progress
        if (state.phase === "election") {
          socket.emit(SOCKET_EVENTS.ELECTION_VOTE_CAST, {
            voteCount: Object.keys(state.votes).length,
          });
        }

        // 4. Restore peek cards if president reconnects during the peek executive action
        if (state.phase === "executive_action" && state.peekCards && player.id === state.presidentId) {
          socket.emit(SOCKET_EVENTS.EXECUTIVE_PEEK_RESULT, { cards: state.peekCards });
        }

        // 5. Restore inspect result if president reconnects during the inspect executive action
        if (state.phase === "executive_action" && state.inspectResult && player.id === state.presidentId) {
          socket.emit(SOCKET_EVENTS.EXECUTIVE_INSPECT_RESULT, state.inspectResult);
        }

        return;
      }
    }

    const payload = buildLobbyUpdatedPayload(lobby.id, lobby.code, lobby.players, lobby.maxPlayers, lobby.isPublic);
    socket.emit(SOCKET_EVENTS.LOBBY_UPDATED, { ...payload, selfId: player.id });
  });

  // ── LOBBY_START ─────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_START, async () => {
    const player = await requirePlayer(socket, { lobby: { include: { players: true } } });

    if (!player) {
      return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    }
    if (!player.isHost) {
      return emitError(socket, "NOT_HOST", "Only the host can start the game.");
    }

    const { lobby } = player;
    const playerCount = lobby.players.length;

    if (playerCount < GAME_CONSTANTS.MIN_PLAYERS || playerCount > GAME_CONSTANTS.MAX_PLAYERS) {
      return emitError(
        socket,
        "INVALID_PLAYER_COUNT",
        `Need ${GAME_CONSTANTS.MIN_PLAYERS}–${GAME_CONSTANTS.MAX_PLAYERS} players to start.`,
      );
    }
    if (lobby.status === "IN_GAME") {
      return emitError(socket, "GAME_ALREADY_STARTED", "This game has already started.");
    }

    // Reset player state when starting a new game after a finished one
    if (lobby.status === "FINISHED") {
      await prisma.player.updateMany({ where: { lobbyId: lobby.id }, data: { isAlive: true } });
    }

    // Assign roles
    const playerIds = lobby.players.map((p) => p.id);
    const roles = assignRoles(playerIds);

    // Pick a random first president
    const firstPresidentId = playerIds[Math.floor(Math.random() * playerIds.length)];

    // Persist game + role assignments to Postgres
    const game = await prisma.game.create({
      data: {
        lobbyId: lobby.id,
        gamePlayers: {
          create: playerIds.map((id) => ({
            playerId: id,
            nickname: lobby.players.find((p) => p.id === id)?.nickname ?? "",
            role: roles[id].toUpperCase() as "LIBERAL" | "FASCIST" | "HITLER",
          })),
        },
      },
    });

    await prisma.lobby.update({ where: { id: lobby.id }, data: { status: "IN_GAME" } });

    // Build initial Redis game state
    const deck = buildDeck();
    await setGameState({
      gameId: game.id,
      lobbyId: lobby.id,
      phase: "nomination",
      presidentId: firstPresidentId,
      chancellorId: null,
      lastPresidentId: null,
      lastChancellorId: null,
      drawPile: deck,
      discardPile: [],
      presidentialCards: null,
      chancellorCards: null,
      peekCards: null,
      inspectResult: null,
      votes: {},
      electionTracker: 0,
      liberalPolicies: 0,
      fascistPolicies: 0,
      vetoUnlocked: false,
      vetoPending: false,
      specialElectionReturnId: null,
      alivePlayers: playerIds,
    });

    // Send each player their role privately
    for (const p of lobby.players) {
      if (!p.socketId) continue;
      const role = roles[p.id];

      let teammates: { id: string; nickname: string; role: "fascist" | "hitler" }[] | undefined;

      if (role === "fascist") {
        teammates = lobby.players
          .filter((other) => other.id !== p.id && (roles[other.id] === "fascist" || roles[other.id] === "hitler"))
          .map((other) => ({ id: other.id, nickname: other.nickname, role: roles[other.id] as "fascist" | "hitler" }));
      } else if (role === "hitler" && playerCount <= 6) {
        teammates = lobby.players
          .filter((other) => roles[other.id] === "fascist")
          .map((other) => ({ id: other.id, nickname: other.nickname, role: "fascist" as const }));
      }

      io.to(p.socketId).emit(SOCKET_EVENTS.GAME_ROLE_ASSIGNED, { role, teammates });
    }

    // Broadcast game started + initial state
    const publicPlayers = lobby.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isAlive: p.isAlive,
      seatIndex: p.seatIndex,
      isHost: p.isHost,
    }));

    io.to(lobby.id).emit(SOCKET_EVENTS.GAME_STARTED, {
      gameId: game.id,
      players: publicPlayers,
      firstPresidentId,
    });

    const sync: GameStateSync = {
      phase: "nomination",
      presidentId: firstPresidentId,
      chancellorId: null,
      lastPresidentId: null,
      lastChancellorId: null,
      electionTracker: 0,
      liberalPolicies: 0,
      fascistPolicies: 0,
      vetoUnlocked: false,
      specialElectionReturnId: null,
      players: publicPlayers,
    };
    io.to(lobby.id).emit(SOCKET_EVENTS.GAME_STATE_SYNC, sync);
  });

  // ── GAME_ABORT ──────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.GAME_ABORT, async () => {
    const player = await requirePlayer(socket, { lobby: true });

    if (!player) {
      return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    }
    if (!player.isHost) {
      return emitError(socket, "NOT_HOST", "Only the host can abort the game.");
    }
    if (player.lobby.status !== "IN_GAME") {
      return emitError(socket, "GAME_NOT_ACTIVE", "No game is currently in progress.");
    }

    await abortActiveGame(io, player.lobbyId);
  });

  // ── LOBBY_RETURN ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_RETURN, async () => {
    const player = await requirePlayer(socket, { lobby: { include: { players: true } } });

    if (!player?.lobby) {
      return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    }
    if (player.lobby.status === "IN_GAME") {
      return emitError(socket, "GAME_IN_PROGRESS", "Cannot return while a game is in progress.");
    }

    if (player.lobby.status === "FINISHED") {
      await prisma.$transaction([
        prisma.player.updateMany({ where: { lobbyId: player.lobbyId }, data: { isAlive: true } }),
        prisma.lobby.update({ where: { id: player.lobbyId }, data: { status: "WAITING" } }),
      ]);
    }

    const freshPlayers = await prisma.player.findMany({ where: { lobbyId: player.lobbyId } });
    const payload = buildLobbyUpdatedPayload(player.lobbyId, player.lobby.code, freshPlayers, player.lobby.maxPlayers, player.lobby.isPublic);
    // Inform others (lobby page participants) without forcing the returning player to re-navigate
    socket.to(player.lobbyId).emit(SOCKET_EVENTS.LOBBY_UPDATED, payload);
  });

  // ── LOBBY_LEAVE ─────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_LEAVE, async () => {
    const player = await requirePlayer(socket, { lobby: true });

    if (!player?.lobby) {
      return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    }
    if (player.lobby.status === "IN_GAME") {
      return emitError(socket, "GAME_IN_PROGRESS", "Cannot leave while a game is in progress.");
    }

    // Leave the room first so the departing player doesn't receive the subsequent broadcast.
    socket.leave(player.lobbyId);
    await leaveLobby(io, player.id);
  });

  // ── LOBBY_UPDATE_SETTINGS ───────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LOBBY_UPDATE_SETTINGS, async (raw: LobbyUpdateSettingsPayload) => {
    const parsed = LobbyUpdateSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return emitError(socket, "INVALID_PAYLOAD", parsed.error.message);
    }
    const { isPublic, maxPlayers } = parsed.data;

    const player = await requirePlayer(socket, { lobby: { include: { players: true } } });

    if (!player) {
      return emitError(socket, "NOT_IN_LOBBY", "You are not in a lobby.");
    }
    if (!player.isHost) {
      return emitError(socket, "NOT_HOST", "Only the host can change lobby settings.");
    }
    if (player.lobby.status !== "WAITING") {
      return emitError(socket, "GAME_ALREADY_STARTED", "Cannot change settings after the game has started.");
    }
    if (maxPlayers < player.lobby.players.length) {
      return emitError(
        socket,
        "MAX_PLAYERS_TOO_LOW",
        `Cannot set max players below the current player count (${player.lobby.players.length}).`,
      );
    }

    const updatedLobby = await prisma.lobby.update({
      where: { id: player.lobbyId },
      data: { isPublic, maxPlayers },
    });

    const payload = buildLobbyUpdatedPayload(
      player.lobbyId,
      player.lobby.code,
      player.lobby.players,
      updatedLobby.maxPlayers,
      updatedLobby.isPublic,
    );
    io.to(player.lobbyId).emit(SOCKET_EVENTS.LOBBY_UPDATED, payload);
  });
}
