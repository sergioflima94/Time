import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createUuid } from "@/lib/uuid";
interface CartState {
  actor: string | null;
  items: { variantId: string; sellerId: string; quantity: number }[];
  attempts: Record<string, string>;
  scope: (actor: string | null) => void;
  add: (variantId: string, sellerId: string, stock: number) => void;
  quantity: (variantId: string, n: number) => void;
  clearSeller: (sellerId: string) => void;
  nonce: (sellerId: string) => string;
}
export const useShopCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      actor: null,
      items: [],
      attempts: {},
      scope: (actor) => {
        if (actor !== get().actor)
          set((s) => ({
            actor,
            items: s.actor === null && actor ? s.items : [],
            attempts: {},
          }));
      },
      add: (variantId, sellerId, stock) =>
        set((s) => {
          const items = [...s.items],
            i = items.findIndex((i) => i.variantId === variantId);
          if (
            i < 0 &&
            stock > 0 &&
            items.length < 100 &&
            items.filter((i) => i.sellerId === sellerId).length < 25
          )
            items.push({ variantId, sellerId, quantity: 1 });
          else if (i >= 0)
            items[i] = {
              ...items[i],
              quantity: Math.min(items[i].quantity + 1, stock, 99),
            };
          return { items };
        }),
      quantity: (variantId, n) =>
        set((s) => ({
          items:
            n <= 0
              ? s.items.filter((i) => i.variantId !== variantId)
              : s.items.map((i) =>
                  i.variantId === variantId
                    ? { ...i, quantity: Math.min(99, n) }
                    : i,
                ),
        })),
      clearSeller: (sellerId) =>
        set((s) => ({
          items: s.items.filter((i) => i.sellerId !== sellerId),
          attempts: Object.fromEntries(
            Object.entries(s.attempts).filter(([id]) => id !== sellerId),
          ),
        })),
      nonce: (sellerId) => {
        const previous = get().attempts[sellerId];
        if (previous) return previous;
        const nonce = createUuid();
        set((s) => ({ attempts: { ...s.attempts, [sellerId]: nonce } }));
        return nonce;
      },
    }),
    {
      name: "marcoujogou-shop-cart",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        actor: s.actor,
        items: s.items,
        attempts: s.attempts,
      }),
    },
  ),
);
