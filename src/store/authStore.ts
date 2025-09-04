import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { me } from "@/lib/api";

declare global {
  interface Window {
    __mb_token_check_id?: number;
  }
}

export type User = {
  id?: number;
  email?: string;
  fullName?: string;
  role?: string;
};

type AuthState = {
  token?: string | null;
  user?: User | null;
  login: (token: string, user?: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasRole: (role: string) => boolean;
  validateToken: () => Promise<boolean>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token: string, user?: User) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      validateToken: async () => {
        const token = get().token;
        if (!token) return false;
        try {
          const current = await me(token);
          // update stored user (fresh from server)
          set({ user: current });
          return true;
        } catch {
          // token invalid or other error -> clear auth
          set({ token: null, user: null });
          return false;
        }
      },
      isAuthenticated: () => !!get().token,
      hasRole: (role: string) => {
        const user = get().user;

        return user?.role === role;
      },
    }),
    {
      name: "mb-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);
