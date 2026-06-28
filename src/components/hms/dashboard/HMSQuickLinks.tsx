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

const QUICK_LINKS = [
  {
    key: "frontdesk",
    label: "Front Desk",
    description: "Check-ins, walk-ins, and room movement",
    icon: Building2,
    tourTarget: "card-frontdesk",
    path: "frontdesk",
  },
  {
    key: "reservations",
    label: "Reservations",
    description: "Manage upcoming and current bookings",
    icon: ClipboardList,
    tourTarget: "card-reservations",
    path: "reservations",
  },
  {
    key: "accounts",
    label: "Accounts",
    description: "Billing, revenue controls, and postings",
    icon: Landmark,
    tourTarget: "card-accounts",
    path: "accounts",
  },
  {
    key: "restaurant-bar",
    label: "Food & Beverage",
    description: "Restaurant, bar, room service, and outlet posting",
    icon: UtensilsCrossed,
    tourTarget: "card-restaurant-bar",
    path: "restaurant-bar",
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Stock stores, suppliers, and controls",
    icon: Package,
    tourTarget: "card-inventory",
    path: "inventory",
  },
  {
    key: "housekeeping",
    label: "Housekeeping",
    description: "Cleaning flow and attendant assignments",
    icon: Sparkles,
    tourTarget: "card-housekeeping",
    path: "housekeeping",
  },
  {
    key: "settings",
    label: "Settings",
    description: "Roles, policies, integrations, and go-live",
    icon: Settings,
    tourTarget: "card-settings",
    path: "settings",
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
        {QUICK_LINKS.map(({ key, label, description, icon: Icon, path, tourTarget }) => (
          <Link
            key={key}
            data-tour={tourTarget}
            href={`/hms/${slug}/${path}`}
            className="group rounded-2xl border border-slate-200 bg-white px-5 py-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm hover:shadow-slate-200/60"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Open
              </span>
            </div>
            <h3 className="mt-5 text-base font-semibold text-slate-900">{label}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
