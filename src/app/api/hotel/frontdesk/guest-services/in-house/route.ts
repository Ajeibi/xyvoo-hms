import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { listInHouseGuestsForTenant } from "@/lib/hms/guest-services";

const QuerySchema = z.object({
  slug: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canView) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const guests = await listInHouseGuestsForTenant(auth.service, auth.tenant.id);
    return NextResponse.json({ guests });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[guest-services in-house GET]", e);
    return NextResponse.json({ error: "Failed to load in-house guests." }, { status: 500 });
  }
}
