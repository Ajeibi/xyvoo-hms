import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { DEPOSIT_KINDS, listDepositPolicies, removeDepositPolicy, saveDepositPolicy } from "@/lib/hms/folio-deposits";

/**
 * GET /api/hotel/reservations/deposit-policies?slug= — the hotel's deposit policies and room types.
 * POST — save the default or a room type's policy, or remove a room type's own policy.
 * Changes are for owners and admins.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiMember(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    policies: await listDepositPolicies(auth.service, auth.tenant.id),
    roomTypes: normalizeRoomTypes(auth.tenant.room_types).map((t) => ({ id: t.id, name: t.name, baseRate: t.baseRate })),
    canManage: isAdminLikeRole(auth.role),
  });
}

const PostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    slug: z.string().min(1),
    roomTypeCode: z.string().min(1).max(80).nullable(),
    kind: z.enum(DEPOSIT_KINDS),
    value: z.coerce.number().min(0).max(100_000_000),
    dueDaysBeforeArrival: z.coerce.number().int().min(0).max(365),
  }),
  z.object({ action: z.literal("remove"), slug: z.string().min(1), roomTypeCode: z.string().min(1).max(80) }),
]);

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });

    if (body.roomTypeCode && !normalizeRoomTypes(auth.tenant.room_types).some((t) => t.id === body.roomTypeCode)) {
      return NextResponse.json({ error: "That room type wasn't found." }, { status: 400 });
    }

    const result =
      body.action === "save"
        ? await saveDepositPolicy(auth.service, {
            tenantId: auth.tenant.id,
            userId: auth.user.id,
            policy: { roomTypeCode: body.roomTypeCode, kind: body.kind, value: body.value, dueDaysBeforeArrival: body.dueDaysBeforeArrival },
          })
        : await removeDepositPolicy(auth.service, auth.tenant.id, body.roomTypeCode);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.action === "save" ? "deposit_policy_saved" : "deposit_policy_removed",
      entityType: "tenant",
      entityId: auth.tenant.id,
      after: { ...body, slug: undefined },
    });
    return NextResponse.json({ ok: true, policies: await listDepositPolicies(auth.service, auth.tenant.id) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
