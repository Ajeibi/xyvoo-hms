"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { createCartStore, type CartState, type CartStoreApi } from "@/lib/shop/cart-store";

const CartStoreContext = createContext<CartStoreApi | null>(null);

export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  // Lazy useState initializer (not a ref) so the store is created exactly
  // once per mount without touching it during render.
  const [store] = useState<CartStoreApi>(() => createCartStore(slug));

  // The store is created with skipHydration -- rehydration is triggered
  // here instead, since effects only run after the client's hydration
  // render has already been reconciled against the server's HTML. Doing
  // this during render (or relying on persist's normal auto-hydration)
  // would flip hasHydrated synchronously on the client's hydrating pass,
  // mismatching the server-rendered false-state markup.
  useEffect(() => {
    store.persist.rehydrate();
  }, [store]);

  return <CartStoreContext.Provider value={store}>{children}</CartStoreContext.Provider>;
}

export function useCartStore<T>(selector: (state: CartState) => T): T {
  const store = useContext(CartStoreContext);
  if (!store) throw new Error("useCartStore must be used within a CartProvider");
  return useStore(store, selector);
}
