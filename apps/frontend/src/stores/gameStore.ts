import { create } from 'zustand';
import type {
  GamePhase,
  Player,
  PolicyType,
  Role,
  Vote,
  GameRoleAssignedPayload,
  ElectionVoteCastPayload,
  ElectionResultPayload,
  GameOverPayload,
  GameStateSync,
} from '@secret-hitler/shared';

interface GameState {
  // Öffentlicher State — kommt aus game:state_sync
  phase: GamePhase | null;
  presidentId: string | null;
  chancellorId: string | null;
  lastPresidentId: string | null;
  lastChancellorId: string | null;
  electionTracker: number;
  liberalPolicies: number;
  fascistPolicies: number;
  vetoUnlocked: boolean;
  players: Player[];

  // Privater State — nur für diesen Spieler
  myRole: Role | null;
  myTeammates: GameRoleAssignedPayload['teammates'];
  myVote: Vote | null;
  presidentialCards: PolicyType[] | null;
  chancellorCards: PolicyType[] | null;
  vetoAvailable: boolean;
  vetoPending: boolean;
  isSpecialElection: boolean;
  specialElectionReturnId: string | null;
  electionVoteCount: number;
  lastElectionResult: ElectionResultPayload | null;
  peekCards: PolicyType[] | null;
  inspectResult: { targetId: string; party: 'liberal' | 'fascist' } | null;
  wasExecuted: boolean;

  // Spielende
  gameOver: GameOverPayload | null;

  // Actions
  applyStateSync: (sync: GameStateSync) => void;
  setRole: (payload: GameRoleAssignedPayload) => void;
  setMyVote: (vote: Vote) => void;
  setElectionVoteCast: (payload: ElectionVoteCastPayload) => void;
  setPresidentialCards: (cards: PolicyType[]) => void;
  setChancellorCards: (cards: PolicyType[], vetoAvailable: boolean) => void;
  setElectionResult: (result: ElectionResultPayload) => void;
  setVetoPending: (pending: boolean) => void;
  setPeekCards: (cards: PolicyType[]) => void;
  clearPeekCards: () => void;
  setInspectResult: (result: { targetId: string; party: 'liberal' | 'fascist' }) => void;
  clearInspectResult: () => void;
  setPlayerDead: (playerId: string) => void;
  setWasExecuted: (val: boolean) => void;
  setGameOver: (payload: GameOverPayload) => void;
  reset: () => void;
}

const initial = {
  phase: null,
  presidentId: null,
  chancellorId: null,
  lastPresidentId: null,
  lastChancellorId: null,
  electionTracker: 0,
  liberalPolicies: 0,
  fascistPolicies: 0,
  vetoUnlocked: false,
  players: [],
  myRole: null,
  myTeammates: undefined,
  myVote: null,
  presidentialCards: null,
  chancellorCards: null,
  vetoAvailable: false,
  vetoPending: false,
  isSpecialElection: false,
  specialElectionReturnId: null,
  electionVoteCount: 0,
  lastElectionResult: null,
  peekCards: null,
  inspectResult: null,
  wasExecuted: false,
  gameOver: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...initial,

  applyStateSync: (sync) =>
    set({
      phase: sync.phase,
      presidentId: sync.presidentId,
      chancellorId: sync.chancellorId,
      lastPresidentId: sync.lastPresidentId,
      lastChancellorId: sync.lastChancellorId,
      electionTracker: sync.electionTracker,
      liberalPolicies: sync.liberalPolicies,
      fascistPolicies: sync.fascistPolicies,
      vetoUnlocked: sync.vetoUnlocked,
      isSpecialElection: sync.isSpecialElection ?? false,
      specialElectionReturnId: sync.specialElectionReturnId ?? null,
      players: sync.players as Player[],
      myVote: null,
      electionVoteCount: 0,
      vetoPending: false,
    }),

  setRole: (payload) =>
    set({
      myRole: payload.role,
      myTeammates: payload.teammates,
      ...(payload.myVote !== undefined ? { myVote: payload.myVote } : {}),
    }),

  setMyVote: (vote) => set({ myVote: vote }),

  setElectionVoteCast: (payload) => set({ electionVoteCount: payload.voteCount }),

  setPresidentialCards: (cards) =>
    set({ presidentialCards: cards }),

  setChancellorCards: (cards, vetoAvailable) =>
    set({ chancellorCards: cards, vetoAvailable }),

  setElectionResult: (result) =>
    set({ lastElectionResult: result }),

  setVetoPending: (pending) => set({ vetoPending: pending }),

  setPeekCards: (cards) => set({ peekCards: cards }),

  clearPeekCards: () => set({ peekCards: null }),

  setInspectResult: (result) => set({ inspectResult: result }),

  clearInspectResult: () => set({ inspectResult: null }),

  setPlayerDead: (playerId) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, isAlive: false } : p
      ),
    })),

  setWasExecuted: (val) => set({ wasExecuted: val }),

  setGameOver: (payload) =>
    set({ gameOver: payload, phase: 'game_over' }),

  reset: () => set(initial),
}));
