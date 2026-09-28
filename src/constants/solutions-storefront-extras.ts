import { SOLUTIONS_STOREFRONT_STACK_MODULES } from "@/constants/solutions-storefront";

export type StorefrontExtraFeature = {
  id: string;
  number: string;
  title: string;
  description: string;
  bullets: string[];
  badge: string;
};

export type StorefrontExtraPage = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Section order/selection for StorefrontExtraLanding. Omitted = the
   * original order (fine-print list, then onboarding, then the arc-card
   * stack) used by the three feature sub-pages — left untouched. "compact"
   * drops the arc-card stack entirely (a fast, simple page for a solo
   * audience). "rich" leads with the arc-card stack right after At a Glance
   * (a fuller, more impressive-looking page for a scaling audience). */
  layout?: "compact" | "rich";
  /** "rich" layout only — bold qualitative callouts for SolutionStatBand. */
  stats?: { headline: string; label: string }[];
  features: StorefrontExtraFeature[];
  growth: {
    eyebrow: string;
    title: string;
    subtitle: string;
    tagline: string;
  };
  integrations: {
    title: string;
    intro: string;
    items: { title: string; description: string }[];
  };
  onboarding: {
    heading: string;
    cards: { id: string; title: string; description: string; explanation: string }[];
  };
};

export type StorefrontSiblingLink = {
  id: string;
  title: string;
  description: string;
  href: string;
};

/** Every Storefront solution page, for cross-linking each hero to the
 * others — mirrors the pattern used in the About page hero. */
const STOREFRONT_ALL_PAGES: StorefrontSiblingLink[] = [
  {
    id: "storefront",
    title: "XYVOO Storefront",
    description: "The full storefront overview — catalogue, checkout and fulfilment.",
    href: "/solution/storefront",
  },
  {
    id: "customer-engagement",
    title: "Customer Engagement",
    description: "Segments, loyalty points, back-in-stock alerts and referrals.",
    href: "/solution/storefront/customer-engagement",
  },
  {
    id: "payments",
    title: "Payments & Gift Cards",
    description: "Paystack checkout, gift cards, and receipts.",
    href: "/solution/storefront/payments",
  },
  {
    id: "inventory",
    title: "Inventory & Wholesale",
    description: "Bundles, barcodes, and wholesale pricing.",
    href: "/solution/storefront/inventory",
  },
  {
    id: "solo-sellers",
    title: "Solo Sellers & New Businesses",
    description: "A storefront you can run alone, live the same day.",
    href: "/business-types/solo-sellers",
  },
  {
    id: "growing-retailers",
    title: "Growing Retailers",
    description: "Marketing, team access and reporting as you scale.",
    href: "/business-types/growing-retailers",
  },
];

export function storefrontSiblingLinks(excludeId: string): StorefrontSiblingLink[] {
  return STOREFRONT_ALL_PAGES.filter((p) => p.id !== excludeId);
}

/** Fuller, paragraph-length descriptions for the fine-print feature list on
 * business-type sub-pages, which reads as the important, text-first summary
 * of each module — kept separate from solutions-storefront.ts's own short
 * descriptions (used on the main /solution/storefront page, which stays
 * untouched) rather than lengthening those directly. */
