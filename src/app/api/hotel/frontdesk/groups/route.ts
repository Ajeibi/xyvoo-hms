import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { createGroup, loadGroupCandidates, loadGroups } from "@/lib/hms/frontdesk-groups";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const CreateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Give the group a name.").max(80),
  coordinatorName: z.string().trim().max(80).optional(),
  coordinatorPhone: z.string().trim().max(30).optional(),
  sharedBilling: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
  reservationIds: z.array(z.string().uuid()).min(2, "Choose at least two rooms.").max(60),
});

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [groups, candidates] = await Promise.all([
      loadGroups(auth.service, auth.tenant.id),
      loadGroupCandidates(auth.service, auth.tenant.id),
    ]);
    return NextResponse.json(
      { groups, candidates, currency: normalizePricingSetup(auth.tenant.pricing_setup).currency },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load groups." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const created = await createGroup(auth.service, { tenantId: auth.tenant.id, ...body });
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "group_created",
      entityType: "group_booking",
      entityId: created.id,
      after: { name: body.name, rooms: body.reservationIds.length },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[groups POST]", e);
    return NextResponse.json({ error: "Failed to create the group." }, { status: 500 });
  }
}
