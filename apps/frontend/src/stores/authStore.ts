import { create } from 'zustand';
import type { AuthUser } from '@secret-hitler/shared';

interface AuthState {
  /** Eingeloggter User oder null (Gast). */
  user: AuthUser | null;

  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));