const MODULE_DESCRIPTIONS_LONG: Record<string, string> = {
  storefront:
    "Your storefront is live on your own subdomain the moment you sign up — your logo, your colours, your identity throughout. Shoppers never see XYVOO anywhere in the experience, and it works as an installable app on their phone from the first visit.",
  catalog:
    "Variants, pricing and stock all live in the same record, so a size or colour running low is visible before it oversells rather than after a customer complains. Bulk import and batch edits mean a large catalogue doesn't have to be entered one product at a time.",
  orders:
    "Every order moves through the same board from placement to delivered parcel, with shipping rules by zone or weight applied automatically. Returns run through the same flow too, instead of a separate process nobody remembers the steps to.",
  payments:
    "Card, transfer and USSD are accepted from day one through Paystack, with room to add more providers as you grow. Every payment status — paid, pending or failed — flows straight into the same order board your team already works from.",
  marketing:
    "Customer segments, loyalty points, back-in-stock alerts, abandoned cart recovery and a referral program all run without a separate marketing tool bolted on. SEO controls and coupon codes are built into the same dashboard, not a plugin you have to configure separately.",
  team:
    "Invite staff and decide exactly what each person can reach, instead of handing out full admin access by default. Storefront configuration stays centralised, so there's one source of truth regardless of how many people are working in it.",
  analytics:
    "Sales performance, order volumes and traffic insights are scoped to your storefront alone — never shared with or benchmarked against other merchants. The same dashboard updates live as orders come in, not on a delayed nightly report.",
};

function pickModules(ids: string[]): StorefrontExtraFeature[] {
  return ids.map((id, index) => {
    const source = SOLUTIONS_STOREFRONT_STACK_MODULES.find((m) => m.id === id);
    if (!source) throw new Error(`Unknown Storefront module id: ${id}`);
    const shortTitle = source.number.split("—")[1]?.trim() ?? source.number;
    return {
      id: source.id,
      number: `${String(index + 1).padStart(2, "0")} — ${shortTitle}`,
      title: source.title,
      description: MODULE_DESCRIPTIONS_LONG[source.id] ?? source.description,
      bullets: source.bullets,
      badge: "Live",
    };
  });
}

export const STOREFRONT_CUSTOMER_ENGAGEMENT: StorefrontExtraPage = {
  id: "customer-engagement",
  eyebrow: "Storefront · Customer Engagement",
  title: "Turn first-time buyers into repeat customers.",
  subtitle:
    "Segments, loyalty points, back-in-stock alerts, abandoned cart recovery and referrals — built into your storefront, not bolted on.",
  features: [
    {
      id: "segments",
      number: "01 — Customer Segments",
      title: "Group customers,\ntarget them directly.",
      description:
        "Group your customers by how much they spend, where they're based or what they've bought before, and build a segment in a few clicks — no spreadsheet exports required. Once a segment exists, you can target it directly with its own campaign or discount, instead of sending the same message to your entire list.",
      bullets: [
        "Group by spend, location or order history in a few clicks",
        "Target a segment directly with campaigns or discounts",
      ],
      badge: "Live",
    },
    {
      id: "loyalty",
      number: "02 — Loyalty Points",
      title: "Reward the customers\nwho keep coming back.",
      description:
        "Every purchase earns points automatically, with no manual tracking or separate loyalty card to manage. Customers can see their balance and redeem it straight at checkout on their next order, which keeps them coming back without you having to run a standalone rewards programme.",
      bullets: [
        "Points earned automatically on every purchase",
        "Redeemable straight at checkout, no separate wallet",
      ],
      badge: "Automated",
    },
    {
      id: "back-in-stock",
      number: "03 — Back-in-Stock Alerts",
      title: "Sold out today,\nremembered tomorrow.",
      description:
        "When a product sells out, customers can opt in with a single click instead of leaving empty-handed. The moment stock is replenished, everyone who opted in gets notified automatically — no spreadsheet of emails to chase down by hand.",
      bullets: [
        "Customers opt in with one click on a sold-out product",
        "Notified automatically the moment stock is replenished",
      ],
      badge: "Automated",
    },
    {
      id: "abandoned-cart",
      number: "04 — Abandoned Cart Recovery",
      title: "Almost bought?\nWe'll remind them.",
      description:
        "If a shopper adds items to their cart and leaves without checking out, a reminder goes out automatically to bring them back to finish the order. It runs entirely in the background, and recovery rates show up alongside the rest of your sales data, so you can see exactly how much revenue it's recovering.",
      bullets: [
        "Reminders sent automatically after a cart is left behind",
        "Recovery rate tracked alongside the rest of your sales data",
      ],
      badge: "Automated",
    },
    {
      id: "referral",
      number: "05 — Referral Program",
      title: "Your customers,\nyour sales team.",
      description:
        "Every customer gets their own unique referral link they can share with friends or on social media. When someone uses it to make a purchase, the referral is tracked automatically from click to checkout, and the reward is issued without you having to manually verify or process a single claim.",
      bullets: [
        "Every customer gets a unique referral link",
        "Rewards issued automatically once a referral converts",
      ],
      badge: "Live",
    },
  ],
  growth: {
    eyebrow: "After the sale",
    title: "Keep them coming back.",
    subtitle:
      "Segments, loyalty, alerts, recovery and referrals — the parts of running a storefront that turn one order into ten.",
    tagline: "Still just one dashboard — not five separate marketing tools.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo — it's wired into the rest of your storefront.",
    items: [
      {
        title: "Checkout",
        description: "Loyalty points and gift cards redeem at the same checkout your customers already use.",
      },
      {
        title: "Orders",
        description: "Abandoned cart recovery reads straight from your live order data — no separate tracking pixel to install.",
      },
      {
        title: "Analytics",
        description: "Segment performance and referral conversions show up in the same dashboard as your sales numbers.",
      },
    ],
  },
  onboarding: {
    heading: "Turn it on in three steps.",
    cards: [
      {
        id: "segment",
        title: "Set up your first segment",
        description: "Group customers by spend, location or order history.",
        explanation:
          "Create a segment from your customer list in a couple of clicks — no CSV exports or spreadsheets needed.",
      },
      {
        id: "loyalty",
        title: "Turn on loyalty points",
        description: "Decide how points are earned and what they're worth at checkout.",
        explanation:
          "Points start accruing on the next order — customers redeem them straight at checkout, automatically.",
      },
      {
        id: "automate",
        title: "Let the rest run itself",
        description:
          "Abandoned cart recovery, back-in-stock alerts and referrals all run automatically once switched on.",
        explanation:
          "No ongoing manual work — these stay running in the background while you focus on the storefront itself.",
      },
    ],
  },
};

