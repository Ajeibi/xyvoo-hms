/** Canonical register / login URLs per product. */
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
    subtitle: "Branded catalog and order management for your store.",
  },
} as const;

export type XyvooAuthProduct = keyof typeof XYVOO_AUTH_ROUTES;
