import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug, listRoomUnitsForTenant } from "@/lib/hms/data";
import {
  numericRoomKey,
  validateInventoryTypeUpdates,
} from "@/lib/hms/room-inventory-type-caps";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);

async function canManageRoomPricing(tenantId: string, userId: string) {
  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(membership && ADMIN_LIKE_ROLES.has(membership.role));
}

const PostSchema = z
  .object({
    slug: z.string().min(1),
    ranges: z
      .array(
        z.object({
          from: z.coerce.number().int(),
          to: z.coerce.number().int(),
          roomTypeId: z.string().min(1).max(64),
        }),
      )
      .optional(),
    assignments: z
      .array(
        z.object({
          roomUnitId: z.string().min(1).max(64),
          roomTypeId: z.string().min(1).max(64),
        }),
      )
      .optional(),
  })
  .refine((b) => (b.ranges?.length ?? 0) > 0 || (b.assignments?.length ?? 0) > 0, {
    message: "Provide at least one range or one assignment.",
  });

export async function GET(req: Request) {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug")?.trim() ?? "";
    if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

    const tenant = await getHotelTenantBySlug(slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await canManageRoomPricing(tenant.id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Only owner/admin can view inventory assignment." }, { status: 403 });
    }

    const units = await listRoomUnitsForTenant(tenant.id);
    return NextResponse.json({ tenantId: tenant.id, units });
  } catch {
    return NextResponse.json({ error: "Unable to load room inventory." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = PostSchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(parsed.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await canManageRoomPricing(tenant.id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Only owner/admin can update room types on keys." }, { status: 403 });
    }

    const roomTypes = normalizeRoomTypes(tenant.room_types);
    const allowedTypeIds = new Set(roomTypes.map((r) => r.id));

    const units = await listRoomUnitsForTenant(tenant.id);
    if (units.length === 0) {
      return NextResponse.json({ error: "No physical room keys exist yet for this property." }, { status: 400 });
    }

    const byId = new Map(units.map((u) => [u.id, u]));
    const updates = new Map<string, string>();

    for (const a of parsed.assignments ?? []) {
      if (!byId.has(a.roomUnitId)) {
        return NextResponse.json({ error: `Unknown room unit: ${a.roomUnitId}` }, { status: 400 });
      }
      if (!allowedTypeIds.has(a.roomTypeId)) {
        return NextResponse.json({ error: `Unknown room type id: ${a.roomTypeId}` }, { status: 400 });
      }
      updates.set(a.roomUnitId, a.roomTypeId);
    }

    for (const r of parsed.ranges ?? []) {
      if (!allowedTypeIds.has(r.roomTypeId)) {
        return NextResponse.json({ error: `Unknown room type id: ${r.roomTypeId}` }, { status: 400 });
      }
      const lo = Math.min(r.from, r.to);
      const hi = Math.max(r.from, r.to);
      for (const u of units) {
        const n = numericRoomKey(u.room_code);
        if (n == null) continue;
        if (n >= lo && n <= hi) {
          updates.set(u.id, r.roomTypeId);
        }
      }
    }

    if (updates.size === 0) {
      return NextResponse.json({ error: "No rooms matched the selection." }, { status: 400 });
    }

    const capacityCheck = validateInventoryTypeUpdates(roomTypes, units, updates);
    if (!capacityCheck.ok) {
      return NextResponse.json({ error: capacityCheck.error }, { status: 400 });
    }

    const service = createServerSupabaseClient();
    for (const [roomUnitId, room_type_code] of updates) {
      const { error } = await service
        .schema("hotel")
        .from("room_units")
        .update({ room_type_code })
        .eq("tenant_id", tenant.id)
        .eq("id", roomUnitId);
      if (error) {
        return NextResponse.json({ error: error.message || "Update failed." }, { status: 400 });
      }
    }

    const nextUnits = await listRoomUnitsForTenant(tenant.id);
    return NextResponse.json({ ok: true, updated: updates.size, units: nextUnits });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid payload." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Unable to update room inventory types." }, { status: 500 });
  }
}
