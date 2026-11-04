import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { FEE_KINDS, listCancellationPolicies, removeCancellationPolicy, saveCancellationPolicy } from "@/lib/hms/reservation-cancellation";

/**
 * GET /api/hotel/reservations/cancellation-policies?slug= — the hotel's cancellation policies and room types.
 * POST — save the default or a room type's policy, or remove a room type's own. Owners and admins only.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", ["reservations", "frontdesk"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    policies: await listCancellationPolicies(auth.service, auth.tenant.id),
    roomTypes: normalizeRoomTypes(auth.tenant.room_types).map((t) => ({ id: t.id, name: t.name })),
    canManage: isAdminLikeRole(auth.role),
  });
}

const Post = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    slug: z.string().min(1),
    roomTypeCode: z.string().min(1).max(80).nullable(),
    name: z.string().trim().max(60).optional(),
    freeDaysBeforeArrival: z.coerce.number().int().min(0).max(365),
    lateFeeKind: z.enum(FEE_KINDS),
    lateFeeValue: z.coerce.number().min(0).max(100_000_000),
    noShowFeeKind: z.enum(FEE_KINDS),
    noShowFeeValue: z.coerce.number().min(0).max(100_000_000),
  }),
  z.object({ action: z.literal("remove"), slug: z.string().min(1), roomTypeCode: z.string().min(1).max(80) }),
]);

export async function POST(req: Request) {
  try {
    const body = Post.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, ["reservations", "frontdesk"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });
    if (body.roomTypeCode && !normalizeRoomTypes(auth.tenant.room_types).some((t) => t.id === body.roomTypeCode)) {
      return NextResponse.json({ error: "That room type wasn't found." }, { status: 400 });
    }

    const result =
      body.action === "save"
        ? await saveCancellationPolicy(auth.service, {
            tenantId: auth.tenant.id,
            userId: auth.user.id,
            policy: {
              roomTypeCode: body.roomTypeCode,
              name: body.name || (body.roomTypeCode ? "Room type policy" : "Standard"),
              freeDaysBeforeArrival: body.freeDaysBeforeArrival,
              lateFeeKind: body.lateFeeKind,
              lateFeeValue: body.lateFeeValue,
              noShowFeeKind: body.noShowFeeKind,
              noShowFeeValue: body.noShowFeeValue,
            },
          })
        : await removeCancellationPolicy(auth.service, auth.tenant.id, body.roomTypeCode);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.action === "save" ? "cancellation_policy_saved" : "cancellation_policy_removed",
      entityType: "tenant",
      entityId: auth.tenant.id,
      after: { ...body, slug: undefined },
    });
    return NextResponse.json({ ok: true, policies: await listCancellationPolicies(auth.service, auth.tenant.id) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Could not save the policy." }, { status: 500 });
  }
}
