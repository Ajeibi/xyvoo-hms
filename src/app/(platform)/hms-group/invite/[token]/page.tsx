import Link from "next/link";
import { redirect } from "next/navigation";
import { HmsCard, HmsPage, HmsPageHeader, HmsWarning } from "@/components/hms/hms-ui";
import { AcceptGroupInvite } from "@/components/hms/groups/AcceptGroupInvite";
import { describeInvite } from "@/lib/hms/groups/group-admin";
import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = { title: "Hotel group invitation | XYVOO HMS" };

/** An invitation for a hotel to join a group. Only that hotel's owner can accept. */
export default async function GroupInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?from=${encodeURIComponent(`/hms-group/invite/${token}`)}`);
  const service = createServerSupabaseClient();
  const invite = await describeInvite(service, token);
  const { data: membership } = invite
    ? await service.schema("hotel").from("memberships").select("role").eq("tenant_id", invite.tenantId).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const isOwner = membership?.role === "owner";

  return (
    <div className="min-h-screen bg-slate-50">
      <HmsPage>
        <HmsPageHeader eyebrow="Hotel group" title={invite ? `Join ${invite.groupName}?` : "Invitation not found"} />
        {!invite ? (
          <HmsWarning>This link isn&apos;t valid. Ask the group owner for a new invitation.</HmsWarning>
        ) : invite.state !== "open" ? (
          <HmsWarning>
            This invitation {invite.state === "accepted" ? "has already been used" : invite.state === "cancelled" ? "was cancelled" : "has expired"}. Ask the group owner for a new one if you still want to join.
          </HmsWarning>
        ) : !isOwner ? (
          <HmsWarning title="Only the hotel's owner can accept">
            This invitation is for {invite.hotelName}. Sign in with the login that owns {invite.hotelName} to accept it.
          </HmsWarning>
        ) : (
          <HmsCard title={`${invite.groupName} has invited ${invite.hotelName}`} description={`The group has ${invite.groupHotelCount} ${invite.groupHotelCount === 1 ? "hotel" : "hotels"} now.`}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>The group&apos;s managers will see {invite.hotelName}&apos;s figures on the group dashboard, reports and consolidated accounts. They can&apos;t change anything in your hotel.</li>
              <li>Other hotels in the group see nothing of yours unless the group owner switches on sharing of guest profiles, loyalty or rates, and then only to read.</li>
              <li>Your staff, logins, rooms, bills and books stay exactly as they are.</li>
              <li>You can leave at any time from your hotel&apos;s Settings, Hotel group.</li>
            </ul>
            {invite.note ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Note from the group: {invite.note}</p> : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <AcceptGroupInvite token={token} hotelSlug={invite.hotelSlug} />
              <Link href={`/hms/${invite.hotelSlug}/dashboard`} className="inline-flex items-center px-3 text-sm font-medium text-slate-700 underline">
                Not now
              </Link>
            </div>
          </HmsCard>
        )}
      </HmsPage>
    </div>
  );
}