export const STOREFRONT_PAYMENTS: StorefrontExtraPage = {
  id: "payments",
  eyebrow: "Storefront · Payments",
  title: "Get paid your way, every time.",
  subtitle:
    "Paystack checkout, gift cards, and receipts — all handled without a separate payment tool bolted on.",
  features: [
    {
      id: "checkout",
      number: "01 — Paystack Checkout",
      title: "Fast, trusted\nlocal checkout.",
      description:
        "Card, bank transfer and USSD are all accepted from the moment your storefront goes live, powered by Paystack under the hood. There's no separate merchant account application to wait on first — checkout is ready to take a real payment on day one.",
      bullets: [
        "Card, bank transfer and USSD accepted from day one",
        "No separate merchant account needed to get started",
      ],
      badge: "Live",
    },
    {
      id: "gift-cards",
      number: "02 — Gift Cards",
      title: "Let customers\nbuy for each other.",
      description:
        "Customers can buy a gift card for someone else directly from your storefront, with no separate plugin or third-party service involved. Balances are tracked automatically and redeemed straight at checkout, so there's no manual reconciliation between a gift card system and your actual sales.",
      bullets: [
        "Customers buy gift cards directly from your storefront",
        "Redeemed automatically at checkout, balance tracked",
      ],
      badge: "Live",
    },
    {
      id: "receipts",
      number: "03 — Instant Receipts & Confirmation",
      title: "Every order,\nconfirmed instantly.",
      description:
        "The moment a payment clears, the customer receives a receipt and confirmation automatically, carrying your storefront's own branding rather than a generic template. There's nothing to trigger manually — every order, regardless of size, gets the same instant, professional confirmation.",
      bullets: [
        "Every order gets a branded receipt automatically",
        "Confirmation sent the moment payment clears",
      ],
      badge: "Automated",
    },
    {
      id: "checkout-analytics",
      number: "04 — Checkout Analytics",
      title: "Revenue truth,\nas it happens.",
      description:
        "Every checkout event — successful, failed or abandoned — feeds straight into your sales analytics as it happens, rather than sitting in a separate payment dashboard you have to check independently. That means the revenue numbers you see are always current, without reconciling two different systems by hand.",
      bullets: [
        "Every checkout event feeds straight into your dashboard",
        "No separate reporting tool to reconcile against",
      ],
      badge: "Live Data",
    },
  ],
  growth: {
    eyebrow: "Getting paid",
    title: "Money in, without the friction.",
    subtitle:
      "Paystack checkout, gift cards and receipts — handled without bolting on a separate payment tool.",
    tagline: "Still just one dashboard — not a separate payment gateway to reconcile.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "Payments aren't a bolt-on — they're wired into the rest of your storefront.",
    items: [
      {
        title: "Catalogue",
        description: "Gift card balances and product pricing live in the same system, so nothing needs reconciling by hand.",
      },
      {
        title: "Orders",
        description: "Every payment status flows straight into your order board — paid, pending or failed.",
      },
      {
        title: "Analytics",
        description: "Checkout events feed the same sales dashboard as the rest of your storefront.",
      },
    ],
  },
  onboarding: {
    heading: "Get paid in three steps.",
    cards: [
      {
        id: "connect",
        title: "Connect Paystack",
        description: "Card, transfer and USSD are ready the moment you sign up.",
        explanation:
          "No separate merchant account application to wait on — Paystack is switched on from day one.",
      },
      {
        id: "giftcards",
        title: "Turn on gift cards",
        description: "Let customers buy and send gift cards from your storefront.",
        explanation:
          "Balances are tracked automatically and redeemed straight at checkout — no separate ledger to manage.",
      },
      {
        id: "reconcile",
        title: "Reconcile without the spreadsheet",
        description: "Every payment status and receipt lands in the same dashboard.",
        explanation:
          "Checkout events, receipts and analytics all live in one place, so finance isn't rebuilding records by hand.",
      },
    ],
  },
};

