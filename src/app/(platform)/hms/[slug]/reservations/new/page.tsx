import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { FrontDeskCheckInForm } from "@/components/hms/frontdesk/FrontDeskCheckInForm";
import { fetchCheckInStaffOptions, checkInStaffOptionsForSessionUser } from "@/lib/hms/check-in-staff-options";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth-server";
import type { CheckInRoomUnit } from "@/lib/hms/check-in-room-units";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

export default async function NewReservationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const roomTypes = normalizeRoomTypes(tenant?.room_types);
  const pricing = normalizePricingSetup(tenant?.pricing_setup);
  const defaultDepartureTime = pricing.checkOutTime;

  let roomUnits: CheckInRoomUnit[] = [];
  let checkInStaffOptions: Awaited<ReturnType<typeof fetchCheckInStaffOptions>> = [];

  if (tenant?.id) {
    const supabase = createServerSupabaseClient();
    const [staffList, { data }] = await Promise.all([
      fetchCheckInStaffOptions(supabase, tenant.id),
      supabase
        .schema("hotel")
        .from("room_units")
        .select("room_code, floor, status, room_type_code")
        .eq("tenant_id", tenant.id)
        .order("floor", { ascending: true })
        .order("room_code", { ascending: true }),
    ]);
    checkInStaffOptions = staffList;
    const typeNameById = new Map(roomTypes.map((t) => [t.id, t.name]));
    roomUnits = (data ?? []).map((r) => {
      const floorRaw = r.floor as number | string | null | undefined;
      const floorNum =
        typeof floorRaw === "number" && Number.isFinite(floorRaw)
          ? floorRaw
          : typeof floorRaw === "string" && floorRaw.trim() !== ""
            ? Number.parseInt(floorRaw, 10)
            : 0;
      const rtc = String((r as { room_type_code?: string }).room_type_code ?? "");
      return {
        roomCode: r.room_code as string,
        floor: Number.isFinite(floorNum) ? floorNum : 0,
        status: String(r.status ?? "vacant_clean"),
        roomTypeCode: rtc,
        roomTypeName: typeNameById.get(rtc) ?? undefined,
      };
    });
  }

  let defaultCheckedInByUserId: string | null = null;
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    checkInStaffOptions = checkInStaffOptionsForSessionUser(checkInStaffOptions, sessionUser.id);
    if (checkInStaffOptions.length > 0) {
      defaultCheckedInByUserId = sessionUser.id;
    }
  } else {
    checkInStaffOptions = [];
  }

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage wide>
        <Link
          href={`/hms/${slug}/frontdesk`}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to the front desk
        </Link>
        <HmsPageHeader
          eyebrow="Reservations"
          meaning="rooms"
          title="New reservation"
          description="Book a future stay. The guest and their stay are saved now; the room isn't marked as taken and nothing is charged to their bill until they check in."
        />

        <Suspense fallback={<p role="status" className="text-sm text-slate-600">Loading the form…</p>}>
            <FrontDeskCheckInForm
              slug={slug}
              roomTypes={roomTypes}
              roomUnits={roomUnits}
              checkInStaffOptions={checkInStaffOptions}
              defaultCheckedInByUserId={defaultCheckedInByUserId}
              pricing={pricing}
              defaultDepartureTime={defaultDepartureTime}
              mode="reserve"
              cards
            />
        </Suspense>
      </HmsPage>
    </HMSLayout>
  );
}
