import { createStore, type StoreApi } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import { cartLineKey, type CartLine } from "@/lib/shop/cart";

export type CartState = {
  lines: CartLine[];
  /** False until something explicitly triggers rehydration (see
   * CartProvider's useEffect) and it completes -- consumers should treat
   * "not yet hydrated" as unknown, not "empty". */
  hasHydrated: boolean;
  addLine: (line: CartLine) => void;
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  removeLine: (productId: string, variantId: string | null) => void;
  clear: () => void;
};

/** Not just StoreApi<CartState> -- the persist middleware augments the store
 * with a `.persist` namespace (rehydrate/hasHydrated/etc). CartProvider's
 * useEffect calls store.persist.rehydrate(), so callers need this richer
 * type, not the plain vanilla one. */
export type CartStoreApi = ReturnType<typeof createCartStore>;

/** One cart per tenant, not one global cart -- /shop/[slug] is a different
 * tenant's storefront per slug on the same origin (no subdomain routing
 * exists in this app), so the store instance and its localStorage key are
 * both scoped to the slug rather than shared. */
export function createCartStore(slug: string) {
  // persist's rehydration (and onRehydrateStorage below) runs SYNCHRONOUSLY
  // inside createStore(), before "const store = createStore(...)" finishes
  // assigning -- closing over `store` there hits the temporal dead zone.
  // Capturing `set` from the state creator instead works because the state
  // creator itself always runs before rehydration is attempted.
  let setState: StoreApi<CartState>["setState"] | null = null;

  const store = createStore<CartState>()(
    persist(
      (set) => {
        setState = set;
        return {
          lines: [],
          hasHydrated: false,
          addLine: (line) =>
            set((state) => {
              const key = cartLineKey(line.productId, line.variantId);
              const existing = state.lines.find((l) => cartLineKey(l.productId, l.variantId) === key);

              if (existing) {
                return {
                  lines: state.lines.map((l) =>
                    cartLineKey(l.productId, l.variantId) === key
                      ? { ...l, quantity: Math.min(l.quantity + line.quantity, l.maxQuantity || Infinity) }
                      : l,
                  ),
                };
              }

              return { lines: [...state.lines, line] };
            }),
          updateQuantity: (productId, variantId, quantity) =>
            set((state) => {
              const key = cartLineKey(productId, variantId);
              if (quantity <= 0) {
                return { lines: state.lines.filter((l) => cartLineKey(l.productId, l.variantId) !== key) };
              }
              return {
                lines: state.lines.map((l) =>
                  cartLineKey(l.productId, l.variantId) === key ? { ...l, quantity } : l,
                ),
              };
            }),
          removeLine: (productId, variantId) =>
            set((state) => ({
              lines: state.lines.filter(
                (l) => cartLineKey(l.productId, l.variantId) !== cartLineKey(productId, variantId),
              ),
            })),
          clear: () => set({ lines: [] }),
        };
      },
      {
        name: `xyvoo-shop-cart-${slug}`,
        // Only `lines` is persisted -- hasHydrated must always start false
        // and flip via onRehydrateStorage below, never be restored as a
        // stale `true` from a previous session's saved state.
        partialize: (state) => ({ lines: state.lines }),
        // zustand's default persist storage (window.localStorage) resolves
        // SYNCHRONOUSLY, so automatic hydration would complete inside this
        // very createStore() call -- including on the client's hydration
        // render pass, which must match the server's HTML (server has no
        // `window`, so it always renders hasHydrated: false). Without this,
        // the client's hydrating render would immediately see
        // hasHydrated: true while the server-rendered markup shows the
        // false-state skeleton, a guaranteed React hydration mismatch.
        // skipHydration defers rehydration until something explicitly
        // calls store.persist.rehydrate() -- CartProvider does that inside
        // a useEffect, which only runs after hydration reconciliation is
        // already done.
        skipHydration: true,
        onRehydrateStorage: () => () => {
          setState?.({ hasHydrated: true });
        },
      },
    ),
  );

  return store;
}
