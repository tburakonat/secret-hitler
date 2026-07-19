# Database

## Overview

| Store | Purpose |
|-------|---------|
| PostgreSQL (via Prisma) | Persistent data: lobbies, players, finished games, round history |
| Redis (via ioredis) | Ephemeral game state: active round data, votes, card piles |

The split exists because game state is read/written on every socket event and must be fast. PostgreSQL receives the final result when a game ends.

## PostgreSQL schema (Prisma)

```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique @db.VarChar(255)  // stored lowercased + trimmed
  passwordHash    String    @db.VarChar(255)          // argon2id
  emailVerifiedAt DateTime?                           // null for now; enables verification later
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  sessions AuthSession[]
  players  Player[]
}

model AuthSession {
  id        String   @id @default(uuid())
  tokenHash String   @unique @db.VarChar(64)  // sha256 hex of the raw authToken cookie value
  userId    String
  createdAt DateTime @default(now())
  expiresAt DateTime                          // 30 days after login

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Lobby {
  id         String   @id @default(uuid())
  code       String   @unique @db.VarChar(6)
  status     LobbyStatus @default(WAITING)
  isPublic   Boolean
  maxPlayers Int      @db.SmallInt
  createdAt  DateTime @default(now())

  players    Player[]
  games      Game[]
}

model Player {
  id          String   @id @default(uuid())
  lobbyId     String
  sessionId   String   @db.VarChar(64)
  socketId    String?  @db.VarChar(64)
  nickname    String   @db.VarChar(32)
  isHost      Boolean  @default(false)
  isAlive     Boolean  @default(true)
  seatIndex   Int      @db.SmallInt
  joinedAt    DateTime @default(now())
  userId      String?  // set when a logged-in user creates/joins a lobby; null for guests

  lobby       Lobby    @relation(fields: [lobbyId], references: [id])
  gamePlayers GamePlayer[]
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
}

model Game {
  id              String    @id @default(uuid())
  lobbyId         String
  winner          Winner?
  winCondition    WinCondition?
  liberalPolicies Int       @default(0) @db.SmallInt
  fascistPolicies Int       @default(0) @db.SmallInt
  startedAt       DateTime  @default(now())
  endedAt         DateTime?

  lobby           Lobby     @relation(fields: [lobbyId], references: [id])
  gamePlayers     GamePlayer[]
  rounds          Round[]
}

model GamePlayer {
  id           String  @id @default(uuid())
  gameId       String
  playerId     String
  role         Role
  wasExecuted  Boolean @default(false)

  game         Game    @relation(fields: [gameId], references: [id])
  player       Player  @relation(fields: [playerId], references: [id])
}

model Round {
  id              String          @id @default(uuid())
  gameId          String
  roundNumber     Int             @db.SmallInt
  presidentId     String
  chancellorId    String?
  voteResult      Boolean?
  policyEnacted   PolicyType?
  executiveAction ExecutiveAction?

  game            Game            @relation(fields: [gameId], references: [id])
}

enum LobbyStatus  { WAITING IN_GAME FINISHED }
enum Role         { LIBERAL FASCIST HITLER }
enum Winner       { LIBERAL FASCIST }
enum WinCondition { POLICIES HITLER_ELECTED HITLER_KILLED }
enum PolicyType   { LIBERAL FASCIST }
enum ExecutiveAction { INSPECT PEEK SPECIAL_ELECTION EXECUTE VETO }
```

## Redis game state

Key: `gamestate:{gameId}` — JSON string, TTL 24 hours.

```typescript
interface RedisGameState {
  phase: GamePhase             // See GamePhase enum in shared/types.ts
  presidentId: string
  chancellorId: string | null  // null until nominated
  lastPresidentId: string | null
  lastChancellorId: string | null

  drawPile: PolicyType[]       // NEVER send to any client
  discardPile: PolicyType[]    // NEVER send to any client
  presidentialCards: PolicyType[] | null  // 3 cards, private to President
  chancellorCards: PolicyType[] | null    // 2 cards, private to Chancellor

  votes: Record<string, 'ja' | 'nein'>   // hidden until all votes are in
  electionTracker: number      // 0–3; resets on successful government or forced enactment

  liberalPolicies: number      // 0–5
  fascistPolicies: number      // 0–6
  vetoUnlocked: boolean        // true after 5th fascist policy
}
```

### Important Redis operations

**Reshuffling the deck** must be done atomically to prevent race conditions:
```typescript
// Use a Redis transaction (MULTI/EXEC via ioredis)
const pipeline = redis.multi()
pipeline.set(`gamestate:${gameId}`, JSON.stringify(newState))
await pipeline.exec()
```

**Reading state before every action:** Always read the full `RedisGameState` at the start of each socket event handler, validate the action against it, update it, and write it back atomically.

## Session and reconnect flow

Game identity is managed via `sessionId` — for guests and logged-in users alike:

1. On first visit, the server generates a UUID `sessionId` and sets it as an HTTP-only cookie.
2. The `sessionId` is stored in `players.sessionId`.
3. On reconnect, the client sends `lobby:reconnect` (no payload); the server reads the `sessionId` from the handshake cookie.
4. The server finds the player by `sessionId`, updates `players.socketId` to the new socket ID, and sends `game:state_sync` to restore the client's view.

`socketId` = current connection (changes on every reconnect)
`sessionId` = stable game identity (persists in cookie)

## Auth sessions (login)

Accounts are optional — guests play exactly as before. Login state lives in a **second, independent cookie** so that logging in or out never affects a running game:

- `POST /api/auth/register` and `/login` mint a random 256-bit token, set it as the HTTP-only `authToken` cookie (30-day TTL), and store its sha256 hash in `AuthSession.tokenHash`.
- `GET /api/auth/me` / socket handlers resolve `authToken` → `AuthSession` → `userId`; missing or expired sessions resolve to `null` (guest).
- `POST /api/auth/logout` deletes the `AuthSession` row (server-side revocation) and clears the cookie.
- When a logged-in user creates or joins a lobby, `players.userId` is set; that is the only place auth touches game logic.
