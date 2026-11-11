import { Network } from "lucide-react";
import { HmsCard, HmsPill } from "@/components/hms/hms-ui";
import { getHotelGroupInfo, loadGroupSharing } from "@/lib/hms/groups/group-access";
import { loadKnownInGroup } from "@/lib/hms/groups/group-guests";
import { groupPointsFor } from "@/lib/hms/groups/group-loyalty";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { GuestGroupOptOut } from "./GuestGroupOptOut";

/**
 * On a hotel's guest page: the same guest's stays at the group's other hotels. Read with the signed-in
 * user's own token, so the database shows nothing unless the group shares guest profiles. Shows
 * nothing at all for a hotel on its own.
 */
export async function KnownInGroupPanel({ slug, tenantId, guestId, currency, canEdit }: { slug: string; tenantId: string; guestId: string; currency: string; canEdit: boolean }) {
  const info = await getHotelGroupInfo(tenantId).catch(() => null);
  if (!info || info.hotelCount < 2) return null;
  const sharing = await loadGroupSharing(createServerSupabaseClient(), info.group.id);
  if (!sharing.shareGuests) return null;

  const userDb = await createSupabaseAuthServerClient();
  const [known, points] = await Promise.all([
    loadKnownInGroup(userDb, tenantId, guestId).catch(() => ({ profile: null, optedOut: false, linkedHere: false })),
    sharing.shareLoyalty ? groupPointsFor(userDb, tenantId, guestId) : Promise.resolve(null),
  ]);
  const elsewhere = points ? points.byHotel.filter((b) => b.tenantId !== tenantId).reduce((s, b) => s + b.points, 0) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-8 sm:px-6 lg:px-8">
      <HmsCard id="known-in-group" title={`Known in ${info.group.name}`} icon={Network} meaning="guests" description="This guest's stays at your group's other hotels. IDs, contact details, notes and bills stay with each hotel.">
        {known.optedOut ? (
          <p className="text-sm text-slate-600">This guest is kept out of the group, so other hotels don&apos;t see them and they aren&apos;t matched.</p>
        ) : known.profile ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-800">
              {known.profile.totalStays} {known.profile.totalStays === 1 ? "stay" : "stays"} and {known.profile.totalNights} nights elsewhere in the group
              {known.profile.lastStayAt ? `, last on ${new Date(known.profile.lastStayAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}` : ""}.
              {known.profile.vip ? (
                <>
                  {" "}
                  <HmsPill tone="amber">VIP at another hotel</HmsPill>
                </>
              ) : null}
            </p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {known.profile.links.map((l) => (
                <li key={l.linkId} className="px-3 py-2">
                  <span className="font-medium text-slate-900">{l.hotelName}</span>: {l.stays} stays, {l.nights} nights, {formatPricingAmount(l.spend, currency)} spent
                  {l.preferences ? <span className="block text-slate-600">Prefers: {l.preferences}</span> : null}
                  {l.accessibility.length ? <span className="block text-slate-600">Access needs: {l.accessibility.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
            {points && elsewhere !== 0 ? (
              <p className="text-slate-800">
                Points across the group: <span className="font-semibold">{points.total.toLocaleString("en-NG")}</span> ({elsewhere.toLocaleString("en-NG")} earned at the other hotels).
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Not known at your other hotels yet. Guests are matched by email every night.</p>
        )}
        {canEdit ? <GuestGroupOptOut slug={slug} guestId={guestId} optedOut={known.optedOut} /> : null}
      </HmsCard>
    </div>
  );
}
