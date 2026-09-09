/** Canonical register / login URLs per product (Storefront routes are scaffolded for upcoming flows). */
export const XYVOO_AUTH_ROUTES = {
  hms: {
    register: "/register",
    login: "/auth/login",
    title: "Hotel Management System",
    subtitle: "Front desk, rooms, and operations in one dashboard.",
  },
  storefront: {
    register: "/register/storefront",
    login: "/auth/login/storefront",
    title: "XYVOO Storefront",
    subtitle: "Branded storefront, catalog, and checkout.",
  },
} as const;

export type XyvooAuthProduct = keyof typeof XYVOO_AUTH_ROUTES;
