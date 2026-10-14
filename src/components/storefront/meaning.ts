/**
 * The dashboard's five meaning colours. Each always stands for the same thing, so a shop owner
 * learns them without being told: money is mint, orders are sky, customers are cream, stock is
 * teal, visitors and marketing are blush. Colour never carries meaning alone: every use also has
 * a label and an icon. Text stays dark (slate-900/700) on the light tints for contrast.
 *
 * Class names are written out in full so Tailwind can see them.
 */
export type Meaning = "money" | "orders" | "customers" | "stock" | "marketing" | "neutral";

export const MEANING: Record<
  Meaning,
  {
    /** Soft tile background. */
    tint: string;
    /** Icon colour. */
    icon: string;
    /** White icon box with a coloured ring, used on tinted tiles. */
    iconBox: string;
    /** Solid dot, used in the menu and chips. */
    dot: string;
    /** Selected chip or tab. */
    chipOn: string;
  }
> = {
  money: {
    tint: "bg-emerald-50",
    icon: "text-emerald-600",
    iconBox: "bg-white text-emerald-600 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    chipOn: "border-emerald-600 bg-emerald-50 text-emerald-900",
  },
  orders: {
    tint: "bg-sky-50",
    icon: "text-sky-700",
    iconBox: "bg-white text-sky-700 ring-1 ring-sky-200",
    dot: "bg-sky-500",
    chipOn: "border-sky-600 bg-sky-50 text-sky-900",
  },
  customers: {
    tint: "bg-amber-50",
    icon: "text-amber-600",
    iconBox: "bg-white text-amber-600 ring-1 ring-amber-200",
    dot: "bg-amber-500",
    chipOn: "border-amber-600 bg-amber-50 text-amber-900",
  },
  stock: {
    tint: "bg-teal-50",
    icon: "text-teal-700",
    iconBox: "bg-white text-teal-700 ring-1 ring-teal-200",
    dot: "bg-teal-500",
    chipOn: "border-teal-600 bg-teal-50 text-teal-900",
  },
  marketing: {
    tint: "bg-rose-50",
    icon: "text-rose-600",
    iconBox: "bg-white text-rose-600 ring-1 ring-rose-200",
    dot: "bg-rose-500",
    chipOn: "border-rose-600 bg-rose-50 text-rose-900",
  },
  neutral: {
    tint: "bg-slate-50",
    icon: "text-slate-600",
    iconBox: "bg-white text-slate-600 ring-1 ring-slate-200",
    dot: "bg-slate-400",
    chipOn: "border-blue-600 bg-blue-50 text-blue-900",
  },
};

/** Which meaning each dashboard section carries, for its menu icon and its page's tiles. */
export const SECTION_MEANING: Record<string, Meaning> = {
  dashboard: "neutral",
  orders: "orders",
  products: "stock",
  collections: "stock",
  customers: "customers",
  discounts: "marketing",
  "gift-cards": "marketing",
  campaigns: "marketing",
  loyalty: "marketing",
  referrals: "marketing",
  returns: "orders",
  trade: "customers",
  blog: "marketing",
  reviews: "customers",
  analytics: "marketing",
  "abandoned-carts": "orders",
  notifications: "marketing",
  website: "marketing",
  domain: "marketing",
  delivery: "orders",
  payments: "money",
  settings: "neutral",
  team: "neutral",
  activity: "neutral",
  alerts: "orders",
};