export const STOREFRONT_INVENTORY: StorefrontExtraPage = {
  id: "inventory",
  eyebrow: "Storefront · Inventory",
  title: "Stock that scales from single units to bulk orders.",
  subtitle:
    "Bundles, barcodes and wholesale pricing — built into the same catalogue you already manage.",
  features: [
    {
      id: "bundles",
      number: "01 — Product Bundles",
      title: "Sell products\ntogether, as one.",
      description:
        "Combine several products into a single listing — a gift set, a starter pack — and sell it as one item, while stock for every individual component updates automatically as bundles sell. There's no separate spreadsheet tracking how many of each component is left.",
      bullets: [
        "Bundle products together and sell as one listing",
        "Stock tracked across every component automatically",
      ],
      badge: "Live",
    },
    {
      id: "barcode",
      number: "02 — Barcode Generator",
      title: "Every SKU,\nscan-ready.",
      description:
        "Every SKU in your catalogue gets its own barcode generated automatically, ready to print and use for in-store scanning alongside your online listings. The same barcode works whether the sale happens on your storefront or at a till in person.",
      bullets: [
        "Generate a barcode for every SKU in your catalogue",
        "Ready for in-store scanning alongside online sales",
      ],
      badge: "Live",
    },
    {
      id: "wholesale",
      number: "03 — Wholesale & MOQ Pricing",
      title: "Bulk buyers,\npriced properly.",
      description:
        "Set a minimum and maximum order quantity for any product, with tiered pricing that kicks in automatically once a buyer crosses into bulk territory. Wholesale and retail customers use the exact same checkout — there's no separate B2B portal or manual quote process to manage.",
      bullets: [
        "Set minimum and maximum order quantities per product",
        "Tiered pricing for bulk buyers, built into checkout",
      ],
      badge: "Live",
    },
    {
      id: "stock-tracking",
      number: "04 — Real-Time Stock Tracking",
      title: "Stock that stays\ntrue everywhere.",
      description:
        "Stock levels update the instant an order is placed, whether that order came through your online storefront or was rung up in person at the till. Online and in-person sales always stay in sync, so you're never at risk of selling something twice from two different channels.",
      bullets: [
        "Stock updates the instant an order is placed",
        "Online and in-person sales stay in sync automatically",
      ],
      badge: "Real-time",
    },
  ],
  growth: {
    eyebrow: "Stock, sorted",
    title: "From one unit to one pallet.",
    subtitle:
      "Bundles, barcodes and wholesale pricing — built into the same catalogue you already manage.",
    tagline: "Still just one catalogue — not a separate spreadsheet for bulk orders.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "Inventory isn't a separate system — it's wired into the rest of your storefront.",
    items: [
      {
        title: "Orders",
        description: "Wholesale orders route through the same checkout as retail ones — no separate B2B system.",
      },
      {
        title: "Point of Sale",
        description: "Barcodes generated here are ready to scan the moment you're selling in person.",
      },
      {
        title: "Storefront",
        description: "Bundles show up as single listings on your storefront, priced and tracked as one item.",
      },
    ],
  },
  onboarding: {
    heading: "Get your catalogue ready in three steps.",
    cards: [
      {
        id: "bundle",
        title: "Bundle your first products",
        description:
          "Combine several products into a single sellable listing — a gift set, a starter pack, whatever suits your catalogue.",
        explanation:
          "Stock across every component updates automatically as bundles sell, so there's no separate spreadsheet tracking how many of each part is left.",
      },
      {
        id: "barcode",
        title: "Generate barcodes",
        description:
          "Every SKU in your catalogue gets a barcode generated automatically, ready to print for in-store scanning.",
        explanation:
          "Use the same barcode online and at the till — no separate in-store system to maintain, and no risk of the two falling out of sync.",
      },
      {
        id: "wholesale",
        title: "Set wholesale pricing",
        description:
          "Add minimum and maximum order quantities wherever you need them, with tiered pricing that applies automatically.",
        explanation:
          "Bulk buyers see the right pricing the moment they cross into wholesale territory at checkout — no separate quote process or manual invoice to prepare.",
      },
    ],
  },
};

