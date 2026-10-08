import { useEffect } from 'react';

import { startSupabaseSync, stopSupabaseSync } from '@/lib/supabaseSync';
import { useAuthStore } from '@/store/useAuthStore';

/** Liga a store offline ao Supabase somente depois que a sessão foi restaurada. */
export function useSupabaseSync() {
  const authReady = useAuthStore((state) => state.authReady);
  const authUserId = useAuthStore((state) => state.authUserId);

  useEffect(() => {
    if (!authReady || !authUserId) {
      stopSupabaseSync();
      return;
    }

    let disposed = false;
    let stop: (() => void) | undefined;
    void startSupabaseSync({ authUserId }).then((cleanup) => {
      if (disposed) cleanup();
      else stop = cleanup;
    });

    return () => {
      disposed = true;
      stop?.();
    };
  }, [authReady, authUserId]);
}
