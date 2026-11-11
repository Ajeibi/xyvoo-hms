import Link from "next/link";
import { HmsAlert, HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { GroupGuestsClient } from "@/components/hms/groups/GroupGuestsClient";
import { loadGroupGuestDirectory, loadGuestSuggestions, type GroupGuestProfileView, type GuestSuggestionView } from "@/lib/hms/groups/group-guests";
import { requireGroupPage } from "@/lib/hms/groups/group-page";
import { Users } from "lucide-react";

export const metadata = { title: "Guests" };

export default async function GroupGuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug, ["group_owner", "group_admin"]);
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q : "";

  if (!ctx.sharing.shareGuests) {
    return (
      <HmsPage>
        <HmsPageHeader eyebrow="Hotel group" meaning="guests" title="Guests across the group" />
        <HmsEmptyState
          icon={Users}
          title="Guest profiles aren't shared"
          description="When the group owner switches on guest profiles, guests who stay at more than one of your hotels are linked, and each hotel sees their stays elsewhere."
          action={
            ctx.isOwner ? (
              <Link href={`/hms-group/${groupSlug}/settings#sharing`} className={hmsButton.primary}>
                Go to sharing
              </Link>
            ) : undefined
          }
        />
      </HmsPage>
    );
  }

  let error = "";
  let profiles: GroupGuestProfileView[] = [];
  let suggestions: GuestSuggestionView[] = [];
  try {
    [profiles, suggestions] = await Promise.all([loadGroupGuestDirectory(ctx, q), loadGuestSuggestions(ctx)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load guests.";
  }

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Hotel group" meaning="guests" title="Guests across the group" description="Guests known at more than one of your hotels. Each hotel keeps its own records; this links them." />
      <HmsAlert message={error} />
      <GroupGuestsClient groupSlug={groupSlug} profiles={profiles} suggestions={suggestions} search={q} currency={ctx.group.baseCurrency} />
    </HmsPage>
  );
}
