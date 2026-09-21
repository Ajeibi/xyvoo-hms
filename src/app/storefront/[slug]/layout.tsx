import { redirect } from "next/navigation";
import { getStoreAccessContext } from "@/lib/store/access";
import StorefrontDashboardShell from "@/components/storefront/StorefrontDashboardShell";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

export default async function StorefrontSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);

  if (!access.userId || !access.tenantId || !access.role) {
    redirect(access.homePath);
  }

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
