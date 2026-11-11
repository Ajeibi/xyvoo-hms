import Link from "next/link";
import { Network } from "lucide-react";
import { HmsCard, hmsButton } from "@/components/hms/hms-ui";
import { getHotelGroupInfo } from "@/lib/hms/groups/group-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaveGroupButton } from "./LeaveGroupButton";

/** Settings > General: the group this hotel is in, a way into it, and leaving it. */
export async function HotelGroupCard({ slug, tenantId, userId, isOwner }: { slug: string; tenantId: string; userId: string | null; isOwner: boolean }) {
  const info = await getHotelGroupInfo(tenantId).catch(() => null);
  if (!info) return null;
  const { data: role } = userId
    ? await createServerSupabaseClient().schema("hotel").from("hotel_group_members").select("role").eq("group_id", info.group.id).eq("user_id", userId).maybeSingle()
    : { data: null };
  const alone = info.hotelCount <= 1;
  return (
    <div id="hotel-group" className="scroll-mt-24">
      <HmsCard
        title="Hotel group"
        icon={Network}
        description={
          alone
            ? "This hotel is on its own. Own or run more than one hotel? Invite the others to see them side by side, with group reports and consolidated accounts."
            : `This hotel is in ${info.group.name}, with ${info.hotelCount - 1} other ${info.hotelCount - 1 === 1 ? "hotel" : "hotels"}.`
        }
        actions={
          role ? (
            <Link href={`/hms-group/${info.group.slug}/${alone ? "settings" : "dashboard"}`} className={hmsButton.secondary}>
              {alone ? "Invite a hotel" : "Open the group"}
            </Link>
          ) : undefined
        }
      >
        {!alone ? (
          <p className="text-sm text-slate-600">
            The group&apos;s managers see this hotel&apos;s figures, reports and accounts. Other hotels in the group see guest profiles, loyalty or rates only if the group owner shares them, and only to read.
          </p>
        ) : null}
        {!alone && isOwner ? <LeaveGroupButton slug={slug} groupName={info.group.name} /> : null}
      </HmsCard>
    </div>
  );
}
