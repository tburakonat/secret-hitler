import {
  GAME_CONSTANTS,
  ROLE_DISTRIBUTION,
  type PolicyType,
  type Role,
  type Vote,
  type ExecutiveAction,
  type Winner,
  type WinCondition,
} from "@secret-hitler/shared";
import type { RedisGameState } from "./state.js";

// ─── Deck ─────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(): PolicyType[] {
  const cards: PolicyType[] = [
    ...Array(GAME_CONSTANTS.FASCIST_CARDS).fill("fascist"),
    ...Array(GAME_CONSTANTS.LIBERAL_CARDS).fill("liberal"),
  ];
  return shuffle(cards);
}

/** Reshuffles discardPile into drawPile if drawPile has fewer than `count` cards. Mutates state. */
function ensureDrawPile(state: RedisGameState, count: number): void {
  if (state.drawPile.length < count) {
    state.drawPile = shuffle([...state.drawPile, ...state.discardPile]);
    state.discardPile = [];
  }
}

/** Draws `count` cards from the top of drawPile, reshuffling if necessary. Mutates state. */
export function drawCards(state: RedisGameState, count: number): PolicyType[] {
  ensureDrawPile(state, count);
  return state.drawPile.splice(0, count);
}

/** Returns the top `count` cards of drawPile without removing them, reshuffling first if necessary. Mutates state (reshuffle only, cards are not consumed). */
export function peekTopCards(state: RedisGameState, count: number): PolicyType[] {
  ensureDrawPile(state, count);
  return state.drawPile.slice(0, count);
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export function assignRoles(playerIds: string[]): Record<string, Role> {
  const count = playerIds.length;
  const dist = ROLE_DISTRIBUTION[count];

  const roles: Role[] = [
    "hitler",
    ...Array(dist.fascists).fill("fascist"),
    ...Array(dist.liberals).fill("liberal"),
  ];
  const shuffled = shuffle(roles);

  const result: Record<string, Role> = {};
  playerIds.forEach((id, i) => {
    result[id] = shuffled[i];
  });
  return result;
}

// ─── Turn order ───────────────────────────────────────────────────────────────

/**
 * Returns the ID of the next president.
 * Handles special election return: if `specialElectionReturnId` is set, that player
 * becomes president and the flag is cleared.
 */
export function getNextPresidentId(
  alivePlayers: string[],
  currentPresidentId: string,
  specialElectionReturnId: string | null,
): { nextId: string; clearSpecial: boolean } {
  if (specialElectionReturnId) {
    return { nextId: specialElectionReturnId, clearSpecial: true };
  }

  const idx = alivePlayers.indexOf(currentPresidentId);
  const nextIdx = (idx + 1) % alivePlayers.length;
  return { nextId: alivePlayers[nextIdx], clearSpecial: false };
}

// ─── Elections ───────────────────────────────────────────────────────────────

export function countVotes(votes: Record<string, Vote>): { passed: boolean } {
  const values = Object.values(votes);
  const jaCount = values.filter((v) => v === "ja").length;
  return { passed: jaCount > values.length / 2 };
}

/**
 * Returns player IDs eligible to be nominated as chancellor.
 * Ineligible: dead, current president, and last government members.
 * Exception: with 5 or fewer alive players, only the last chancellor is ineligible (not last president).
 */
export function getEligibleChancellors(state: RedisGameState): string[] {
  const alive = state.alivePlayers;
  const ineligible = new Set<string>([state.presidentId]);

  if (alive.length <= 5) {
    if (state.lastChancellorId) ineligible.add(state.lastChancellorId);
  } else {
    if (state.lastPresidentId) ineligible.add(state.lastPresidentId);
    if (state.lastChancellorId) ineligible.add(state.lastChancellorId);
  }

  return alive.filter((id) => !ineligible.has(id));
}

// ─── Executive actions ────────────────────────────────────────────────────────

/**
 * Returns the executive action triggered after the nth fascist policy,
 * based on the total player count. Returns null if no action is required.
 */
export function getExecutiveAction(
  fascistPolicies: number,
  playerCount: number,
): ExecutiveAction | null {
  if (playerCount <= 6) {
    if (fascistPolicies === 3) return "peek";
    if (fascistPolicies === 4 || fascistPolicies === 5) return "execute";
  } else if (playerCount <= 8) {
    if (fascistPolicies === 2) return "inspect";
    if (fascistPolicies === 3) return "special_election";
    if (fascistPolicies === 4 || fascistPolicies === 5) return "execute";
  } else {
    // 9–10 players
    if (fascistPolicies === 1 || fascistPolicies === 2) return "inspect";
    if (fascistPolicies === 3) return "special_election";
    if (fascistPolicies === 4 || fascistPolicies === 5) return "execute";
  }
  return null;
}

// ─── Win conditions ───────────────────────────────────────────────────────────

export function checkWinCondition(
  state: RedisGameState,
): { winner: Winner; condition: WinCondition } | null {
  if (state.liberalPolicies >= GAME_CONSTANTS.LIBERAL_POLICIES_TO_WIN) {
    return { winner: "liberal", condition: "policies" };
  }
  if (state.fascistPolicies >= GAME_CONSTANTS.FASCIST_POLICIES_TO_WIN) {
    return { winner: "fascist", condition: "policies" };
  }
  return null;
}
