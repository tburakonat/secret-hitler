import { create } from 'zustand';
import type { Player } from '@secret-hitler/shared';

import { GAME_CONSTANTS } from '@secret-hitler/shared';

interface LobbyState {
  lobbyId: string | null;
  code: string | null;
  players: Player[];
  hostId: string | null;
  myPlayerId: string | null;  // eigene Player-ID, bekannt nach erstem lobby:updated
  maxPlayers: number;
  isPublic: boolean;

  setLobby: (data: { lobbyId?: string; code?: string; players: Player[]; hostId: string; maxPlayers?: number; isPublic?: boolean }) => void;
  setMyPlayerId: (id: string) => void;
  setHostId: (id: string) => void;
  reset: () => void;
}

const initial = {
  lobbyId: null,
  code: null,
  players: [],
  hostId: null,
  myPlayerId: null,
  maxPlayers: GAME_CONSTANTS.MAX_PLAYERS,
  isPublic: true,
};

export const useLobbyStore = create<LobbyState>((set) => ({
  ...initial,

  setLobby: (data) =>
    set((s) => ({
      lobbyId: data.lobbyId ?? s.lobbyId,
      code: data.code ?? s.code,
      players: data.players,
      hostId: data.hostId,
      maxPlayers: data.maxPlayers ?? s.maxPlayers,
      isPublic: data.isPublic ?? s.isPublic,
    })),

  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setHostId: (id) => set({ hostId: id }),
  reset: () => set(initial),
}));
