import Link from "next/link";
import { Suspense } from "react";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskCheckInForm } from "@/components/hms/frontdesk/FrontDeskCheckInForm";
import { fetchCheckInStaffOptions, checkInStaffOptionsForSessionUser } from "@/lib/hms/check-in-staff-options";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
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
  const authClient = await createSupabaseAuthServerClient();
  const {
    data: { user: sessionUser },
  } = await authClient.auth.getUser();
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
      <div className="w-full px-6 py-8 sm:px-8">
        <div className="mb-6">
          <Link
            href={`/hms/${slug}/frontdesk`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to front desk
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Create reservation</h1>
          <p className="mt-2 text-sm text-slate-500">
            Book a future stay — guest profile and stay are saved now. The room isn&apos;t marked occupied and no
            folio charges post until the guest actually checks in.
          </p>
        </div>

        <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-8">
          <Suspense fallback={<p className="text-sm text-slate-500">Loading form…</p>}>
            <FrontDeskCheckInForm
              slug={slug}
              roomTypes={roomTypes}
              roomUnits={roomUnits}
              checkInStaffOptions={checkInStaffOptions}
              defaultCheckedInByUserId={defaultCheckedInByUserId}
              pricing={pricing}
              defaultDepartureTime={defaultDepartureTime}
              mode="reserve"
            />
          </Suspense>
        </section>
      </div>
    </HMSLayout>
  );
}
