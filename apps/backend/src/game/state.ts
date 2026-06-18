import type { GamePhase, PolicyType, Vote, ExecutiveAction } from "@secret-hitler/shared";
import { redis } from "../lib/redis.js";

export interface RedisGameState {
  gameId: string;
  lobbyId: string;
  phase: GamePhase;

  presidentId: string;
  chancellorId: string | null;
  lastPresidentId: string | null;
  lastChancellorId: string | null;

  // Card piles — NEVER send to clients
  drawPile: PolicyType[];
  discardPile: PolicyType[];
  presidentialCards: PolicyType[] | null;  // 3 cards, private to president
  chancellorCards: PolicyType[] | null;    // 2 cards, private to chancellor
  peekCards: PolicyType[] | null;          // top 3 cards shown during peek power, private to president
  inspectResult: { targetId: string; party: 'liberal' | 'fascist' } | null; // result of inspect power, private to president

  votes: Record<string, Vote>;             // hidden until all votes are in
  electionTracker: number;                 // 0–3

  liberalPolicies: number;                 // 0–5
  fascistPolicies: number;                 // 0–6
  vetoUnlocked: boolean;
  vetoPending: boolean;

  // Set during a special election; ID of the player who is next in normal rotation
  specialElectionReturnId: string | null;

  // Total living player count — cached here to avoid repeated DB queries
  alivePlayers: string[];
}

const TTL_SECONDS = 60 * 60 * 24; // 24 hours

function key(gameId: string) {
  return `gamestate:${gameId}`;
}

export async function getGameState(gameId: string): Promise<RedisGameState | null> {
  const raw = await redis.get(key(gameId));
  if (!raw) return null;
  return JSON.parse(raw) as RedisGameState;
}

export async function setGameState(state: RedisGameState): Promise<void> {
  await redis.set(key(state.gameId), JSON.stringify(state), "EX", TTL_SECONDS);
}

export async function deleteGameState(gameId: string): Promise<void> {
  await redis.del(key(gameId));
}
