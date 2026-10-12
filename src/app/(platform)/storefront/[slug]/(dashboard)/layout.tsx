import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import StorefrontDashboardShell from "@/components/storefront/StorefrontDashboardShell";
import { canUseStoreSection, getStoreAccessContext, getStoreCapabilities, STORE_SECTIONS } from "@/lib/store/access";
import { getOnboardingProgress, getStoreSite } from "@/lib/store/site/data";

// A rounder, friendlier face for dashboard headings; body text stays in Inter.
const headingFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-dash-heading", display: "swap" });

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  const storeName = access.storeDisplayName || "Storefront";
  return {
    title: {
      default: `${storeName} · Dashboard | XYVOO`,
      template: `%s · ${storeName} | XYVOO`,
    },
  };
}

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

  const [progress, site] = await Promise.all([getOnboardingProgress(access.tenantId), getStoreSite(access.tenantId)]);
  // Only people who can run setup are sent to it; staff would otherwise bounce between the two.
  if (progress && !progress.completedAt && getStoreCapabilities(access.role).canManageSettings) {
    redirect(`/storefront/${slug}/welcome/${progress.currentStep}`);
  }
  const role = access.role;

  return (
    <StorefrontDashboardShell
      slug={slug}
      fontClassName={headingFont.variable}
      storeDisplayName={access.storeDisplayName}
      logoUrl={access.logoUrl}
      currentUserName={access.currentUserName}
      roleLabel={ROLE_LABELS[access.role] || "Member"}
      canOpenShop={getStoreCapabilities(access.role).canManageSettings}
      allowedSections={STORE_SECTIONS.filter((section) => canUseStoreSection(role, section))}
      // Live means published and switched on, the same test the shop itself uses.
      shopStatus={site?.status === "live" && site.published != null ? "live" : site?.status === "paused" ? "paused" : "draft"}
    >
      {children}
    </StorefrontDashboardShell>
  );
}
