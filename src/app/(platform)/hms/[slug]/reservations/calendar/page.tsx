import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { ReservationCalendarClient } from "@/components/hms/reservations/ReservationCalendarClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadReservationCalendar } from "@/lib/hms/reservation-calendar";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Booking calendar" };

type Search = { start?: string | string[]; days?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReservationCalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await getHotelTenantBySlug(slug);
  const today = new Date().toISOString().slice(0, 10);
  const startRaw = one(sp.start);
  const start = startRaw && /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : today;
  const daysRaw = Number(one(sp.days));
  const dayCount = [7, 14, 21, 31].includes(daysRaw) ? daysRaw : 14;

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage wide>
        <Link href={`/hms/${slug}/reservations`} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to reservations
        </Link>
        <HmsPageHeader eyebrow="Reservations" meaning="rooms" title="Booking calendar" description="Every room and every booking, day by day. Move, lengthen, shorten or change room by dragging." />
        {!tenant ? (
          <HmsEmptyState art="page" meaning="rooms" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />
        ) : (
          <ReservationCalendarClient
            slug={slug}
            currency={normalizePricingSetup(tenant.pricing_setup).currency}
            data={await loadReservationCalendar(createServerSupabaseClient(), {
              tenantId: tenant.id,
              roomTypes: normalizeRoomTypes(tenant.room_types),
              startDay: start,
              dayCount,
              today,
            })}
          />
        )}
      </HmsPage>
    </HMSLayout>
  );
}
