import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { GroupSettingsClient } from "@/components/hms/groups/GroupSettingsClient";
import { listGroupAudit, listGroupInvites, listGroupMembers } from "@/lib/hms/groups/group-admin";
import { requireGroupPage } from "@/lib/hms/groups/group-page";

export const metadata = { title: "Settings" };

export default async function GroupSettingsPage({ params }: { params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug);
  const [invites, members, audit] = await Promise.all([ctx.isOwner ? listGroupInvites(ctx) : Promise.resolve([]), listGroupMembers(ctx), listGroupAudit(ctx)]);
  return (
    <HmsPage>
      <HmsPageHeader eyebrow="Hotel group" title="Group settings" description="The hotels in the group, who runs it, and what the hotels share with each other." />
      <GroupSettingsClient
        groupSlug={ctx.group.slug}
        groupName={ctx.group.name}
        isOwner={ctx.isOwner}
        currentUserId={ctx.userId}
        hotels={ctx.hotels}
        invites={invites}
        members={members}
        sharing={ctx.sharing}
        audit={audit}
      />
    </HmsPage>
  );
}
