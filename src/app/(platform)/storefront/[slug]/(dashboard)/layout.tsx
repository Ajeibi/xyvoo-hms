import { redirect } from "next/navigation";
import StorefrontDashboardShell from "@/components/storefront/StorefrontDashboardShell";
import { getStoreAccessContext } from "@/lib/store/access";
import { getOnboardingProgress } from "@/lib/store/site/data";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

/** Dashboard pages, with the sidebar. Stores that haven't finished setup are sent to the wizard first. */
export default async function StorefrontDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  if (!access.userId || !access.tenantId || !access.role) redirect(access.homePath);

  const progress = await getOnboardingProgress(access.tenantId);
  if (progress && !progress.completedAt) redirect(`/storefront/${slug}/welcome/${progress.currentStep}`);

  return (
    <StorefrontDashboardShell
      slug={slug}
      storeDisplayName={access.storeDisplayName}
      logoUrl={access.logoUrl}
      currentUserName={access.currentUserName}
      roleLabel={ROLE_LABELS[access.role] || "Member"}
    >
      {children}
    </StorefrontDashboardShell>
  );
}
