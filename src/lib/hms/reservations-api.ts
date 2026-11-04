import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { getArrivalsCapabilities, type ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { verifyManagerPin } from "@/lib/hms/folio";

type HotelAuthOk = Extract<Awaited<ReturnType<typeof requireHotelApiSection>>, { user: unknown }>;

export type ReservationsAuth = Omit<HotelAuthOk, "error" | "status"> & { caps: ArrivalsRoleCapabilities; isAdmin: boolean };

/** Staff who may work with reservations: the reservations and front desk sections, anyone but accountants. */
export async function requireReservationsApi(slug: string): Promise<ReservationsAuth | { error: string; status: number }> {
  const auth = await requireHotelApiSection(slug, ["reservations", "frontdesk"]);
  const failure = auth as { error?: string; status?: number };
  if (failure.error) return { error: failure.error, status: failure.status ?? 403 };
  const ok = auth as HotelAuthOk;
  const caps = getArrivalsCapabilities(ok.departmentRole ?? ok.role);
  if (!caps.canCheckIn) return { error: "Your role can't change bookings.", status: 403 };
  return { user: ok.user, tenant: ok.tenant, service: ok.service, role: ok.role, departmentRole: ok.departmentRole, caps, isAdmin: isAdminLikeRole(ok.role) };
}

/** True for owners and admins, or for staff who gave the manager's PIN. */
export function managerApproved(auth: ReservationsAuth, pin: string | undefined) {
  return verifyManagerPin(auth.service, auth.tenant.id, pin, auth.role);
}

/** Today as the front desk reads it. */
export function todayDay() {
  return new Date().toISOString().slice(0, 10);
}
