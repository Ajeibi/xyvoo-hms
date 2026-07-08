import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import HMSLayoutShell from "@/components/hms/HMSLayoutShell";

/**
 * Persistent HMS shell layout for all /hms/[slug]/* routes.
 *
 * By placing the shell here (as a Next.js route layout), it is mounted ONCE
 * and stays mounted during client-side navigation between pages inside the
 * same [slug] segment. This prevents the header/sidebar from flashing away
 * on every navigation.
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
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <HMSLayoutShell
        slug={slug}
        currency={currency}
        hotelDisplayName={access.hotelDisplayName}
        logoUrl={access.logoUrl}
        currentUserName={access.currentUserName}
        roleLabel={access.roleLabel}
        homePath={access.homePath}
        settingsPath={access.settingsPath}
        navItems={access.navItems}
      >
        {children}
      </HMSLayoutShell>
    </Suspense>
  );
}