export const STOREFRONT_SOLO_SELLERS: StorefrontExtraPage = {
  id: "solo-sellers",
  layout: "compact",
  eyebrow: "For Solo Sellers & New Businesses",
  title: "A storefront you can run by yourself, live today.",
  subtitle:
    "Every part of running a storefront — your site, catalogue, orders, checkout, marketing, team access and reporting — built for a business of one, not a whole department.",
  features: pickModules(["storefront", "catalog", "orders", "payments", "marketing", "team", "analytics"]),
  growth: {
    eyebrow: "Built for a team of one",
    title: "Everything you need to open, nothing you don't.",
    subtitle:
      "Every part of running a storefront — your site, catalogue, orders, checkout, marketing, team access and reporting — built for a business of one, not a whole department.",
    tagline: "Still just one dashboard — not a website builder, a payment plugin and a stock sheet stitched together.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo — it's wired into the rest of your storefront.",
    items: [
      {
        title: "Orders",
        description: "Every payment that clears turns straight into an order on the same board, with nothing to reconcile by hand.",
      },
      {
        title: "Catalogue",
        description: "Stock updates the instant an order is placed, so you never have to double-check what's actually left by hand.",
      },
      {
        title: "Checkout",
        description: "Coupon codes and loyalty points are already wired into the same checkout your customers use from day one.",
      },
      {
        title: "Analytics",
        description: "Your first sales show up in the same dashboard from day one — no separate reporting tool to set up later.",
      },
    ],
  },
  onboarding: {
    heading: "Open for business in one sitting.",
    cards: [
      {
        id: "storefront",
        title: "Launch your storefront",
        description:
          "Your own subdomain, logo and colours, live the moment you sign up — no hosting or domain setup to figure out first.",
        explanation:
          "It's a mobile-first PWA from the start, installable straight from a customer's browser without an app store submission.",
      },
      {
        id: "catalog",
        title: "List your first products",
        description:
          "Add variants, pricing and stock for each product, ready to sell as soon as they're saved.",
        explanation:
          "Stock updates automatically as orders come in, so there's no separate spreadsheet to keep in sync with what's actually left.",
      },
      {
        id: "payments",
        title: "Turn on checkout",
        description:
          "Card, transfer and USSD accepted from your very first order, with no separate merchant account application first.",
        explanation:
          "Every payment status feeds the same order board automatically, so getting paid and fulfilling the order are never two disconnected steps.",
      },
    ],
  },
};

