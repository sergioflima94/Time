import { useCallback, useEffect, useRef, useState } from "react";
import { isMockMode, supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
/** Cached customer data never authorizes reading a tab after login/role changes. */
export function useTabReadAccess(id: string | undefined) {
  const actor = useAuthStore((s) => s.authUserId),
    ready = useAuthStore((s) => s.authReady),
    scope = `${actor}:${id}`;
  const [raw, setRaw] = useState(false),
    [forScope, setScope] = useState(""),
    epoch = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++epoch.current;
    if (!actor || !ready || !id || !supabase) return;
    try {
      const { data, error } = await supabase
        .from("service_tabs")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (n === epoch.current) {
        setRaw(!error && !!data);
        setScope(scope);
      }
    } catch {
      if (n === epoch.current) {
        setRaw(false);
        setScope(scope);
      }
    }
  }, [actor, ready, id, scope]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      epoch.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  return {
    allowed: isMockMode || (forScope === scope && raw),
    loading: !!actor && ready && forScope !== scope,
    refresh,
  };
}
