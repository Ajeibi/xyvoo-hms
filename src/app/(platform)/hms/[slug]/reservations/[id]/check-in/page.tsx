import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { FrontDeskCheckInForm } from "@/components/hms/frontdesk/FrontDeskCheckInForm";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getCheckInFormInitialData } from "@/lib/hms/check-in-form-initial-data";
import { fetchCheckInStaffOptions, checkInStaffOptionsForSessionUser } from "@/lib/hms/check-in-staff-options";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CheckInRoomUnit } from "@/lib/hms/check-in-room-units";

export default async function ReservationCheckInPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) notFound();

  const prefill = await getCheckInFormInitialData(tenant.id, id);
  if (!prefill) notFound();
  if (prefill.status !== "confirmed") {
    redirect(`/hms/${slug}/reservations`);
  }

  const roomTypes = normalizeRoomTypes(tenant.room_types);
  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const defaultDepartureTime = pricing.checkOutTime;

  const service = createServerSupabaseClient();
  const [staffList, { data }] = await Promise.all([
    fetchCheckInStaffOptions(service, tenant.id),
    service
      .schema("hotel")
      .from("room_units")
      .select("room_code, floor, status, room_type_code")
      .eq("tenant_id", tenant.id)
      .order("floor", { ascending: true })
      .order("room_code", { ascending: true }),
  ]);

  let checkInStaffOptions = staffList;
  const typeNameById = new Map(roomTypes.map((t) => [t.id, t.name]));
  const roomUnits: CheckInRoomUnit[] = (data ?? []).map((r) => {
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

  let defaultCheckedInByUserId: string | null = null;
  const user = await getSessionUser();
  if (user) {
    checkInStaffOptions = checkInStaffOptionsForSessionUser(checkInStaffOptions, user.id);
    if (checkInStaffOptions.length > 0) {
      defaultCheckedInByUserId = user.id;
    }
  } else {
    checkInStaffOptions = [];
  }

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage wide>
        <Link
          href={`/hms/${slug}/reservations`}
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span aria-hidden>←</span> Back to reservations
        </Link>
        <HmsPageHeader
          eyebrow="Front desk"
          meaning="rooms"
          title={`Complete check-in · ${prefill.confirmationCode}`}
          description={`${prefill.guestName}. We've filled in the details from the booking. Check them, change anything that's different, then complete check-in.`}
        />

        <section aria-label="Check-in form">
          <Suspense fallback={<p role="status" className="text-sm text-slate-600">Loading the form…</p>}>
            <FrontDeskCheckInForm
              slug={slug}
              roomTypes={roomTypes}
              roomUnits={roomUnits}
              checkInStaffOptions={checkInStaffOptions}
              defaultCheckedInByUserId={defaultCheckedInByUserId}
              pricing={pricing}
              defaultDepartureTime={defaultDepartureTime}
              mode="check_in"
              initialData={prefill.initialData}
              existingReservationId={id}
            />
          </Suspense>
        </section>
      </HmsPage>
    </HMSLayout>
  );
}
