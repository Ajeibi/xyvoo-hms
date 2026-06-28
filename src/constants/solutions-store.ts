export type SolutionsStoreFeatureSection = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
};

export const SOLUTIONS_STORE_HERO = {
  eyebrow: "XYVOO Store",
  title: "A branded storefront — plus everything behind the counter.",
  subtitle:
    "Products, inventory, orders, payments, and marketing tools in one merchant dashboard. Customers see your brand — not ours.",
};

export const SOLUTIONS_STORE_FEATURES: SolutionsStoreFeatureSection[] = [
  {
    eyebrow: "Branded storefront",
    title: "Launch fast on your own subdomain.",
    description:
      "No separate hosting project — configure identity, pages, and merchandising from the dashboard.",
    bullets: [
      "Ready storefront when you sign up",
      "Mobile-first experience",
      "PWA install for repeat buyers",
    ],
  },
  {
    eyebrow: "Catalog & variants",
    title: "Sell SKUs the way you actually stock them.",
    description:
      "Variants, pricing, and inventory tied together so overselling is harder.",
    bullets: [
      "Variants per product",
      "Automatic stock deduction on sale",
      "Bulk import for large catalogues",
    ],
  },
  {
    eyebrow: "Checkout & payments",
    title: "Trusted checkout with Paystack.",
    description:
      "Accept cards through your primary gateway with room to grow integrations later.",
    bullets: [
      "Paystack-ready checkout",
      "Receipts and order confirmation flows",
      "Clear fee model per plan",
    ],
  },
  {
    eyebrow: "Orders & fulfilment",
    title: "From paid order to delivered parcel.",
    description:
      "Configure shipping zones and rates so fulfilment stays predictable.",
    bullets: [
      "Shipping rules by zone or weight",
      "Order visibility in dashboard",
      "Customer accounts optional",
    ],
  },
  {
    eyebrow: "Team & access",
    title: "Give staff exactly what they need.",
    description:
      "Scale operations without handing everyone admin keys.",
    bullets: [
      "Staff invites",
      "Role-based dashboard access",
      "Centralised store configuration",
    ],
  },
  {
    eyebrow: "Growth",
    title: "SEO and campaigns — without bolt-ons.",
    description:
      "Surface products on search and reach buyers from the same place you manage products.",
    bullets: [
      "SEO controls for store and product pages",
      "Discounts and promo codes",
      "Email marketing lists and sends",
    ],
  },
];
