import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { listUserPlaces } from "@/lib/hms/groups/group-access";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import HMSLayoutShell from "@/components/hms/HMSLayoutShell";
import type { LockPerson } from "@/components/hms/LockScreen";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listSwitchablePeople } from "@/lib/hms/session-switch";
import { CardBlockSkeleton, PageHeaderSkeleton } from "@/components/hms/PageSkeletons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const access = await getHmsAccessContext(slug);
  const name = access.hotelDisplayName || "Hotel Management";
  return {
    title: {
      default: `${name} · Dashboard | XYVOO HMS`,
      template: `%s · ${name} | XYVOO HMS`,
    },
  };
}

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
  // A suspended login is shut out at once; a new one must replace its temporary password first.
  if (access.status === "suspended") {
    redirect("/auth/login?notice=suspended");
  }
  if (access.mustChangePassword) {
    redirect(`/auth/change-password?from=${encodeURIComponent(`/hms/${slug}`)}`);
  }

  const [tenant, places] = await Promise.all([
    getHotelTenantBySlug(slug),
    // The hotel switcher; a failure here must never stop the hotel's own pages.
    listUserPlaces(access.userId).catch(() => []),
  ]);
  const currency = normalizePricingSetup(tenant?.pricing_setup).currency;

  // Shared-screen lock: who can take the keys, and how long before the screen locks itself.
  // Any failure (migration not run yet) just leaves the lock off.
  let lockPeople: LockPerson[] = [];
  let idleLockMinutes = 0;
  if (tenant) {
    const sessionUserId = access.sessionUserId ?? access.userId;
    try {
      const service = createServerSupabaseClient();
      const [people, settings] = await Promise.all([
        listSwitchablePeople(service, tenant.id, sessionUserId),
        service
          .schema("hotel")
          .from("security_settings")
          .select("idle_lock_enabled, idle_lock_minutes")
          .eq("tenant_id", tenant.id)
          .maybeSingle(),
      ]);
      lockPeople = people;
      const enabled = settings.error ? true : (settings.data?.idle_lock_enabled ?? true);
      const minutes = settings.error ? 5 : (settings.data?.idle_lock_minutes ?? 5);
      // Only lock when someone has a PIN to unlock with; otherwise nobody could get back in.
      const canUnlock = people.some((p) => p.hasPin && !p.pinLocked);
      idleLockMinutes = enabled && canUnlock ? Number(minutes) : 0;
    } catch {
      lockPeople = [];
    }
  }

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
      places={places}
      locked={Boolean(access.locked)}
      lockPeople={lockPeople}
      idleLockMinutes={idleLockMinutes}
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
