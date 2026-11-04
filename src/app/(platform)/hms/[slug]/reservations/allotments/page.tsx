import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { AllotmentsClient } from "@/components/hms/reservations/AllotmentsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { listAllotments } from "@/lib/hms/reservation-allotments";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Group allotments" };

export default async function AllotmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const today = new Date().toISOString().slice(0, 10);
  const roomTypes = tenant ? normalizeRoomTypes(tenant.room_types) : [];

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage>
        <Link href={`/hms/${slug}/reservations`} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to reservations
        </Link>
        <HmsPageHeader eyebrow="Reservations" meaning="rooms" title="Group allotments" description="Hold a block of rooms for a group, add their names when you have the list, and let the unused rooms go back on sale on a date you choose." />
        {!tenant ? (
          <HmsEmptyState art="page" meaning="rooms" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />
        ) : (
          <AllotmentsClient
            slug={slug}
            today={today}
            canManage
            roomTypes={roomTypes.map((t) => ({ id: t.id, name: t.name }))}
            initial={await listAllotments(createServerSupabaseClient(), tenant.id, today)}
          />
        )}
      </HmsPage>
    </HMSLayout>
  );
}
