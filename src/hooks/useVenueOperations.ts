import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import {
  academySnapshot,
  emptyAcademy,
  venueSnapshot,
} from "@/lib/venueOperations";
import type { AcademySnapshot, VenueSnapshot } from "@/types/venueOperations";
function useSnapshot<T>(
  venue: string | null,
  kind: "venue" | "academy",
  empty: () => T,
) {
  const actor = useAuthStore((s) => s.authUserId),
    ready = useAuthStore((s) => s.authReady),
    scope = `${actor}:${kind}:${venue}`;
  const [raw, setRaw] = useState<T>(empty),
    [forScope, setScope] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [updatedAt, setUpdatedAt] = useState(0);
  const epoch = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++epoch.current;
    setBusy(true);
    try {
      const data = await (kind === "venue"
        ? venueSnapshot(venue)
        : academySnapshot(venue));
      if (epoch.current === n) {
        setRaw(data as T);
        setScope(scope);
        setError("");
        setUpdatedAt(Date.now());
      }
    } catch (e) {
      if (epoch.current === n) {
        setRaw(empty());
        setScope("");
        setError(e instanceof Error ? e.message : "Falha ao atualizar.");
      }
    } finally {
      if (epoch.current === n) setBusy(false);
    }
  }, [scope, kind, venue, empty]);
  useEffect(() => {
    if (ready && actor) void refresh();
    return () => {
      epoch.current++;
    };
  }, [ready, actor, refresh]);
  useEffect(() => {
    setLive(false);
    if (!ready || !actor || (!venue && kind !== "academy") || !supabase) return;
    const client = supabase;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const events = venue
      ? {
          event: "*" as const,
          schema: "public",
          table: "venue_live_pings",
          filter: `establishment_id=eq.${venue}`,
        }
      : { event: "*" as const, schema: "public", table: "venue_notices" };
    const ch = client
      .channel(`venue-ops:${kind}:${venue}:${actor}`)
      .on("postgres_changes", events, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          void refresh();
        }, 200);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const timer = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      void client.removeChannel(ch);
    };
  }, [actor, ready, venue, kind, refresh]);
  return {
    data: forScope === scope ? raw : empty(),
    busy,
    error,
    refresh,
    live: forScope === scope && live,
    updatedAt: forScope === scope ? updatedAt : 0,
  };
}
const emptyVenue = (): VenueSnapshot => ({});
export const useVenueOperations = (venue: string | null) =>
  useSnapshot<VenueSnapshot>(venue, "venue", emptyVenue);
export const useAcademy = (venue: string | null) =>
  useSnapshot<AcademySnapshot>(venue, "academy", emptyAcademy);
