"use client";

import { createContext, useContext } from "react";
import { CartProvider } from "@/components/shop/CartProvider";
import { storeHref } from "@/lib/store/site/links";

type StorefrontClientContext = { slug: string; basePath: string; currency: string };

const Context = createContext<StorefrontClientContext | null>(null);

export function StorefrontProvider({ value, children }: { value: StorefrontClientContext; children: React.ReactNode }) {
  return (
    <Context.Provider value={value}>
      <CartProvider slug={value.slug}>{children}</CartProvider>
    </Context.Provider>
  );
}

export function useStorefront() {
  const value = useContext(Context);
  if (!value) throw new Error("useStorefront must be used within a StorefrontProvider");
  return { ...value, href: (path: string) => storeHref(value.basePath, path) };
}

/** True inside a store's pages; false on the "no shop at this address" page, which has no store. */
export function useHasStorefront() {
  return useContext(Context) !== null;
}

/** Reads a message to screen-reader users through the page's polite live region. */
export function announce(message: string) {
  const region = document.getElementById("announcer");
  if (!region) return;
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}
