import type { HmsNavIconKey } from "@/lib/hms/department-access";

/**
 * The hotel dashboard's meaning colours, the same idea as the store dashboard's: each colour always
 * stands for the same part of the hotel, so staff learn them without being told. Money is mint,
 * rooms and bookings are sky, guests are cream, stock is teal, food and drink is orange, cleaning
 * and upkeep is violet, the team is indigo, and things that need someone now are rose.
 * Colour never carries meaning alone: every use also has a label and an icon. Text stays dark
 * (slate-900/700) on the light tints for contrast.
 *
 * Class names are written out in full so Tailwind can see them.
 */
export type HmsMeaning = "money" | "rooms" | "guests" | "stock" | "food" | "care" | "team" | "attention" | "neutral";

export const HMS_MEANING: Record<
  HmsMeaning,
  {
    /** Soft tile background. */
    tint: string;
    /** Icon colour. */
    icon: string;
    /** White icon box with a coloured ring, used on tinted tiles. */
    iconBox: string;
    /** Solid dot, used in lists and legends. */
    dot: string;
    /** Hover border for white cards that carry this meaning. */
    hoverBorder: string;
  }
> = {
  money: {
    tint: "bg-emerald-50",
    icon: "text-emerald-600",
    iconBox: "bg-white text-emerald-600 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    hoverBorder: "hover:border-emerald-300",
  },
  rooms: {
    tint: "bg-sky-50",
    icon: "text-sky-700",
    iconBox: "bg-white text-sky-700 ring-1 ring-sky-200",
    dot: "bg-sky-500",
    hoverBorder: "hover:border-sky-300",
  },
  guests: {
    tint: "bg-amber-50",
    icon: "text-amber-600",
    iconBox: "bg-white text-amber-600 ring-1 ring-amber-200",
    dot: "bg-amber-500",
    hoverBorder: "hover:border-amber-300",
  },
  stock: {
    tint: "bg-teal-50",
    icon: "text-teal-700",
    iconBox: "bg-white text-teal-700 ring-1 ring-teal-200",
    dot: "bg-teal-500",
    hoverBorder: "hover:border-teal-300",
  },
  food: {
    tint: "bg-orange-50",
    icon: "text-orange-600",
    iconBox: "bg-white text-orange-600 ring-1 ring-orange-200",
    dot: "bg-orange-500",
    hoverBorder: "hover:border-orange-300",
  },
  care: {
    tint: "bg-violet-50",
    icon: "text-violet-600",
    iconBox: "bg-white text-violet-600 ring-1 ring-violet-200",
    dot: "bg-violet-500",
    hoverBorder: "hover:border-violet-300",
  },
  team: {
    tint: "bg-indigo-50",
    icon: "text-indigo-600",
    iconBox: "bg-white text-indigo-600 ring-1 ring-indigo-200",
    dot: "bg-indigo-500",
    hoverBorder: "hover:border-indigo-300",
  },
  attention: {
    tint: "bg-rose-50",
    icon: "text-rose-600",
    iconBox: "bg-white text-rose-600 ring-1 ring-rose-200",
    dot: "bg-rose-500",
    hoverBorder: "hover:border-rose-300",
  },
  neutral: {
    tint: "bg-slate-100",
    icon: "text-slate-600",
    iconBox: "bg-white text-slate-600 ring-1 ring-slate-200",
    dot: "bg-slate-400",
    hoverBorder: "hover:border-slate-300",
  },
};

/** Which meaning each sidebar icon carries, so the menu and the pages it opens share a colour. */
export const NAV_ICON_MEANING: Record<HmsNavIconKey, HmsMeaning> = {
  dashboard: "neutral",
  frontdesk: "rooms",
  reservations: "rooms",
  rooms: "rooms",
  guests: "guests",
  accounts: "money",
  "restaurant-bar": "food",
  kitchen: "food",
  inventory: "stock",
  procurement: "stock",
  housekeeping: "care",
  maintenance: "care",
  hr: "team",
  revenue: "money",
  settings: "neutral",
  bell: "attention",
  moon: "money",
  doorOpen: "rooms",
  package: "stock",
  truck: "stock",
  arrowLeftRight: "stock",
  clipboardCheck: "care",
  trash2: "attention",
};
