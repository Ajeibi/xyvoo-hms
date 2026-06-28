import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { getHmsAccessContext, hasSectionAccess } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import HMSLayoutShell from "@/components/hms/HMSLayoutShell";

export default async function HMSLayout({
  children,
  slug,
  requiredSection,
}: {
  children: React.ReactNode;
  slug: string;
  requiredSection?: HmsSectionKey;
}) {
  const access = await getHmsAccessContext(slug);

  if (!access.userId) {
    redirect(access.homePath);
  }

  if (requiredSection && !hasSectionAccess(access, requiredSection)) {
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
