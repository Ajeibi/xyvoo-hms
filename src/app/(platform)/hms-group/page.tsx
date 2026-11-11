import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Network } from "lucide-react";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { listUserPlaces } from "@/lib/hms/groups/group-access";
import { GROUP_ROLE_LABELS } from "@/lib/hms/groups/group-types";
import { getSessionUser } from "@/lib/supabase/auth-server";

export const metadata = { title: "Choose where to go | XYVOO HMS" };

/** For logins that work at more than one hotel, or run a group: pick where to go. */
export default async function ChoosePlacePage() {
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?from=${encodeURIComponent("/hms-group")}`);
  const places = await listUserPlaces(user.id);
  const hotels = places.filter((p) => p.kind === "hotel");
  const groups = places.filter((p) => p.kind === "group" && p.hotelCount > 1);
  if (hotels.length === 1 && groups.length === 0) redirect(`/hms/${hotels[0].slug}/dashboard`);

  return (
    <div className="min-h-screen bg-slate-50">
      <HmsPage>
        <HmsPageHeader title="Where would you like to go?" description="Your login works at more than one place." />
        {groups.length ? (
          <section aria-labelledby="groups-title" className="space-y-3">
            <h2 id="groups-title" className="font-heading text-lg font-semibold text-slate-900">
              Hotel groups
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {groups.map((g) =>
                g.kind === "group" ? (
                  <li key={g.groupId}>
                    <Link href={`/hms-group/${g.slug}/dashboard`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300">
                      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <Network className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold text-slate-900">{g.name}</span>
                        <span className="block text-sm text-slate-600">
                          {g.hotelCount} hotels · {GROUP_ROLE_LABELS[g.role]}
                        </span>
                      </span>
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="hotels-title" className="space-y-3">
          <h2 id="hotels-title" className="font-heading text-lg font-semibold text-slate-900">
            Hotels
          </h2>
          {hotels.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {hotels.map((h) => (
                <li key={h.slug}>
                  <Link href={`/hms/${h.slug}/dashboard`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300">
                    <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="font-semibold text-slate-900">{h.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Your login isn&apos;t a member of any hotel. A group role shows the group screens only.</p>
          )}
        </section>
      </HmsPage>
    </div>
  );
}
