import type { Metadata } from "next";
import TeamManager from "@/components/storefront/TeamManager";
import UpgradePrompt from "@/components/storefront/UpgradePrompt";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { requireStoreSection } from "@/lib/store/access";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";

export const metadata: Metadata = { title: "Team" };

export default async function StorefrontTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "team");
  const canInvite = storeHasFeature(await getStorePlan(access.tenantId), "staff");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Team" description="The people who help run your shop, and what each of them can do." />

      <DashSectionIntro
        id="team"
        meaning="neutral"
        art="people"
        title="Collaborate with your team"
        points={[
          "Invite team members with role-based access: Staff handle orders & products, while Admins can manage settings & payouts.",
          "Every staff member logs in securely with their own email address.",
          "All team actions are logged automatically in your Activity audit trail.",
        ]}
      />

      {canInvite ? null : (
        <UpgradePrompt
          slug={slug}
          title="Invite people to help run your shop"
          description="On the Standard plan you can add staff and admins with their own sign-in, choose what each of them can see, and see who changed what in the activity log."
        />
      )}
      <TeamManager slug={slug} />
    </div>
  );
}
