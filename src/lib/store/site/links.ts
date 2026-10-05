import type { z } from "zod";
import type { menuItemSchema } from "./schema";

type MenuItem = z.infer<typeof menuItemSchema>;

/**
 * Storefront links are written as store-relative paths ("/products") and
 * prefixed with the base path the store is being served under: "" on its
 * subdomain, "/shop/<slug>" on the platform domain.
 */
export function storeHref(basePath: string, path: string) {
  if (/^https:\/\//.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean === "/") return basePath || "/";
  return `${basePath}${clean}`;
}

export const STORE_PATHS = {
  home: "/",
  products: "/products",
  product: (slug: string) => `/products/${encodeURIComponent(slug)}`,
  collection: (slug: string) => `/collections/${encodeURIComponent(slug)}`,
  page: (slug: string) => `/pages/${encodeURIComponent(slug)}`,
  cart: "/cart",
  checkout: "/checkout",
  category: (category: string) => `/products?category=${encodeURIComponent(category)}`,
};

/** Store-relative path for a menu item, or null if it can't be linked. */
export function menuItemPath(item: MenuItem): string | null {
  switch (item.type) {
    case "home":
      return STORE_PATHS.home;
    case "shop":
      return STORE_PATHS.products;
    case "collection":
      return item.target ? STORE_PATHS.collection(item.target) : null;
    case "product":
      return item.target ? STORE_PATHS.product(item.target) : null;
    case "page":
      return item.target ? STORE_PATHS.page(item.target) : null;
    case "url":
      return item.target.startsWith("/") || /^https:\/\//.test(item.target) ? item.target : null;
  }
}
