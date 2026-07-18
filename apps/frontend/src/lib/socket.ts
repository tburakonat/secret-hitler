import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type LobbyCreatePayload,
  type LobbyJoinPayload,
  type LobbyReconnectPayload,
  type LobbyUpdateSettingsPayload,
  type NominationChancellorPayload,
  type ElectionVotePayload,
  type LegislativePresidentDiscardPayload,
  type LegislativeChancellorEnactPayload,
  type LegislativeVetoResponsePayload,
  type ExecutiveChoosePlayerPayload,
} from '@secret-hitler/shared';

// Leer = same-origin (nginx-Proxy in Prod, Vite-Proxy in Dev). Nur für Split-Deployments gesetzt.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';

const socketOptions = {
  autoConnect: false,
  withCredentials: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const socket: Socket<any, any> = BACKEND_URL
  ? io(BACKEND_URL, socketOptions)
  : io(socketOptions);

// ─── Typisierte Emit-Wrapper ──────────────────────────────────────────────────

export const emitLobbyCreate       = (p: LobbyCreatePayload): void                      => { socket.emit(SOCKET_EVENTS.LOBBY_CREATE, p); };
export const emitLobbyJoin         = (p: LobbyJoinPayload): void                        => { socket.emit(SOCKET_EVENTS.LOBBY_JOIN, p); };
export const emitLobbyReconnect    = (p: LobbyReconnectPayload): void                   => { socket.emit(SOCKET_EVENTS.LOBBY_RECONNECT, p); };

/** Verbindet den Socket falls nötig und sendet dann den Reconnect. */
export function connectAndReconnect(sessionId: string) {
  if (socket.connected) {
    emitLobbyReconnect({ sessionId });
  } else {
    socket.connect();
    socket.once('connect', () => emitLobbyReconnect({ sessionId }));
  }
}
export const emitLobbyStart           = (): void                                            => { socket.emit(SOCKET_EVENTS.LOBBY_START, {}); };
export const emitLobbyUpdateSettings  = (p: LobbyUpdateSettingsPayload): void              => { socket.emit(SOCKET_EVENTS.LOBBY_UPDATE_SETTINGS, p); };

export const emitNominateChancellor = (p: NominationChancellorPayload): void            => { socket.emit(SOCKET_EVENTS.NOMINATION_CHANCELLOR, p); };
export const emitVote               = (p: ElectionVotePayload): void                    => { socket.emit(SOCKET_EVENTS.ELECTION_VOTE, p); };

export const emitPresidentDiscard   = (p: LegislativePresidentDiscardPayload): void     => { socket.emit(SOCKET_EVENTS.LEGISLATIVE_PRESIDENT_DISCARD, p); };
export const emitChancellorEnact    = (p: LegislativeChancellorEnactPayload): void      => { socket.emit(SOCKET_EVENTS.LEGISLATIVE_CHANCELLOR_ENACT, p); };
export const emitVetoRequest        = (): void                                           => { socket.emit(SOCKET_EVENTS.LEGISLATIVE_VETO_REQUEST, {}); };
export const emitVetoResponse       = (p: LegislativeVetoResponsePayload): void         => { socket.emit(SOCKET_EVENTS.LEGISLATIVE_VETO_RESPONSE, p); };

export const emitChoosePlayer       = (p: ExecutiveChoosePlayerPayload): void           => { socket.emit(SOCKET_EVENTS.EXECUTIVE_CHOOSE_PLAYER, p); };
export const emitPeekConfirm        = (): void                                           => { socket.emit(SOCKET_EVENTS.EXECUTIVE_PEEK_CONFIRM, {}); };
export const emitInspectConfirm     = (): void                                           => { socket.emit(SOCKET_EVENTS.EXECUTIVE_INSPECT_CONFIRM, {}); };

export const emitGameAbort          = (): void                                           => { socket.emit(SOCKET_EVENTS.GAME_ABORT, {}); };
export const emitLobbyLeave         = (): void                                           => { socket.emit(SOCKET_EVENTS.LOBBY_LEAVE, {}); };
export const emitLobbyReturn        = (): void                                           => { socket.emit(SOCKET_EVENTS.LOBBY_RETURN, {}); };
