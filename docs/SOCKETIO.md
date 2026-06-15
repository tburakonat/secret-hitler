# Socket.io Events

## Conventions

| Direction | Meaning |
|-----------|---------|
| `C → S` | Client sends to server |
| `S → C broadcast` | Server sends to all players in the room (`io.to(roomId).emit`) |
| `S → C private` | Server sends to one player only (`socket.emit`) |

**Never use broadcast for private data.** Roles, card hands, inspection results, and vote contents (before reveal) must always use `socket.emit`.

All incoming payloads (`C → S`) are validated with Zod on the server before processing. On validation failure or illegal action, emit `error` back to the sender only.

Event name constants are defined in `packages/shared/constants.ts` to avoid typo bugs. Always import from there, never hardcode strings.

---

## Lobby events

### `lobby:create` — C → S
Create a new lobby. Server generates the 6-character invite code.
```typescript
{ nickname: string, isPublic: boolean, maxPlayers: number }
```

### `lobby:join` — C → S
Join a lobby by code (private) or without a code (random public lobby).
```typescript
{ nickname: string, code?: string }
```

### `lobby:reconnect` — C → S
Sent immediately on (re)connect if the client has a sessionId cookie. Server finds the player, updates socketId, and sends current state.
```typescript
{ sessionId: string }
```

### `lobby:updated` — S → C broadcast
Sent whenever the lobby changes (player joins, leaves, or host changes).
```typescript
{ players: Player[], hostId: string }
```

### `lobby:start` — C → S
Host-only. Starts the game. Server validates that there are 5–10 players.
```typescript
{} // no payload
```

---

## Game start events

### `game:role_assigned` — S → C private
Each player receives their own role privately. Fascists also receive their teammates list. Hitler receives teammates only in a 5-player game.
```typescript
{
  role: 'liberal' | 'fascist' | 'hitler',
  teammates?: { id: string, nickname: string, role: 'fascist' | 'hitler' }[]
}
```

### `game:started` — S → C broadcast
Signals all clients that the game has begun. Contains initial public state.
```typescript
{
  gameId: string,
  players: Player[],
  firstPresidentId: string
}
```

---

## Nomination & election events

### `nomination:chancellor` — C → S
President nominates a Chancellor. Server checks ineligibility rule.
```typescript
{ chancellorId: string }
```

### `nomination:made` — S → C broadcast
All players see the nomination and can now vote.
```typescript
{ presidentId: string, chancellorId: string }
```

### `election:vote` — C → S
Player casts their vote. Server waits until all living players have voted before revealing results.
```typescript
{ vote: 'ja' | 'nein' }
```

### `election:result` — S → C broadcast
All votes are revealed simultaneously. Sent only after every living player has voted.
```typescript
{
  votes: Record<string, 'ja' | 'nein'>,  // keyed by playerId
  passed: boolean,
  electionTracker: number
}
```

---

## Legislative session events

### `legislative:president_cards` — S → C private
Sent only to the President after a successful election.
```typescript
{ cards: ['fascist' | 'liberal', 'fascist' | 'liberal', 'fascist' | 'liberal'] }
```

### `legislative:president_discard` — C → S
President discards one card by index.
```typescript
{ cardIndex: 0 | 1 | 2 }
```

### `legislative:chancellor_cards` — S → C private
Sent only to the Chancellor after the President has discarded.
```typescript
{
  cards: ['fascist' | 'liberal', 'fascist' | 'liberal'],
  vetoAvailable: boolean
}
```

### `legislative:chancellor_enact` — C → S
Chancellor enacts one card by index.
```typescript
{ cardIndex: 0 | 1 }
```

### `legislative:veto_request` — C → S
Chancellor requests a veto (only available when `vetoAvailable` is true).
```typescript
{} // no payload
```

### `legislative:veto_response` — C → S
President responds to a veto request.
```typescript
{ accept: boolean }
```

### `legislative:policy_enacted` — S → C broadcast
Sent after any policy is enacted (including forced enactment from election tracker reaching 3).
```typescript
{
  policy: 'liberal' | 'fascist',
  liberalPolicies: number,
  fascistPolicies: number,
  electionTracker: number
}
```

---

## Executive action events

### `executive:action_required` — S → C broadcast
Sent after a fascist policy triggers an executive action. Tells all players what the President must do.
```typescript
{ action: 'inspect' | 'peek' | 'special_election' | 'execute' }
```

### `executive:choose_player` — C → S
President selects a target player (used for inspect, special_election, and execute).
```typescript
{ targetId: string }
```

### `executive:inspect_result` — S → C private
Sent only to the President. Always returns party (`liberal` or `fascist`), never the exact role.
```typescript
{ targetId: string, party: 'liberal' | 'fascist' }
```

### `executive:peek_result` — S → C private
Sent only to the President.
```typescript
{ cards: ['fascist' | 'liberal', 'fascist' | 'liberal', 'fascist' | 'liberal'] }
```

### `executive:player_executed` — S → C broadcast
Sent after an execution. If `wasHitler` is true, the game ends immediately (do not wait for further actions).
```typescript
{ playerId: string, wasHitler: boolean }
```

---

## Game end & sync events

### `game:over` — S → C broadcast
Game has ended. All roles are revealed.
```typescript
{
  winner: 'liberal' | 'fascist',
  condition: 'policies' | 'hitler_elected' | 'hitler_killed',
  roles: Record<string, 'liberal' | 'fascist' | 'hitler'>  // keyed by playerId
}
```

### `game:state_sync` — S → C broadcast (or private on reconnect)
Full public game state. Sent after every phase transition and as a private message on reconnect. Contains no secret data (no cards, no roles, no unrevealed votes).
```typescript
{
  phase: GamePhase,
  presidentId: string,
  chancellorId: string | null,
  electionTracker: number,
  liberalPolicies: number,
  fascistPolicies: number,
  vetoUnlocked: boolean,
  players: Array<{
    id: string,
    nickname: string,
    isAlive: boolean,
    seatIndex: number
  }>
}
```

### `error` — S → C private
Sent to the originating client when an action is invalid.
```typescript
{ code: string, message: string }
```

Example error codes: `NOT_YOUR_TURN`, `INVALID_PHASE`, `PLAYER_INELIGIBLE`, `GAME_NOT_FOUND`, `LOBBY_FULL`.
