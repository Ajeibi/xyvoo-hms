"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Network } from "lucide-react";
import type { GroupRole, UserPlace } from "@/lib/hms/groups/group-types";
import { GROUP_ROLE_LABELS } from "@/lib/hms/groups/group-types";
import { PlaceSwitcher } from "./PlaceSwitcher";

const NAV: Array<{ key: string; label: string; editorsOnly?: boolean }> = [
  { key: "dashboard", label: "Overview" },
  { key: "reports", label: "Reports" },
  { key: "accounts", label: "Accounts" },
  { key: "guests", label: "Guests", editorsOnly: true },
  { key: "loyalty", label: "Loyalty", editorsOnly: true },
  { key: "rates", label: "Rates" },
  { key: "settings", label: "Settings" },
];

/** The frame around every hotel group page: group name, sections, and the hotel switcher. */
export function GroupShell({
  groupSlug,
  groupName,
  hotelCount,
  role,
  places,
  userName,
  children,
}: {
  groupSlug: string;
  groupName: string;
  hotelCount: number;
  role: GroupRole;
  places: UserPlace[];
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const editor = role === "group_owner" || role === "group_admin";
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-375 flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={`/hms-group/${groupSlug}/dashboard`} className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue-deep text-white">
              <Network className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-base font-bold text-slate-900">{groupName}</span>
              <span className="block text-xs text-slate-600">
                Hotel group · {hotelCount} {hotelCount === 1 ? "hotel" : "hotels"}
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <PlaceSwitcher places={places} current={{ kind: "group", slug: groupSlug }} />
            <span className="hidden text-right text-xs text-slate-600 md:block">
              <span className="block font-medium text-slate-800">{userName}</span>
              {GROUP_ROLE_LABELS[role]}
            </span>
          </div>
        </div>
        <nav aria-label="Hotel group" className="mx-auto max-w-375 overflow-x-auto px-4 sm:px-6 lg:px-8">
          <ul className="flex gap-1">
            {NAV.filter((n) => !n.editorsOnly || editor).map((n) => {
              const href = `/hms-group/${groupSlug}/${n.key}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={n.key}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap ${active ? "border-blue-700 text-blue-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
