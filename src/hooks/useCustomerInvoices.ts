import { useCallback, useEffect, useRef, useState } from "react";
import { creditSnapshot } from "@/lib/customerInvoices";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import type { CreditSnapshot } from "@/types/customerInvoices";
export function useCustomerInvoices(
  venue: string | null = null,
  tab: string | null = null,
  mode = "statement",
) {
  const actor = useAuthStore((s) => s.authUserId),
    ready = useAuthStore((s) => s.authReady),
    scope = `${actor}:${venue}:${tab}:${mode}`;
  const [raw, setRaw] = useState<CreditSnapshot>({}),
    [forScope, setScope] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    epoch = useRef(0),
    current = useRef(scope);
  current.current = scope;
  const refresh = useCallback(async () => {
    const n = ++epoch.current;
    setBusy(true);
    try {
      const data = await creditSnapshot(venue, tab, mode);
      if (n === epoch.current && scope === current.current) {
        setRaw(data);
        setScope(scope);
        setError("");
      }
    } catch (e) {
      if (n === epoch.current && scope === current.current) {
        setRaw({});
        setScope("");
        setError((e as Error).message);
      }
    } finally {
      if (n === epoch.current) setBusy(false);
    }
  }, [scope, venue, tab, mode]);
  useEffect(() => {
    if (ready && actor) void refresh();
    return () => {
      epoch.current++;
    };
  }, [ready, actor, refresh]);
  useEffect(() => {
    if (!ready || !actor || !supabase) return;
    const client = supabase;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const ch = client
      .channel(`credit:${scope}`)
      .on(
        "postgres_changes",
        venue
          ? {
              event: "*",
              schema: "public",
              table: "venue_live_pings",
              filter: `establishment_id=eq.${venue}`,
            }
          : { event: "*", schema: "public", table: "venue_notices" },
        () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => void refresh(), 200);
        },
      )
      .subscribe();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      void client.removeChannel(ch);
    };
  }, [actor, ready, venue, scope, refresh]);
  return {
    data: forScope === scope ? raw : {},
    ready: forScope === scope,
    busy,
    error,
    refresh,
  };
}
