# Database

## Overview

| Store | Purpose |
|-------|---------|
| PostgreSQL (via Prisma) | Persistent data: lobbies, players, finished games, round history |
| Redis (via ioredis) | Ephemeral game state: active round data, votes, card piles |

The split exists because game state is read/written on every socket event and must be fast. PostgreSQL receives the final result when a game ends.

## PostgreSQL schema (Prisma)

```prisma
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

  lobby       Lobby    @relation(fields: [lobbyId], references: [id])
  gamePlayers GamePlayer[]

  // Future login extension: add userId String? and a User relation
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

Players have no accounts. Identity is managed via `sessionId`:

1. On first visit, the server generates a UUID `sessionId` and sets it as an HTTP-only cookie.
2. The `sessionId` is stored in `players.sessionId`.
3. On reconnect, the client sends `lobby:reconnect` with the `sessionId` from the cookie.
4. The server finds the player by `sessionId`, updates `players.socketId` to the new socket ID, and sends `game:state_sync` to restore the client's view.

`socketId` = current connection (changes on every reconnect)
`sessionId` = stable identity (persists in cookie)
