import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  isConnected: boolean;
  lastError: string | null;

  setSessionId: (id: string) => void;
  setConnected: (v: boolean) => void;
  setError: (msg: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  isConnected: false,
  lastError: null,

  setSessionId: (id) => set({ sessionId: id }),
  setConnected: (v) => set({ isConnected: v }),
  setError: (msg) => set({ lastError: msg }),
}));
