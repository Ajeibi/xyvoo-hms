import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import HMSLayoutShell from "@/components/hms/HMSLayoutShell";
import { CardBlockSkeleton, PageHeaderSkeleton } from "@/components/hms/PageSkeletons";

/**
 * Persistent HMS shell layout for all /hms/[slug]/* routes.
 *
 * By placing the shell here (as a Next.js route layout), it is mounted ONCE
 * and stays mounted during client-side navigation between pages inside the
 * same [slug] segment. This prevents the header/sidebar from flashing away
 * on every navigation.
 *
 * The Suspense boundary wraps only {children} (the page slot), not
 * HMSLayoutShell. Wrapping the shell itself would make it re-suspend (and
 * remount, losing sidebar/scroll state) whenever a slow page navigates in —
 * which is what caused the header/sidebar to intermittently blank out until
 * a manual refresh. Scoping Suspense to the page slot keeps the shell
 * mounted and only shows a fallback for the content area while a slow page
 * loads.
 *
 * Individual pages still use HMSLayout (the section-guard component) which
 * only enforces auth + section access and renders {children} — it no longer
 * renders the shell itself.
 */
export default async function HmsSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getHmsAccessContext(slug);

  if (!access.userId) {
    redirect(access.homePath);
  }

  const tenant = await getHotelTenantBySlug(slug);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;

  return (
    <HMSLayoutShell
      slug={slug}
      currency={currency}
      hotelDisplayName={access.hotelDisplayName}
      logoUrl={access.logoUrl}
      currentUserName={access.currentUserName}
      roleLabel={access.roleLabel}
      homePath={access.homePath}
      settingsPath={access.settingsPath}
      canAccessAllDepartments={access.canAccessAllDepartments}
      navItems={access.navItems}
    >
      <Suspense
        fallback={
          <div className="px-8 py-8">
            <PageHeaderSkeleton />
            <div className="mt-6 space-y-4">
              <CardBlockSkeleton lines={4} />
              <CardBlockSkeleton lines={4} />
            </div>
          </div>
        }
      >
        {children}
      </Suspense>
    </HMSLayoutShell>
  );
}
