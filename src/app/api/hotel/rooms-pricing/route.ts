import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyFloorPlanToRoomUnits } from "@/lib/hms/apply-floor-plan-units";
import { getHotelTenantBySlug, getRoomUnitCountForTenant, getTenantRoomCount, listRoomUnitsForTenant } from "@/lib/hms/data";
import { validateCurrentInventoryAgainstCaps } from "@/lib/hms/room-inventory-type-caps";
import {
  getFloorPlanEffectiveTarget,
  getFloorPlanRoomTotal,
  getFloorPlanTargetRoomCount,
  isFloorPlanComplete,
  normalizeFloorPlan,
} from "@/lib/hms/floor-plan";
import {
  ANYTIME_CHECK_IN,
  normalizePricingSetup,
  normalizeRoomTypes,
} from "@/lib/hms/room-pricing";

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);

const RoomTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  shortLabel: z.string().max(8).optional().nullable(),
  rooms: z.coerce.number().int().min(1).max(10000),
  maxOccupancy: z.coerce.number().int().min(1).max(20),
  baseRate: z.coerce.number().min(0),
  boardBasis: z.string().min(2).max(40),
});

const PricingSetupSchema = z.object({
  currency: z.string().trim().min(3).max(8),
  taxRate: z.coerce.number().min(0).max(100),
  serviceChargeRate: z.coerce.number().min(0).max(100),
  extraAdultRate: z.coerce.number().min(0),
  extraChildRate: z.coerce.number().min(0),
  checkInTime: z.union([
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    z.literal(ANYTIME_CHECK_IN),
  ]),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const FloorEntrySchema = z
  .object({
    floor: z.coerce.number().int().min(1).max(500),
    room_count: z.coerce.number().int().min(1).max(10000),
    room_codes: z.array(z.string().min(1).max(32)).max(10000).optional(),
  })
  .refine((row) => !row.room_codes || row.room_codes.length === row.room_count, {
    message: "room_codes must have the same length as room_count when provided.",
  })
  .refine((row) => {
    if (!row.room_codes?.length) return true;
    const s = new Set(row.room_codes);
    return s.size === row.room_codes.length;
  }, {
    message: "room_codes must not contain duplicates on the same floor.",
  });

const RoomsPricingSchema = z.object({
  slug: z.string().min(1),
  roomTypes: z.array(RoomTypeSchema).max(30),
  pricingSetup: PricingSetupSchema,
  floorPlan: z.array(FloorEntrySchema).max(200).optional().default([]),
});

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

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = RoomsPricingSchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(parsed.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await canManageRoomPricing(tenant.id, user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Only owner/admin can update room and pricing setup." },
        { status: 403 },
      );
    }

    const roomTypes = normalizeRoomTypes(parsed.roomTypes);
    const pricingSetup = normalizePricingSetup(parsed.pricingSetup);
    const floorPlan = normalizeFloorPlan(parsed.floorPlan ?? []);

    const signupRoomCount = await getTenantRoomCount(tenant.id);
    const configuredRoomTotal = roomTypes.reduce((sum, rt) => sum + rt.rooms, 0);
    const catalogFloorTarget = getFloorPlanTargetRoomCount(signupRoomCount, configuredRoomTotal);
    const roomUnitCount = await getRoomUnitCountForTenant(tenant.id);
    const floorTarget = getFloorPlanEffectiveTarget(catalogFloorTarget, roomUnitCount);

    if (floorTarget > 0 && !isFloorPlanComplete(floorPlan, floorTarget)) {
      const allocated = getFloorPlanRoomTotal(floorPlan);
      return NextResponse.json(
        {
          error:
            roomUnitCount > 0
              ? `Floor plan must allocate all ${floorTarget} room keys across floors (currently ${allocated}). Leave floors empty to keep every key on the ground floor.`
              : `Floor plan must allocate all ${floorTarget} hotel rooms across floors (currently ${allocated}). Leave floors empty to keep every room on the ground floor.`,
        },
        { status: 400 },
      );
    }

    if (roomUnitCount > 0) {
      const units = await listRoomUnitsForTenant(tenant.id);
      const capCheck = validateCurrentInventoryAgainstCaps(roomTypes, units);
      if (!capCheck.ok) {
        return NextResponse.json({ error: capCheck.error }, { status: 400 });
      }
    }

    const service = createServerSupabaseClient();
    const { error } = await service
      .from("tenants")
      .update({
        room_types: roomTypes,
        pricing_setup: pricingSetup,
        floor_plan: floorPlan,
      })
      .eq("id", tenant.id);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Unable to save room and pricing setup." },
        { status: 400 },
      );
    }

    const applied = await applyFloorPlanToRoomUnits(service, tenant.id, floorPlan);
    if (!applied.ok) {
      return NextResponse.json(
        {
          error: `Room and pricing setup was saved, but physical key floors could not be updated: ${applied.error}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      room_types: roomTypes,
      pricing_setup: pricingSetup,
      floor_plan: floorPlan,
      room_unit_floor_updates: applied.updatedCount,
      room_unit_code_updates: applied.codeUpdatesCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid room and pricing setup." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Unable to save room and pricing setup." },
      { status: 500 },
    );
  }
}
