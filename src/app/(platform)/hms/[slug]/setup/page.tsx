import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  Eye,
  Soup,
  Sparkles,
  Wallet,
} from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import type { HmsMeaning } from "@/components/hms/meaning";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSetupProgress, type SetupProgressKey } from "@/lib/hms/setup-progress";

export default async function SetupWizardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const progress = tenant
    ? await getSetupProgress(createServerSupabaseClient(), tenant.id, tenant)
    : null;

  const setupGroups: {
    title: string;
    description: string;
    icon: typeof Building2;
    meaning: HmsMeaning;
    items: { title: string; description: string; href: string; owner: string; checkKey?: SetupProgressKey }[];
  }[] = [
    {
      title: "Core Admin Setup",
      description: "Hotel-wide configuration the owner or admin should complete first from the central Settings area.",
      icon: Building2,
      meaning: "neutral",
      items: [
        {
          title: "Property profile and branding",
          description: "Set the hotel name, logo, and other identity details used across the HMS.",
          href: `/hms/${slug}/settings#hotel-branding-setup`,
          owner: "Owner/Admin",
          checkKey: "branding" as const,
        },
        {
          title: "Floors and room counts",
          description: "Map how many rooms sit on each floor so the property layout matches operations.",
          href: `/hms/${slug}/settings#floor-plan-setup`,
          owner: "Owner/Admin",
          checkKey: "floor_plan" as const,
        },
        {
          title: "Room inventory and price setup",
          description: "Define room types, room counts, sell rates, and hotel-wide pricing rules in one place.",
          href: `/hms/${slug}/settings#rooms-pricing-setup`,
          owner: "Owner/Admin",
          checkKey: "room_pricing" as const,
        },
        {
          title: "Staff access and department logins",
          description: "Create logins and permissions for operational teams before they start working in the system.",
          href: `/hms/${slug}/settings#department-access-setup`,
          owner: "Owner/Admin",
          checkKey: "staff_access" as const,
        },
        {
          title: "Notifications and operational preferences",
          description: "Review notification templates and the global settings that affect every department.",
          href: `/hms/${slug}/settings`,
          owner: "Owner/Admin",
        },
      ],
    },
    {
      title: "Rooms & Reservations",
      description: "Once the core setup is done, these are the pages your team will use every day for rooms and bookings.",
      icon: BedDouble,
      meaning: "rooms",
      items: [
        {
          title: "Live room status board",
          description:
            "Open the operational rooms view — same board reception uses for availability, housekeeping, and in-house stays.",
          href: `/hms/${slug}/rooms`,
          owner: "Owner/Admin",
        },
        {
          title: "Front desk arrival and check-in flow",
          description: "Confirm your team is ready for arrivals, departures, room movement, and daily queue handling.",
          href: `/hms/${slug}/frontdesk`,
          owner: "Owner/Admin",
        },
        {
          title: "Reservation workflow checks",
          description: "Validate reservation capture, booking updates, and new reservation flow.",
          href: `/hms/${slug}/reservations`,
          owner: "Owner/Admin",
        },
      ],
    },
    {
      title: "Housekeeping",
      description: "Configure how room cleaning and status movement should work day to day.",
      icon: Sparkles,
      meaning: "care",
      items: [
        {
          title: "Room status workflow",
          description: "Set up housekeeping statuses, turnaround priorities, and attendant assignment rules.",
          href: `/hms/${slug}/housekeeping`,
          owner: "Owner/Admin",
        },
      ],
    },
    {
      title: "Accounts & Finance",
      description: "Define billing rules, taxes, and financial controls before go-live.",
      icon: Wallet,
      meaning: "money",
      items: [
        {
          title: "Rate plans, taxes, and posting rules",
          description: "Review billing setup, invoice/tax rules, and accounting configuration for daily operations.",
          href: `/hms/${slug}/accounts`,
          owner: "Owner/Admin",
          checkKey: "chart_of_accounts" as const,
        },
        {
          title: "Cash drawer and cashier checks",
          description: "Payments are taken at the desk in cash or on your card machine, then recorded here. Set the manager PIN that approves voids, discounts and overrides.",
          href: `/hms/${slug}/reservations/settings#manager-pin`,
          owner: "Owner/Admin",
          checkKey: "cashier_controls" as const,
        },
      ],
    },
    {
      title: "Food & Beverage",
      description: "Only needed if the property will run restaurant, bar, room-service, or kitchen operations in-house.",
      icon: Soup,
      meaning: "food",
      items: [
        {
          title: "Outlet, menu, and kitchen setup",
          description: "Configure restaurant/bar outlets, menu categories and items, kitchen flow, and charge-to-room behaviour.",
          href: `/hms/${slug}/restaurant-bar/settings#menu-setup`,
          owner: "Owner/Admin",
          checkKey: "fb_setup" as const,
        },
      ],
    },
    {
      title: "Inventory & Procurement",
      description: "Track stock, suppliers, and departmental issue/return controls.",
      icon: ClipboardList,
      meaning: "stock",
      items: [
        {
          title: "Inventory controls and store setup",
          description: "Review stock locations, suppliers, reorder levels, and issue/return workflows.",
          href: `/hms/${slug}/inventory`,
          owner: "Owner/Admin",
          checkKey: "inventory_setup" as const,
        },
      ],
    },
    {
      title: "Go-Live Review",
      description: "Use the dashboard and final checks to confirm the property is ready for real operations.",
      icon: ClipboardCheck,
      meaning: "neutral",
      items: [
        {
          title: "Operational dashboard review",
          description: "Return to the dashboard and confirm each department has completed its setup tasks.",
          href: `/hms/${slug}/dashboard`,
          owner: "Owner/Admin",
        },
      ],
    },
  ];

  // Only steps the system can check count towards the progress bar; the rest are reviews.
  const tracked = setupGroups.flatMap((g) => g.items).filter((i) => i.checkKey);
  const doneCount = progress ? tracked.filter((i) => i.checkKey && progress[i.checkKey]).length : 0;
  const percent = tracked.length ? Math.round((doneCount / tracked.length) * 100) : 0;
  const next = progress ? tracked.find((i) => i.checkKey && !progress[i.checkKey]) ?? null : null;

  return (
    <HMSLayout slug={slug} requiredSection="setup">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Getting started"
          title="Setup Wizard"
          description="Finish the core setup in Settings first, then check each department's pages before your hotel goes live."
          actions={
            <Link href={`/hms/${slug}/settings`} className={hmsButton.secondary}>
              Open Settings
            </Link>
          }
        />

        {progress ? (
          <section
            aria-labelledby="setup-progress-title"
            className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
          >
            <div className="bg-gradient-to-br from-blue-50 via-white to-emerald-50/60 p-6">
              <p className="text-sm font-medium text-blue-800">Your progress</p>
              <h2 id="setup-progress-title" className="mt-1 font-heading text-xl font-semibold text-slate-900">
                {next ? "Let's get your hotel ready for its first guest" : "The core setup is done. Time for a final check."}
              </h2>
              <div className="mt-4 flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-label="Setup progress"
                  aria-valuemin={0}
                  aria-valuemax={tracked.length}
                  aria-valuenow={doneCount}
                  aria-valuetext={`${doneCount} of ${tracked.length} steps done`}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
                >
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-700">
                  {doneCount} of {tracked.length} done
                </span>
              </div>
              {next ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-slate-700">
                    Next up: <span className="font-semibold text-slate-900">{next.title}</span>
                  </p>
                  <Link href={next.href} className={hmsButton.primary}>
                    Start this step
                    <ArrowRight className="h-4 w-4" aria-hidden />
                    <span className="sr-only">: {next.title}</span>
                  </Link>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {setupGroups.map((group, groupIndex) => (
            <HmsCard
              key={group.title}
              id={`setup-group-${groupIndex}`}
              title={group.title}
              description={group.description}
              icon={group.icon}
              meaning={group.meaning}
              className="h-full"
            >
              <ol className="space-y-3">
                {group.items.map((item, idx) => {
                  const isDone = item.checkKey && progress ? progress[item.checkKey] : null;
                  const isNext = next?.title === item.title;
                  return (
                    <li
                      key={`${group.title}-${item.title}`}
                      className={`flex items-start gap-3 rounded-xl border p-4 ${
                        isNext ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-slate-50/60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          isDone
                            ? "bg-emerald-100 text-emerald-700"
                            : isNext
                              ? "bg-xyvoo-blue text-white"
                              : "border border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {isDone === null ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                              Review when ready
                            </span>
                          ) : isDone ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Done
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                              <CircleDashed className="h-3.5 w-3.5" aria-hidden />
                              To do
                            </span>
                          )}
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                            {item.owner}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={item.href}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        Open
                        <span className="sr-only">: {item.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </HmsCard>
          ))}
        </div>
      </HmsPage>
    </HMSLayout>
  );
}
