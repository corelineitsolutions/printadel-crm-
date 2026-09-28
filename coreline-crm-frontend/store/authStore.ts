import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  employeeId?: string;
  designation?: string;
  department?: string;
  phone?: string;
  address?: string;
  joinDate?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isPunchedIn: boolean;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  setPunchStatus: (status: boolean) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isPunchedIn: false,
      _hasHydrated: false,
      setHasHydrated: (state) => {
        set({ _hasHydrated: state });
      },
      setPunchStatus: (status) => {
        set({ isPunchedIn: status });
      },
      login: (user, token) => {
        if (!user || !token) {
          console.error("AuthStore: Login called with invalid data!");
          return;
        }
        localStorage.setItem("token", token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem("token");
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        _hasHydrated: state._hasHydrated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);