/** Hand-authored, not pulled via pickModules() — these describe scaling-retail
 * capabilities a growing storefront actually needs (multi-channel sync,
 * cohort analytics, multi-location stock, wholesale) that go beyond the
 * single-storefront module set. Badged "Planned" rather than "Live" since
 * none of this exists in XYVOO yet; this page is doubling as a roadmap brief. */
const GROWING_RETAILERS_FEATURES: StorefrontExtraFeature[] = [
  {
    id: "multi-channel-sync",
    number: "01 — Multi-Channel Sync",
    title: "List once,\nsell everywhere.",
    description:
      "Your catalogue stays in sync across your storefront, an Instagram or WhatsApp shop, and a marketplace listing — one product edit updates every channel, and stock never oversells across them.",
    bullets: [
      "One catalogue powering your storefront, social shops and marketplace listings",
      "Stock updates everywhere the moment an order comes in from any channel",
    ],
    badge: "Planned",
  },
  {
    id: "cohort-analytics",
    number: "02 — Customer Lifetime Value & Cohort Analytics",
    title: "See who's actually\nworth keeping.",
    description:
      "Go beyond basic segments to see which customers are worth the most over time, and how a cohort's spending changes after a campaign — not just today's sales number.",
    bullets: [
      "Lifetime value calculated per customer, not just per order",
      "Cohort comparisons to see whether a campaign actually changed behaviour",
    ],
    badge: "Planned",
  },
  {
    id: "multi-location-inventory",
    number: "03 — Multi-Location Inventory",
    title: "Stock split across\nwarehouses, one view.",
    description:
      "Stock held across multiple warehouses or physical stores shows up as one inventory view, with orders automatically routed to whichever location actually has it.",
    bullets: [
      "Stock levels tracked per location, rolled up into one total view",
      "Orders routed automatically to the nearest location with stock",
    ],
    badge: "Planned",
  },
  {
    id: "approval-workflows",
    number: "04 — Approval Workflows",
    title: "A second pair of eyes\nbefore it goes out.",
    description:
      "A discount, refund or price change above a threshold you set requires a manager's approval before it takes effect — so growing the team doesn't mean losing control of the storefront.",
    bullets: [
      "Configurable thresholds for what needs manager sign-off",
      "A queue of pending approvals, not a scramble in a chat thread",
    ],
    badge: "Planned",
  },
  {
    id: "subscriptions",
    number: "05 — Subscriptions & Recurring Orders",
    title: "Bill once,\nship on repeat.",
    description:
      "Customers subscribe to a product once, and it bills and ships again automatically on their chosen schedule — no manually reinvoicing a repeat customer every month.",
    bullets: [
      "Recurring billing on a schedule the customer chooses at checkout",
      "Failed renewal payments retried automatically before a subscription lapses",
    ],
    badge: "Planned",
  },
  {
    id: "3pl-shipping",
    number: "06 — 3PL & Advanced Shipping",
    title: "Labels and tracking,\nwithout the copy-paste.",
    description:
      "Connect a third-party logistics provider and generate shipping labels and tracking numbers directly from an order, instead of re-entering the same address into a courier's own site.",
    bullets: [
      "Shipping labels generated directly from the order screen",
      "Tracking numbers synced back to the order automatically",
    ],
    badge: "Planned",
  },
  {
    id: "wholesale-portal",
    number: "07 — Wholesale / B2B Storefront",
    title: "One catalogue,\ntwo price books.",
    description:
      "Bulk and business buyers get their own ordering flow and pricing tier, running alongside your normal retail storefront on the same catalogue — not a second system to maintain.",
    bullets: [
      "A separate price list and minimum order quantities for approved wholesale accounts",
      "Wholesale orders still land on the same order board as retail",
    ],
    badge: "Planned",
  },
  {
    id: "demand-forecasting",
    number: "08 — Demand Forecasting",
    title: "Reorder before\nyou run out.",
    description:
      "Based on how fast a product is actually selling, the system flags what to reorder — and when — before stock hits zero, instead of finding out from an angry customer.",
    bullets: [
      "Reorder alerts based on real sales velocity, not a fixed stock threshold",
      "Forecasts that adjust automatically as sales speed up or slow down",
    ],
    badge: "Planned",
  },
];

