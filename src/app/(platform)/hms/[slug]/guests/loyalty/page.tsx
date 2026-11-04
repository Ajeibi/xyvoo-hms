import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestLoyaltyClient } from "@/components/hms/guests/GuestLoyaltyClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { getLoyaltyOverview, getLoyaltySettings, syncLoyaltyEarnings } from "@/lib/hms/guest-loyalty";

export const metadata: Metadata = { title: "Guest loyalty" };

export default async function GuestLoyaltyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const service = createServerSupabaseClient();
  const settings = await getLoyaltySettings(service, ctx.tenant.id);
  // Catch up on any stay that finished since the last nightly run, so the numbers here are current.
  if (settings.enabled) await syncLoyaltyEarnings(service, ctx.tenant.id, settings).catch(() => undefined);
  const overview = await getLoyaltyOverview(service, ctx.tenant.id, settings);

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestLoyaltyClient slug={slug} settings={settings} overview={overview} canManage={ctx.canManage} currency={ctx.currency} />
    </HMSLayout>
  );
}
