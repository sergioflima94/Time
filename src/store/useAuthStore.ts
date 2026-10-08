import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isMockMode, supabase } from '@/lib/supabase';

interface AuthState {
  isLoggedIn: boolean;
  authReady: boolean;
  loading: boolean;
  error: string | null;
  authUserId: string | null;
  initialize: () => Promise<void>;
  login: (email?: string, password?: string) => Promise<boolean>;
  register: (email: string, password: string, profile?: { name: string; phone: string | null; preferredPosition: string; favoriteSports: string[] }) => Promise<boolean>;
  logout: () => Promise<void>;
}

/**
 * Autenticação mock enquanto o Supabase não está conectado (ver src/lib/supabase.ts).
 * Quando isMockMode virar false, trocar login/logout pelas chamadas reais de
 * supabase.auth.signInWithPassword / signOut.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      authReady: false,
      loading: false,
      error: null,
      authUserId: null,
      initialize: async () => {
        if (isMockMode || !supabase) { set({ authReady: true }); return; }
        const { data, error } = await supabase.auth.getSession();
        set({ authReady: true, isLoggedIn: Boolean(data.session), authUserId: data.session?.user.id ?? null, error: error?.message ?? null });
      },
      login: async (email = '', password = '') => {
        if (isMockMode || !supabase) { set({ isLoggedIn: true, authReady: true, error: null }); return true; }
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        set({ loading: false, isLoggedIn: Boolean(data.session), authUserId: data.user?.id ?? null, error: error?.message ?? null });
        return !error && Boolean(data.session);
      },
      register: async (email, password, profile) => {
        if (isMockMode || !supabase) { set({ isLoggedIn: true, authReady: true, error: null }); return true; }
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: profile ? { name: profile.name, phone: profile.phone, preferred_position: profile.preferredPosition, favorite_sports: profile.favoriteSports } : undefined },
        });
        set({ loading: false, isLoggedIn: Boolean(data.session || data.user), authUserId: data.user?.id ?? null, error: error?.message ?? null });
        return !error && Boolean(data.session || data.user);
      },
      logout: async () => {
        if (!isMockMode && supabase) await supabase.auth.signOut();
        set({ isLoggedIn: false, authUserId: null, error: null });
      },
    }),
    {
      name: 'pelada-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ isLoggedIn: state.isLoggedIn, authUserId: state.authUserId }),
    },
  ),
);
