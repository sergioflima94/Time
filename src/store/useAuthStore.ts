import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';

import { authErrorMessage, confirmationTokenHash } from '@/lib/authCallback';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { isMockMode, supabase, supabaseProjectUrl } from '@/lib/supabase';

interface AuthState {
  isLoggedIn: boolean;
  authReady: boolean;
  loading: boolean;
  error: string | null;
  authUserId: string | null;
  pendingEmail: string | null;
  setSession: (session: Session | null) => void;
  resendConfirmation: (email: string) => Promise<boolean>;
  confirmEmailCode: (email: string, code: string) => Promise<boolean>;
  confirmEmailLink: (link: string) => Promise<boolean>;
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
      confirmEmailCode: async (email, code) => {
        const token = code.replace(/\s/g, '');
        if (!email.trim() || !/^\d{6,10}$/.test(token)) {
          set({ error: 'Informe o e-mail do cadastro e o código completo recebido.' });
          return false;
        }
        // A demonstração não confirma contas reais nem simula a validação do código.
        if (isMockMode || !supabase) {
          set({ error: 'A confirmação por código está disponível com o Supabase conectado.' });
          return false;
        }
        set({ loading: true, error: null });
        try {
          const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
          if (error || !data.session) {
            set({ loading: false, error: error ? authErrorMessage(error) : 'Não foi possível confirmar. Solicite outro código.' });
            return false;
          }
          set({ loading: false, authReady: true, isLoggedIn: true, authUserId: data.session.user.id, pendingEmail: null, error: null });
          return true;
        } catch (error) { set({ loading: false, error: authErrorMessage(error) }); return false; }
      },
      confirmEmailLink: async (link) => {
        const hash = confirmationTokenHash(link, supabaseProjectUrl);
        if (!hash || !supabase || isMockMode) {
          set({ error: 'Copie o endereço do botão de confirmação do e-mail mais recente do MarcouJogou.' });
          return false;
        }
        set({ loading: true, error: null });
        try {
          // Valida diretamente no Auth: um redirect antigo para localhost é ignorado.
          const { data, error } = await supabase.auth.verifyOtp({ token_hash: hash, type: 'email' });
          if (error || !data.session) {
            set({ loading: false, error: error ? authErrorMessage(error) : 'Não foi possível confirmar. Solicite outro e-mail.' });
            return false;
          }
          set({ loading: false, authReady: true, isLoggedIn: true, authUserId: data.session.user.id, pendingEmail: null, error: null });
          return true;
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
