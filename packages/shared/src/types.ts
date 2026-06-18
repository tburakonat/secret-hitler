// ─── Primitive types ────────────────────────────────────────────────────────

export type PolicyType = 'liberal' | 'fascist';
export type Role = 'liberal' | 'fascist' | 'hitler';
export type Party = 'liberal' | 'fascist';
export type Winner = 'liberal' | 'fascist';
export type WinCondition = 'policies' | 'hitler_elected' | 'hitler_killed';
export type Vote = 'ja' | 'nein';
export type ExecutiveAction = 'inspect' | 'peek' | 'special_election' | 'execute';
export type LobbyStatus = 'waiting' | 'in_game' | 'finished';

export type GamePhase =
  | 'lobby'
  | 'nomination'
  | 'election'
  | 'legislative_president'
  | 'legislative_chancellor'
  | 'executive_action'
  | 'game_over';

// ─── Domain objects ──────────────────────────────────────────────────────────

/** Public player data — no role, no session info */
export interface Player {
  id: string;
  nickname: string;
  isAlive: boolean;
  seatIndex: number;
  isHost: boolean;
}

export interface LobbyState {
  id: string;
  code: string;
  status: LobbyStatus;
  isPublic: boolean;
  maxPlayers: number;
  players: Player[];
  hostId: string;
}

/** Full public game state — no secret data (no cards, no roles, no unrevealed votes) */
export interface GameStateSync {
  phase: GamePhase;
  presidentId: string;
  chancellorId: string | null;
  lastPresidentId: string | null;
  lastChancellorId: string | null;
  electionTracker: number;
  liberalPolicies: number;
  fascistPolicies: number;
  vetoUnlocked: boolean;
  players: Array<Pick<Player, 'id' | 'nickname' | 'isAlive' | 'seatIndex'>>;
  isSpecialElection?: boolean;
  specialElectionReturnId?: string | null;
  /** Only set on private reconnect emits — tells the receiving socket which player they are. */
  selfId?: string;
  /** Only set on private reconnect emits — tells the receiving socket who the host is. */
  hostId?: string;
}

// ─── Client → Server payloads ────────────────────────────────────────────────

export interface LobbyCreatePayload {
  nickname: string;
  isPublic: boolean;
  maxPlayers: number;
}

export interface LobbyJoinPayload {
  nickname: string;
  code?: string;
}

export interface LobbyReconnectPayload {
  sessionId: string;
}

export interface NominationChancellorPayload {
  chancellorId: string;
}

export interface ElectionVotePayload {
  vote: Vote;
}

export interface LegislativePresidentDiscardPayload {
  cardIndex: 0 | 1 | 2;
}

export interface LegislativeChancellorEnactPayload {
  cardIndex: 0 | 1;
}

export interface LegislativeVetoResponsePayload {
  accept: boolean;
}

export interface ExecutiveChoosePlayerPayload {
  targetId: string;
}

// ─── Server → Client payloads ────────────────────────────────────────────────

export interface LobbyUpdateSettingsPayload {
  isPublic: boolean;
  maxPlayers: number;
}

export interface LobbyUpdatedPayload {
  lobbyId: string;
  code: string;
  players: Player[];
  hostId: string;
  maxPlayers: number;
  isPublic: boolean;
  /** Only set on private emits — tells the receiving socket which player they are. */
  selfId?: string;
}

export interface GameRoleAssignedPayload {
  role: Role;
  /** Fascists receive their teammates. Hitler receives teammates only in 5-player games. */
  teammates?: { id: string; nickname: string; role: 'fascist' | 'hitler' }[];
  /** Only set on reconnect — restores the player's vote if they already voted this round. */
  myVote?: Vote;
}

export interface GameStartedPayload {
  gameId: string;
  players: Player[];
  firstPresidentId: string;
}

export interface NominationMadePayload {
  presidentId: string;
  chancellorId: string;
}

export interface ElectionVoteCastPayload {
  voteCount: number;
}

export interface ElectionResultPayload {
  votes: Record<string, Vote>;
  passed: boolean;
  electionTracker: number;
}

export interface LegislativePresidentCardsPayload {
  cards: [PolicyType, PolicyType, PolicyType];
}

export interface LegislativeChancellorCardsPayload {
  cards: [PolicyType, PolicyType];
  vetoAvailable: boolean;
}

export interface LegislativePolicyEnactedPayload {
  policy: PolicyType;
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
}

export type LegislativeVetoRequestedPayload = Record<string, never>;

export interface LegislativeVetoResolvedPayload {
  accepted: boolean;
}

export interface ExecutiveActionRequiredPayload {
  action: ExecutiveAction;
}

export interface ExecutiveInspectResultPayload {
  targetId: string;
  party: Party;
}

export interface ExecutivePeekResultPayload {
  cards: [PolicyType, PolicyType, PolicyType];
}

export interface ExecutiveSpecialElectionPayload {
  newPresidentId: string;
}

export interface ExecutivePlayerExecutedPayload {
  playerId: string;
  wasHitler: boolean;
}

export interface ExecutiveInspectConfirmedPayload {
  inspectedPlayerId: string;
  presidentId: string;
}

export interface GameOverPayload {
  winner: Winner;
  condition: WinCondition;
  roles: Record<string, Role>;
}

export interface GameAbortedPayload {
  lobbyId: string;
  code: string;
  players: Player[];
  hostId: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}
