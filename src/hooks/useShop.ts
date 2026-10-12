import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { shopSnapshot } from "@/lib/shop";
import type { ShopSnapshot } from "@/types/shop";
const empty = (): ShopSnapshot => ({
  admin: false,
  sellers: [],
  products: [],
  orders: [],
  offset: 0,
});
export function useShop(mode = "catalog") {
  const actor = useAuthStore((s) => s.authUserId),
    ready = useAuthStore((s) => s.authReady),
    scope = `${actor || "anon"}:${mode}`;
  const [raw, setRaw] = useState<ShopSnapshot>(empty),
    [forScope, setForScope] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false);
  const epoch = useRef(0);
  const refresh = useCallback(
    async (
      query = "",
      seller: string | null = null,
      offset = 0,
      append = false,
    ) => {
      const n = ++epoch.current;
      setBusy(true);
      setError("");
      try {
        const data = await shopSnapshot(mode, query, seller, offset);
        if (n === epoch.current) {
          setHasMore(data.products.length === 40);
          setRaw((old) =>
            append
              ? {
                  ...data,
                  products: [
                    ...new Map(
                      [...old.products, ...data.products].map((p) => [p.id, p]),
                    ).values(),
                  ],
                }
              : data,
          );
          setForScope(scope);
        }
      } catch (e) {
        if (n === epoch.current)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar a loja.",
          );
      } finally {
        if (n === epoch.current) setBusy(false);
      }
    },
    [mode, scope],
  );
  useEffect(() => {
    if (ready) void refresh();
    return () => {
      epoch.current++;
    };
  }, [ready, refresh]);
  return {
    data: forScope === scope ? raw : empty(),
    busy,
    error,
    refresh,
    hasMore: forScope === scope && hasMore,
  };
}
