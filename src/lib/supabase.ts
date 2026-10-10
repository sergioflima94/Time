import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from '@/types/supabase.generated';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseProjectUrl = supabaseUrl ?? null;
const supabasePublicKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Enquanto o projeto Supabase não é configurado (ver README), o app roda inteiro
 * com dados de exemplo em src/lib/mockData.ts. Assim que EXPO_PUBLIC_SUPABASE_URL e
 * EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY existirem no .env, isMockMode passa a false e as
 * telas passam a usar o Supabase como fonte oficial por meio de supabaseSync; as
 * stores permanecem como cache otimista/offline para não espalhar queries pela UI.
 */
export const isMockMode = !supabaseUrl || !supabasePublicKey;
const isStaticWebRender = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = isMockMode
  ? null
  : createClient<Database>(supabaseUrl!, supabasePublicKey!, {
      auth: isStaticWebRender
        ? {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          }
        : {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          },
    });
