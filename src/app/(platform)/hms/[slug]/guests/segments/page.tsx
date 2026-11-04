import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestSegmentsClient } from "@/components/hms/guests/GuestSegmentsClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { loadSegmentPool, summariseSegments } from "@/lib/hms/guest-segments";
import { getLoyaltySettings } from "@/lib/hms/guest-loyalty";
import { countEmailable, listCampaigns } from "@/lib/hms/guest-campaigns";

export const metadata: Metadata = { title: "Guest segments" };

export default async function GuestSegmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const service = createServerSupabaseClient();
  const pool = await loadSegmentPool(service, ctx.tenant.id);
  const [summary, loyalty, campaigns] = await Promise.all([
    summariseSegments(service, ctx.tenant.id, pool),
    getLoyaltySettings(service, ctx.tenant.id),
    ctx.canManage ? listCampaigns(service, ctx.tenant.id) : Promise.resolve([]),
  ]);
  const emailable = ctx.canManage ? await countEmailable(service, ctx.tenant.id, summary.segments.map((s) => s.key), pool) : {};

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestSegmentsClient
        slug={slug}
        segments={summary.segments}
        totalGuests={summary.total}
        canEdit={ctx.canEdit}
        tierNames={loyalty.enabled ? loyalty.tiers.map((t) => t.name) : []}
        canSend={ctx.canManage}
        sendOptions={summary.segments.map((s) => ({ key: s.key, label: s.label, emailable: emailable[s.key] ?? 0 }))}
        campaigns={campaigns}
      />
    </HMSLayout>
  );
}
