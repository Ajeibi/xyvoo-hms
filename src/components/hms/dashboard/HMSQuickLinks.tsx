import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Landmark,
  Package,
  Settings,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";

const QUICK_LINKS = [
  {
    key: "frontdesk",
    label: "Front Desk",
    description: "Check-ins, walk-ins, and room movement",
    icon: Building2,
    tourTarget: "card-frontdesk",
    path: "frontdesk",
    meaning: "rooms" as HmsMeaning,
  },
  {
    key: "reservations",
    label: "Reservations",
    description: "Manage upcoming and current bookings",
    icon: ClipboardList,
    tourTarget: "card-reservations",
    path: "reservations",
    meaning: "rooms" as HmsMeaning,
  },
  {
    key: "accounts",
    label: "Accounts",
    description: "Billing, revenue controls, and postings",
    icon: Landmark,
    tourTarget: "card-accounts",
    path: "accounts",
    meaning: "money" as HmsMeaning,
  },
  {
    key: "restaurant-bar",
    label: "Food & Beverage",
    description: "Restaurant, bar, room service, and outlet posting",
    icon: UtensilsCrossed,
    tourTarget: "card-restaurant-bar",
    path: "restaurant-bar",
    meaning: "food" as HmsMeaning,
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Stock stores, suppliers, and controls",
    icon: Package,
    tourTarget: "card-inventory",
    path: "inventory",
    meaning: "stock" as HmsMeaning,
  },
  {
    key: "housekeeping",
    label: "Housekeeping",
    description: "Cleaning flow and attendant assignments",
    icon: Sparkles,
    tourTarget: "card-housekeeping",
    path: "housekeeping",
    meaning: "care" as HmsMeaning,
  },
  {
    key: "settings",
    label: "Settings",
    description: "Roles, policies, integrations, and go-live",
    icon: Settings,
    tourTarget: "card-settings",
    path: "settings",
    meaning: "neutral" as HmsMeaning,
  },
] as const;

export default function HMSQuickLinks({ slug }: { slug: string }) {
  return (
    <section className="mt-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Quick Access</h2>
        <p className="mt-1 text-sm text-slate-500">
          Jump straight into the operational modules your team uses every day.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {QUICK_LINKS.map(({ key, label, description, icon: Icon, path, tourTarget, meaning }) => {
          const tone = HMS_MEANING[meaning];
          return (
            <Link
              key={key}
              data-tour={tourTarget}
              href={`/hms/${slug}/${path}`}
              className={`group rounded-2xl border border-slate-200 bg-white px-5 py-5 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/60 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${tone.hoverBorder}`}
            >
              <div className="flex items-start justify-between gap-4">
                <span aria-hidden className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone.tint} ${tone.icon}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 transition-colors group-hover:text-slate-800">
                  Open
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{label}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