export const STOREFRONT_GROWING_RETAILERS: StorefrontExtraPage = {
  id: "growing-retailers",
  layout: "rich",
  eyebrow: "For Growing Retailers",
  title: "The tools that keep up once orders do.",
  subtitle:
    "Multi-channel sync, multi-location stock, wholesale pricing and demand forecasting — the layer a single-storefront system doesn't give you once you've outgrown the basics.",
  stats: [
    { headline: "One catalogue", label: "powering your storefront, social shops and marketplace listings" },
    { headline: "Multiple locations", label: "tracked as one inventory view, not five separate spreadsheets" },
    { headline: "One dashboard", label: "for retail and wholesale orders alike, not two systems to reconcile" },
  ],
  features: GROWING_RETAILERS_FEATURES,
  growth: {
    eyebrow: "After launch",
    title: "Then the real work starts.",
    subtitle:
      "Multi-channel sync, multi-location stock, wholesale pricing and demand forecasting — the layer a single-storefront system doesn't give you once you've outgrown the basics.",
    tagline: "Still just one dashboard — not five separate tools your team has to juggle.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo — it's wired into the rest of your storefront.",
    items: [
      {
        title: "Catalogue",
        description: "Multi-channel listings and wholesale pricing both read from the same product catalogue, not a duplicate copy.",
      },
      {
        title: "Orders",
        description: "Wholesale orders, subscriptions and multi-location fulfilment all land on the same order board as everything else.",
      },
      {
        title: "Checkout",
        description: "Subscription billing runs through the same checkout your one-off customers already use.",
      },
      {
        title: "Analytics",
        description: "Cohort and lifetime-value numbers pull from the same live sales data your regular dashboard already shows.",
      },
    ],
  },
  onboarding: {
    heading: "Scale without adding new tools.",
    cards: [
      {
        id: "channels",
        title: "Connect your other sales channels",
        description:
          "Sync your catalogue to an Instagram or WhatsApp shop and a marketplace listing, from the same product records.",
        explanation:
          "Stock stays accurate everywhere at once — no more manually updating three places every time something sells.",
      },
      {
        id: "locations",
        title: "Add your other locations",
        description:
          "Bring a second warehouse or store into the same inventory view, so stock is tracked per location automatically.",
        explanation:
          "Orders route to whichever location actually has the stock, instead of a manual check before every fulfilment.",
      },
      {
        id: "forecasting",
        title: "Turn on demand forecasting",
        description:
          "Let the system watch sales velocity per product and flag what needs reordering before it actually runs out.",
        explanation:
          "Reorder alerts adjust automatically as a product speeds up or slows down — nothing to recalculate by hand.",
      },
    ],
  },
};
