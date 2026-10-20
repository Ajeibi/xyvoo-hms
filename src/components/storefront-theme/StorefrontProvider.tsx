"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CartProvider } from "@/components/shop/CartProvider";
import { convertFromHome, shopCurrencyCookie, type DisplayCurrency, type FixedPrices } from "@/lib/store/currencies";
import type { CartLine } from "@/lib/shop/cart";
import { formatShopCurrency } from "@/lib/shop/format";
import { storeHref } from "@/lib/store/site/links";

type StorefrontClientContext = {
  slug: string;
  basePath: string;
  /** The shop's home currency: what prices are stored in and what shoppers are charged in. */
  currency: string;
  /** Currencies shoppers can see prices in, home currency first. */
  currencies: DisplayCurrency[];
  /** The currency to show prices in when the page first loads. */
  displayCurrency: string;
  /** The shop takes orders over WhatsApp, so products and the basket offer "Order on WhatsApp". */
  whatsappOrdering?: boolean;
};

type MoneyContext = { selected: DisplayCurrency; setCurrency: (code: string) => void };

const Context = createContext<StorefrontClientContext | null>(null);
const Money = createContext<MoneyContext | null>(null);

export function StorefrontProvider({ value, children }: { value: StorefrontClientContext; children: React.ReactNode }) {
  const [code, setCode] = useState(value.displayCurrency);
  const selected = value.currencies.find((c) => c.code === code) ?? value.currencies[0];

  const setCurrency = useCallback(
    (next: string) => {
      setCode(next);
      // A year, so the shopper sees the same currency next time.
      document.cookie = `${shopCurrencyCookie(value.slug)}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
    },
    [value.slug],
  );
  const money = useMemo(() => ({ selected, setCurrency }), [selected, setCurrency]);

  return (
    <Context.Provider value={value}>
      <Money.Provider value={money}>
        <CartProvider slug={value.slug}>{children}</CartProvider>
      </Money.Provider>
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

/**
 * Prices in the shopper's chosen currency. Amounts passed in are always in the
 * home currency; a product's fixed price for the chosen currency wins over
 * conversion. Outside a shop (no provider) amounts show as given.
 */
export function useMoney() {
  const shop = useContext(Context);
  const money = useContext(Money);
  const home = shop?.currency ?? null;
  const selected = money?.selected ?? null;
  const isHome = !selected || selected.code === home;
  /** A basket line's unit price in the chosen currency. */
  const lineUnit = (line: Pick<CartLine, "unitPrice" | "fixedPrices">) =>
    isHome || !selected ? line.unitPrice : line.fixedPrices?.[selected.code] ?? convertFromHome(line.unitPrice, selected);

  return {
    code: selected?.code ?? home,
    homeCurrency: home,
    isHome,
    currencies: shop?.currencies ?? [],
    setCurrency: money?.setCurrency ?? (() => undefined),
    /** A home-currency amount in the chosen currency (or the product's fixed price for it). */
    convert: (amount: number, fixed?: number | null) => (isHome || !selected ? amount : fixed ?? convertFromHome(amount, selected)),
    /** Formats an amount already in the chosen currency. */
    format: (amount: number) => formatShopCurrency(amount, selected?.code ?? home),
    /** Formats a home-currency amount in the home currency, e.g. for "You'll be charged ₦X". */
    formatHome: (amount: number) => formatShopCurrency(amount, home),
    fixedFor: (prices: FixedPrices | undefined) => (selected && !isHome ? prices?.[selected.code] : undefined),
    lineUnit,
    /** The basket subtotal in the chosen currency. */
    subtotal: (lines: CartLine[]) => Math.round(lines.reduce((sum, l) => sum + lineUnit(l) * l.quantity, 0) * 100) / 100,
  };
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
