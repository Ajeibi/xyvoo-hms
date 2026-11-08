import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getMaintenanceCapabilities, type MaintenanceCapabilities } from "@/lib/hms/maintenance-rbac";
import type { Actor } from "@/lib/hms/maintenance-orders";

type Member = Exclude<Awaited<ReturnType<typeof requireHotelApiMember>>, { error: string }>;

export type MaintenanceAuth = { auth: Member; caps: MaintenanceCapabilities; actor: Actor };

/** Signs the caller in to a hotel's Maintenance routes. Reporting is open to every member; the rest needs `need`. */
export async function authMaintenance(
  slug: string | null,
  need: keyof MaintenanceCapabilities = "canReport",
): Promise<MaintenanceAuth | NextResponse> {
  if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const caps = getMaintenanceCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
  if (!caps[need]) {
    return NextResponse.json({ error: "Your role can't do this in Maintenance. Ask a manager." }, { status: 403 });
  }
  const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    auth.user.email ||
    null;
  return { auth, caps, actor: { userId: auth.user.id, name } };
}

export function isFailure(v: MaintenanceAuth | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
