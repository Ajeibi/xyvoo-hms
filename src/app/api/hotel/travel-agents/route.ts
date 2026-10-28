import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { listTravelAgents, saveTravelAgent } from "@/lib/hms/folio-commission";

/**
 * GET /api/hotel/travel-agents?slug= — the hotel's travel agents and their commission rates.
 * POST — add an agent or change one (owners and admins).
 */

export async function GET(req: Request) {
  const auth = await requireHotelApiMember(new URL(req.url).searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ agents: await listTravelAgents(auth.service, auth.tenant.id), canManage: isAdminLikeRole(auth.role) });
}

const PostSchema = z.object({
  slug: z.string().min(1),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter the agent's name.").max(120),
  commissionPercent: z.coerce.number().min(0).max(100),
  email: z.union([z.string().email("Enter a valid email address.").max(120), z.literal("")]).optional(),
  phone: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });

    const result = await saveTravelAgent(auth.service, {
      tenantId: auth.tenant.id,
      id: body.id,
      name: body.name,
      commissionPercent: body.commissionPercent,
      email: body.email,
      phone: body.phone,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.id ? "travel_agent_updated" : "travel_agent_added",
      entityType: "vendor",
      entityId: result.id,
      after: { name: body.name, commissionPercent: body.commissionPercent },
    });
    return NextResponse.json({ ok: true, id: result.id, agents: await listTravelAgents(auth.service, auth.tenant.id) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
