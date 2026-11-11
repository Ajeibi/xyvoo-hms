import { NextResponse } from "next/server";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";

/** Paying XYVOO, and seeing what the hotel has paid, is for the hotel owner or an admin only. */
export async function requireChargeAdmin(slug: string) {
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  if (!isAdminLikeRole(auth.role)) {
    return { response: NextResponse.json({ error: "Only an owner or admin can make or see payments to XYVOO." }, { status: 403 }) };
  }
  return { auth };
}
