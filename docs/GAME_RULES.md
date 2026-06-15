# Game Rules

This is the authoritative rules reference for the server-side game logic engine.

## Overview

Secret Hitler is a social deduction game for 5–10 players. Players are secretly divided into Liberals and Fascists. The Fascists know each other; the Liberals do not. One Fascist is secretly Hitler, who does not know the other Fascists (in games of 6+).

## Player counts and role distribution

| Players | Liberals | Fascists | Hitler | Total |
| ------- | -------- | -------- | ------ | ----- |
| 5       | 3        | 1        | 1      | 5     |
| 6       | 4        | 1        | 1      | 6     |
| 7       | 4        | 2        | 1      | 7     |
| 8       | 5        | 2        | 1      | 8     |
| 9       | 5        | 3        | 1      | 9     |
| 10      | 6        | 3        | 1      | 10    |

**Note:** In a 5-player game, Hitler is shown who the one Fascist is (because there is only one). In 6+ player games, Hitler does not know the other Fascists.

## Card deck

- Total: 17 cards
- 11 fascist policy cards
- 6 liberal policy cards
- When fewer than 3 cards remain in the draw pile, **reshuffle the discard pile** into a new draw pile. This must be done atomically (Redis transaction).

## Round structure

Each round proceeds through the following phases in order:

### 1. Nomination

- The current President nominates a Chancellor candidate.
- **Ineligibility rule:** The previous round's President and Chancellor cannot be nominated as Chancellor. Exception: with only 5 players alive, only the previous Chancellor is ineligible (not the previous President).
- The nominated player must be alive.

### 2. Election

- All living players vote simultaneously: **Ja** (yes) or **Nein** (no).
- Votes are hidden until all players have voted, then revealed simultaneously.
- **Majority wins.** Ties count as Nein.
- If the vote **passes:** proceed to the Legislative Session.
- If the vote **fails:** increment the Election Tracker by 1. If the tracker reaches 3, the top card of the draw pile is enacted automatically (no veto possible), then the tracker resets to 0. Presidential turn passes to the next player.

### 3. Legislative session (only on successful election)

1. The President draws 3 cards from the top of the draw pile.
2. The President **discards 1 card** face-down (only the President sees the 3 cards).
3. The President passes the remaining 2 cards to the Chancellor.
4. The Chancellor **enacts 1 card** and discards the other face-down (only the Chancellor sees the 2 cards).
5. The enacted policy is placed on the board.
6. **After a successful legislative session, the Election Tracker resets to 0.**

### 4. Executive action (conditional)

After a fascist policy is enacted, the President may be required to perform an executive action. Which action depends on the number of players and how many fascist policies have been enacted. See the Executive Actions table below.

### 5. Next round

Presidential turn passes clockwise to the next **living** player. The previous President and Chancellor are recorded for the ineligibility rule.

## Executive actions by player count

| Fascist policies enacted | 5–6 players      | 7–8 players      | 9–10 players     |
| ------------------------ | ---------------- | ---------------- | ---------------- |
| 1st                      | —                | —                | Inspect loyalty  |
| 2nd                      | —                | Inspect loyalty  | Inspect loyalty  |
| 3rd                      | Peek top 3 cards | Special election | Special election |
| 4th                      | Execute          | Execute          | Execute          |
| 5th                      | Execute          | Execute          | Execute          |

### Action descriptions

**Inspect loyalty:** The President secretly views one player's party membership card. The result is `liberal` or `fascist` — never the exact role (so Hitler shows as `fascist`). Only the President sees this result.

**Peek:** The President secretly views the top 3 cards of the draw pile. Only the President sees this result.

**Special election:** The President chooses any living player (including themselves) to be the next Presidential candidate. After that round, the Presidency returns to the normal rotation.

**Execute:** The President executes one living player. The executed player is out of the game. If the executed player is Hitler, the Liberals win immediately.

**Veto power (unlocked after 5th fascist policy):** The Chancellor may propose to veto both cards. If the President agrees, both cards are discarded, the Election Tracker increments by 1, and the round ends without a policy being enacted. If the President disagrees, the Chancellor must enact one of the two cards.

## Win conditions

### Liberals win if:

1. 5 liberal policies are enacted, **or**
2. Hitler is executed.

### Fascists win if:

1. 6 fascist policies are enacted, **or**
2. Hitler is elected Chancellor **after** the 3rd fascist policy has been enacted.

**Important:** The Hitler-as-Chancellor win condition is only checked after the election vote passes, before the legislative session begins.

## Implementation notes

- **Role secrecy:** Roles are assigned at game start and stored in PostgreSQL (`game_players.role`). During gameplay, roles are held in the Node.js process memory (not in Redis). They are never sent to all clients. After the game ends, all roles are revealed via the `game:over` broadcast.
- **Vote secrecy:** Votes are stored in Redis as `{ playerId: 'ja' | 'nein' }` but are only broadcast to all clients after every living player has voted.
- **Card secrecy:** The draw pile array in Redis must never be sent to any client. `presidentialCards` and `chancellorCards` are sent only to the respective player via private socket events.
