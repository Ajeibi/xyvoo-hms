import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import ChannelsClient from "@/components/hms/channels/ChannelsClient";
import { HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getProvider } from "@/lib/hms/channels/adapters";
import { loadChannelStatus } from "@/lib/hms/channels/status";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Booking sites" };

export default async function ChannelsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const back = (
    <Link href={`/hms/${slug}/reservations`} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to reservations
    </Link>
  );
  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="reservations">
        <HmsPage>
          {back}
          <HmsEmptyState art="page" meaning="rooms" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const db = createServerSupabaseClient();
  const [status, plans] = await Promise.all([
    loadChannelStatus(db, tenant.id),
    db.schema("hotel").from("rate_plans").select("code,name,active,channels").eq("tenant_id", tenant.id).eq("active", true).order("sort_order"),
  ]);
  const roomTypes = normalizeRoomTypes(tenant.room_types).map((t) => ({ id: t.id, name: t.name }));
  const planList = (plans.data ?? []).length
    ? (plans.data ?? []).map((p) => ({ code: p.code as string, name: p.name as string, onSites: !Array.isArray(p.channels) || (p.channels as string[]).length === 0 || (p.channels as string[]).includes("partner") }))
    : [{ code: "BAR", name: "Room only", onSites: true }];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage>
        {back}
        <HmsPageHeader
          eyebrow="Reservations"
          meaning="rooms"
          title="Booking sites"
          description="Sell your rooms on Booking.com, Expedia and other sites through one connection. Your rooms-left, prices and rules go out; their bookings, changes and cancellations come in as normal reservations."
        />
        <ChannelsClient
          slug={slug}
          status={status}
          roomTypes={roomTypes}
          plans={planList}
          currency={normalizePricingSetup(tenant.pricing_setup).currency}
          keyReady={getProvider().isConfigured()}
          webhookUrl={appUrl ? `${appUrl}/api/channels/webhook` : "/api/channels/webhook"}
        />
      </HmsPage>
    </HMSLayout>
  );
}
