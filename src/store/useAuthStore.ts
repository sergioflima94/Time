import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';

import { authErrorMessage } from '@/lib/authCallback';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { isMockMode, supabase } from '@/lib/supabase';

interface AuthState {
  isLoggedIn: boolean;
  authReady: boolean;
  loading: boolean;
  error: string | null;
  authUserId: string | null;
  pendingEmail: string | null;
  setSession: (session: Session | null) => void;
  resendConfirmation: (email: string) => Promise<boolean>;
  initialize: () => Promise<void>;
  login: (email?: string, password?: string) => Promise<boolean>;
  register: (email: string, password: string, profile?: { name: string; phone: string | null; preferredPosition: string; favoriteSports: string[] }) => Promise<boolean>;
  logout: () => Promise<void>;
}

/**
 * Mantém o login local no modo demonstração e usa Supabase Auth automaticamente
 * quando as variáveis públicas do projeto estão configuradas.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      authReady: false,
      loading: false,
      error: null,
      authUserId: null,
      pendingEmail: null,
      setSession: (session) => set({ authReady: true, isLoggedIn: Boolean(session), authUserId: session?.user.id ?? null, ...(session ? { pendingEmail: null, error: null } : {}) }),
      initialize: async () => {
        if (isMockMode || !supabase) { set({ authReady: true }); return; }
        try {
          const { data, error } = await supabase.auth.getSession();
          set({ authReady: true, isLoggedIn: Boolean(data.session), authUserId: data.session?.user.id ?? null, error: error ? authErrorMessage(error) : null });
        } catch (error) { set({ authReady: true, isLoggedIn: false, authUserId: null, error: authErrorMessage(error) }); }
      },
      login: async (email = '', password = '') => {
        if (isMockMode || !supabase) { set({ isLoggedIn: true, authReady: true, error: null }); return true; }
        set({ loading: true, error: null });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          set({ loading: false, authReady: true, isLoggedIn: Boolean(data.session), authUserId: data.session?.user.id ?? null, error: error ? authErrorMessage(error) : null, ...(data.session ? { pendingEmail: null } : {}) });
          return !error && Boolean(data.session);
        } catch (error) { set({ loading: false, error: authErrorMessage(error) }); return false; }
      },
      register: async (email, password, profile) => {
        if (isMockMode || !supabase) { set({ isLoggedIn: true, authReady: true, error: null }); return true; }
        set({ loading: true, error: null });
        try {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: getAuthRedirectUrl(), data: profile ? { name: profile.name, phone: profile.phone, preferred_position: profile.preferredPosition, favorite_sports: profile.favoriteSports } : undefined },
          });
          set({ loading: false, authReady: true, isLoggedIn: Boolean(data.session), authUserId: data.session?.user.id ?? null, pendingEmail: !error && !data.session ? email.trim() : null, error: error ? authErrorMessage(error) : null });
          return !error && Boolean(data.session || data.user);
        } catch (error) { set({ loading: false, error: authErrorMessage(error) }); return false; }
      },
      resendConfirmation: async (email) => {
        if (!email.trim()) return false;
        if (isMockMode || !supabase) return true;
        set({ loading: true, error: null });
        try {
          const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: getAuthRedirectUrl() } });
          set({ loading: false, pendingEmail: email.trim(), error: error ? authErrorMessage(error) : null });
          return !error;
        } catch (error) { set({ loading: false, error: authErrorMessage(error) }); return false; }
      },
      logout: async () => {
        if (!isMockMode && supabase) await supabase.auth.signOut();
        set({ isLoggedIn: false, authUserId: null, pendingEmail: null, error: null });
      },
    }),
    {
      name: 'pelada-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ isLoggedIn: state.isLoggedIn, authUserId: state.authUserId, pendingEmail: state.pendingEmail }),
    },
  ),
);
