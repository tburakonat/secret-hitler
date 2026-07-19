# CLAUDE.md – Secret Hitler Webapp

This is the main context file for Claude Code. Read this first, then the referenced docs for details.

## What we are building

A real-time multiplayer web implementation of the board game **Secret Hitler** (5–10 players). Players join via public lobbies or private invite links, enter a nickname (no account required), and play a full game in the browser. The app must be mobile-responsive and support multiple languages (i18n).

## Docs index

| File | Contents |
|------|----------|
| `docs/ARCHITECTURE.md` | Monorepo structure, tech stack, deployment |
| `docs/DEPLOYMENT.md` | Container architecture, how to deploy and operate the app (German) |
| `docs/GAME_RULES.md` | Full game rules and logic reference |
| `docs/DATABASE.md` | PostgreSQL schema, Redis state, Prisma setup |
| `docs/SOCKETIO.md` | All Socket.io events, payloads, and direction |

## Core principles

- **Server is the source of truth.** All game logic runs server-side. Clients only render what the server tells them. Never trust client input.
- **Private data stays private.** Roles, draw pile contents, and inspection results are never broadcast to all clients. Use `socket.emit()` for private events, `io.to(roomId).emit()` for broadcasts.
- **Shared types everywhere.** All TypeScript types shared between frontend and backend live in `packages/shared`. Never duplicate types.
- **Validate everything on the server.** Before processing any client event: check it is the correct player's turn, the game is in the correct phase, and the action is legal by the rules.

## Key constraints

- Playing requires an account (email + password + unique nickname). Identity is the `authToken` cookie (httpOnly, opaque token → `AuthSession` → `userId`); socket.io resolves it once at the handshake (`socket.data.userId`) and rejects unauthenticated connections. This must survive page reloads and reconnects. A user can be in at most one lobby (DB-enforced unique `Player.userId`).
- Minimum 5 players, maximum 10 players per game.
- The draw pile has 17 cards: 11 fascist, 6 liberal. When fewer than 3 cards remain, reshuffle the discard pile into a new draw pile (atomically in Redis).
- The "last government" ineligibility rule: the previous President and Chancellor cannot be nominated as Chancellor in the next round.
