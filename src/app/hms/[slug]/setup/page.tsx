import Link from "next/link";
import {
  BedDouble,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Soup,
  Sparkles,
  Wallet,
} from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function SetupWizardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const setupGroups = [
    {
      title: "Core Admin Setup",
      description: "Hotel-wide configuration the owner or admin should complete first from the central Settings area.",
      icon: Building2,
      items: [
        {
          title: "Property profile and branding",
          description: "Set the hotel name, logo, and other identity details used across the HMS.",
          href: `/hms/${slug}/settings#hotel-branding-setup`,
          owner: "Owner/Admin",
        },
        {
          title: "Floors and room counts",
          description: "Map how many rooms sit on each floor so the property layout matches operations.",
          href: `/hms/${slug}/settings#floor-plan-setup`,
          owner: "Owner/Admin",
        },
        {
          title: "Room inventory and price setup",
          description: "Define room types, room counts, sell rates, and hotel-wide pricing rules in one place.",
          href: `/hms/${slug}/settings#rooms-pricing-setup`,
          owner: "Owner/Admin",
        },
        {
          title: "Staff access and department logins",
          description: "Create logins and permissions for operational teams before they start working in the system.",
          href: `/hms/${slug}/settings#department-access-setup`,
          owner: "Owner/Admin",
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
      description: "After Super Admin setup is complete, use these modules for day-to-day room and booking operations.",
      icon: BedDouble,
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
      items: [
        {
          title: "Rate plans, taxes, and posting rules",
          description: "Review billing setup, invoice/tax rules, and accounting configuration for daily operations.",
          href: `/hms/${slug}/accounts`,
          owner: "Owner/Admin",
        },
        {
          title: "Payment gateway and cashier checks",
          description: "Confirm payment methods, settlement handling, and cashier workflows are ready.",
          href: `/hms/${slug}/accounts`,
          owner: "Owner/Admin",
        },
      ],
    },
    {
      title: "Food & Beverage",
      description: "Only needed if the property will run restaurant, bar, room-service, or kitchen operations in-house.",
      icon: Soup,
      items: [
        {
          title: "Outlet, menu, and kitchen setup",
          description: "Configure restaurant/bar outlets, menu categories and items, kitchen flow, and charge-to-room behavior.",
          href: `/hms/${slug}/settings#menu-setup`,
          owner: "Owner/Admin",
        },
      ],
    },
    {
      title: "Inventory & Procurement",
      description: "Track stock, suppliers, and departmental issue/return controls.",
      icon: ClipboardList,
      items: [
        {
          title: "Inventory controls and store setup",
          description: "Review stock locations, suppliers, reorder levels, and issue/return workflows.",
          href: `/hms/${slug}/inventory`,
          owner: "Owner/Admin",
        },
      ],
    },
    {
      title: "Go-Live Review",
      description: "Use the dashboard and final checks to confirm the property is ready for real operations.",
      icon: ClipboardCheck,
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

  return (
    <HMSLayout slug={slug} requiredSection="setup">
      <div className="mx-auto w-full max-w-[1500px] px-6 py-8 sm:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Setup Wizard</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Complete central Super Admin setup first, then use the department modules for
          operational review before going live.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {setupGroups.map((group) => {
            const Icon = group.icon;

            return (
              <section
                key={group.title}
                className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{group.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{group.description}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {group.items.map((item, idx) => (
                    <div
                      key={`${group.title}-${item.title}`}
                      className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {idx + 1}. {item.title}
                          </p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {item.owner}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                        <div className="mt-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Pending
                        </div>
                      </div>
                      <Link
                        href={item.href}
                        className="shrink-0 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
                        Open
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </HMSLayout>
  );
}
