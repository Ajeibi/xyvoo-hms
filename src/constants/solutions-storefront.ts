import type { SolutionsOnboardingCard } from "@/components/website/SolutionsOnboardingStack";

export const SOLUTIONS_STOREFRONT_HERO = {
  eyebrow: "Storefront",
  title: "One connected operating system for your online business.",
  subtitle:
    "Storefront to checkout, catalog to fulfilment — every part of your shop runs under your brand, connected in real time.",
};

/** Sticky-stack modules */
export type SolutionsStorefrontStackModule = {
  id: string;
  number: string;
  title: string;
  description: string;
  bullets: string[];
  urlLabel: string;
};

export const SOLUTIONS_STOREFRONT_STACK_MODULES: SolutionsStorefrontStackModule[] = [
  {
    id: "storefront",
    number: "01 — Storefront & Website",
    title: "Your brand,\nfront and center.",
    description:
      "A ready-to-use storefront on your own subdomain — your logo, your colours, your identity. Shoppers never see XYVOO.",
    bullets: [
      "Live storefront the moment you sign up, no hosting setup required",
      "Mobile-first PWA experience, installable straight from the browser",
    ],
    urlLabel: "app.getxyvoo.com / storefront",
  },
  {
    id: "catalog",
    number: "02 — Catalog & Inventory",
    title: "Products managed\nwithout friction.",
    description:
      "Variants, pricing, and stock tied together so overselling is harder — with bulk tools for large catalogues.",
    bullets: [
      "Variants, categories and bundles with real-time stock updates",
      "Bulk import and batch edits for fast merchandising",
    ],
    urlLabel: "app.getxyvoo.com / products",
  },
  {
    id: "orders",
    number: "03 — Orders & Fulfilment",
    title: "From checkout\nto delivered parcel.",
    description:
      "End-to-end order management from placement through fulfilment, with shipping rules that keep delivery predictable.",
    bullets: [
      "Unified order board with fulfilment statuses and delivery handoff",
      "Shipping rules by zone or weight, plus returns handled in one flow",
    ],
    urlLabel: "app.getxyvoo.com / orders",
  },
  {
    id: "payments",
    number: "04 — Payments & Checkout",
    title: "Fast, trusted\nlocal checkout.",
    description:
      "Paystack-ready checkout today, with room to add Flutterwave and Stripe as you grow — card, transfer and USSD supported.",
    bullets: [
      "Paystack checkout with receipts and order confirmation built in",
      "Checkout events feed straight into your sales analytics",
    ],
    urlLabel: "app.getxyvoo.com / checkout",
  },
  {
    id: "marketing",
    number: "05 — Marketing & Growth",
    title: "SEO and campaigns,\nbuilt in.",
    description:
      "Surface products on search and reach buyers directly, without bolting on a separate marketing tool.",
    bullets: [
      "SEO controls for storefront and product pages",
      "Discount codes, promotions and email marketing lists and sends",
    ],
    urlLabel: "app.getxyvoo.com / marketing",
  },
  {
    id: "team",
    number: "06 — Team & Access",
    title: "Give staff exactly\nwhat they need.",
    description:
      "Scale operations without handing everyone admin keys — invite staff and control what each person can reach.",
    bullets: [
      "Staff invites with role-based dashboard access",
      "Centralised storefront configuration, one source of truth",
    ],
    urlLabel: "app.getxyvoo.com / team",
  },
  {
    id: "analytics",
    number: "07 — Analytics & Reporting",
    title: "Revenue truth,\nwithout the noise.",
    description:
      "Sales performance, order volumes and traffic insights scoped to your storefront — not shared with other merchants.",
    bullets: [
      "Live dashboard for sales, orders and top-selling products",
      "Data stays scoped to your storefront alone",
    ],
    urlLabel: "app.getxyvoo.com / analytics",
  },
];

/** Heading for the arc-cycle card stack covering the last 3 modules (marketing, team, analytics) */
export const SOLUTIONS_STOREFRONT_GROWTH_STACK_HEADING = {
  eyebrow: "After launch",
  title: "Then the real work starts.",
  subtitle:
    "Getting found, keeping a team organised and watching what the numbers say — the part of running a storefront that never really finishes.",
};

export const SOLUTIONS_STOREFRONT_INTEGRATIONS_TITLE = "Integrations";
export const SOLUTIONS_STOREFRONT_INTEGRATIONS_INTRO =
  "Turn on the channels you need, whenever you're ready — nothing forced on you upfront.";

export type SolutionsStorefrontIntegrationItem = {
  title: string;
  description: string;
};

export const SOLUTIONS_STOREFRONT_INTEGRATIONS_ITEMS: SolutionsStorefrontIntegrationItem[] = [
  {
    title: "Paystack, built in",
    description:
      "Accept card and bank transfer payments from day one, with Flutterwave and Stripe on the roadmap as you grow.",
  },
  {
    title: "Bring your own domain",
    description:
      "Connect a custom domain and get SSL configured automatically from the dashboard — no separate hosting to manage.",
  },
  {
    title: "Email marketing tools",
    description:
      "Build subscriber lists and send campaigns without leaving the dashboard — no separate email tool to wire up.",
  },
  {
    title: "Bulk product import",
    description:
      "Upload a structured CSV to add or update your whole catalogue at once, instead of entering products one by one.",
  },
];

export const SOLUTIONS_STOREFRONT_ONBOARDING_CARDS: SolutionsOnboardingCard[] = [
  {
    id: "sign-up",
    title: "Sign up & go live",
    description:
      "Business details, quick verification, and your storefront is live on your own subdomain immediately.",
    explanation:
      "There's no separate hosting to arrange and no developer to wait on. The moment your details are verified, your storefront is already running on its own subdomain, carrying your branding, and ready for its first product. You can start on the free plan and move up later without switching platforms.",
  },
  {
    id: "add-products",
    title: "Add your products",
    description: "Set prices and build your catalogue — no coding required.",
    explanation:
      "Products, variants, pricing and stock all live in one dashboard, so there's no separate inventory tool to keep in sync. Add items one at a time while you're getting started, or bring in a bulk CSV import once your catalogue grows — pricing and stock update everywhere shoppers see them, straight away.",
  },
  {
    id: "connect-payments",
    title: "Connect payments",
    description:
      "Paystack checkout is ready from day one — accept card and bank transfer payments right away.",
    explanation:
      "Paystack is switched on from the start, so there's no separate merchant account to set up before you can take a card or bank transfer payment. Every order and payment status flows straight into your dashboard, and Flutterwave and Stripe are on the roadmap as you grow.",
  },
  {
    id: "start-free",
    title: "Start for free",
    description: "No credit card required — upgrade only when you're ready.",
    explanation:
      "You can explore the full storefront experience on the free plan with nothing to enter upfront. There's no trial clock pushing a decision — when your business needs more (more products, more staff, deeper reporting) you upgrade on your own terms.",
  },
];
