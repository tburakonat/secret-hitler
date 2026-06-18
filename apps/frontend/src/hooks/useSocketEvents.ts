import { useEffect } from 'react';
import { SOCKET_EVENTS } from '@secret-hitler/shared';
import { socket } from '../lib/socket';
import type {
  LobbyUpdatedPayload,
  GameRoleAssignedPayload,
  GameStartedPayload,
  GameStateSync,
  NominationMadePayload,
  ElectionVoteCastPayload,
  ElectionResultPayload,
  LegislativePresidentCardsPayload,
  LegislativeChancellorCardsPayload,
  LegislativePolicyEnactedPayload,
  LegislativeVetoRequestedPayload,
  LegislativeVetoResolvedPayload,
  ExecutiveActionRequiredPayload,
  ExecutiveInspectResultPayload,
  ExecutiveInspectConfirmedPayload,
  ExecutivePeekResultPayload,
  ExecutiveSpecialElectionPayload,
  ExecutivePlayerExecutedPayload,
  GameOverPayload,
  GameAbortedPayload,
  ErrorPayload,
} from '@secret-hitler/shared';

export interface SocketEventHandlers {
  [SOCKET_EVENTS.LOBBY_UPDATED]:              (p: LobbyUpdatedPayload) => void;
  [SOCKET_EVENTS.GAME_ROLE_ASSIGNED]:         (p: GameRoleAssignedPayload) => void;
  [SOCKET_EVENTS.GAME_STARTED]:               (p: GameStartedPayload) => void;
  [SOCKET_EVENTS.GAME_STATE_SYNC]:            (p: GameStateSync) => void;
  [SOCKET_EVENTS.NOMINATION_MADE]:            (p: NominationMadePayload) => void;
  [SOCKET_EVENTS.ELECTION_VOTE_CAST]:         (p: ElectionVoteCastPayload) => void;
  [SOCKET_EVENTS.ELECTION_RESULT]:            (p: ElectionResultPayload) => void;
  [SOCKET_EVENTS.LEGISLATIVE_PRESIDENT_CARDS]: (p: LegislativePresidentCardsPayload) => void;
  [SOCKET_EVENTS.LEGISLATIVE_CHANCELLOR_CARDS]: (p: LegislativeChancellorCardsPayload) => void;
  [SOCKET_EVENTS.LEGISLATIVE_POLICY_ENACTED]: (p: LegislativePolicyEnactedPayload) => void;
  [SOCKET_EVENTS.LEGISLATIVE_VETO_REQUESTED]: (p: LegislativeVetoRequestedPayload) => void;
  [SOCKET_EVENTS.LEGISLATIVE_VETO_RESOLVED]:  (p: LegislativeVetoResolvedPayload) => void;
  [SOCKET_EVENTS.EXECUTIVE_ACTION_REQUIRED]:  (p: ExecutiveActionRequiredPayload) => void;
  [SOCKET_EVENTS.EXECUTIVE_INSPECT_RESULT]:     (p: ExecutiveInspectResultPayload) => void;
  [SOCKET_EVENTS.EXECUTIVE_INSPECT_CONFIRMED]:  (p: ExecutiveInspectConfirmedPayload) => void;
  [SOCKET_EVENTS.EXECUTIVE_PEEK_RESULT]:        (p: ExecutivePeekResultPayload) => void;
  [SOCKET_EVENTS.EXECUTIVE_SPECIAL_ELECTION]: (p: ExecutiveSpecialElectionPayload) => void;
  [SOCKET_EVENTS.EXECUTIVE_PLAYER_EXECUTED]:  (p: ExecutivePlayerExecutedPayload) => void;
  [SOCKET_EVENTS.GAME_OVER]:                  (p: GameOverPayload) => void;
  [SOCKET_EVENTS.GAME_ABORTED]:               (p: GameAbortedPayload) => void;
  [SOCKET_EVENTS.ERROR]:                      (p: ErrorPayload) => void;
}

/**
 * Registriert Socket.io-Event-Listener und räumt sie beim Unmount auf.
 * Übergib nur die Events, die die Komponente tatsächlich braucht.
 */
export function useSocketEvents(handlers: Partial<SocketEventHandlers>) {
  useEffect(() => {
    const entries = Object.entries(handlers) as [string, (...args: unknown[]) => void][];
    for (const [event, handler] of entries) {
      socket.on(event, handler);
    }
    return () => {
      for (const [event, handler] of entries) {
        socket.off(event, handler);
      }
    };
  // handlers-Referenz soll stabil sein — Komponenten übergeben ein Objekt-Literal,
  // daher kein handlers in deps (würde jedes Render neu registrieren).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
