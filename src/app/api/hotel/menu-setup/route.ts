import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import {
  isMenuSetupContentOnlyMutation,
  isMenuSetupMetaOnlyMutation,
  loadMenuContentForAdmin,
  loadMenuForAdmin,
  loadMenuSetupMeta,
  saveMenuSetupBatch,
} from "@/lib/hms/fb-menu";

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);

const UpsertCategorySchema = z.object({
  id: z.string().uuid().optional(),
  outletId: z.string().uuid(),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const UpsertItemSchema = z.object({
  id: z.string().uuid().optional(),
  outletId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  stationId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  price: z.coerce.number().nonnegative(),
  description: z.string().max(300).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
});

const UpsertOutletSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  outletType: z.enum(["restaurant", "bar", "room_service"]),
  code: z.string().min(1).max(32).optional(),
  isActive: z.boolean().optional(),
});

const UpsertStationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(32).optional(),
  sortOrder: z.number().int().optional(),
});

const UpsertTableSchema = z.object({
  id: z.string().uuid().optional(),
  outletId: z.string().uuid(),
  tableCode: z.string().min(1).max(20),
  covers: z.coerce.number().int().min(1).max(30),
});

const MenuSetupPostSchema = z.object({
  slug: z.string().min(1),
  upsertOutlets: z.array(UpsertOutletSchema).optional().default([]),
  deleteOutletIds: z.array(z.string().uuid()).optional().default([]),
  upsertStations: z.array(UpsertStationSchema).optional().default([]),
  deleteStationIds: z.array(z.string().uuid()).optional().default([]),
  upsertTables: z.array(UpsertTableSchema).optional().default([]),
  deleteTableIds: z.array(z.string().uuid()).optional().default([]),
  upsertCategories: z.array(UpsertCategorySchema).optional().default([]),
  upsertItems: z.array(UpsertItemSchema).optional().default([]),
  deleteCategoryIds: z.array(z.string().uuid()).optional().default([]),
  deleteItemIds: z.array(z.string().uuid()).optional().default([]),
  reorderCategories: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
    .optional()
    .default([]),
  reorderItems: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
    .optional()
    .default([]),
});

async function canManageMenuSetup(tenantId: string, userId: string) {
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await getHotelTenantBySlug(slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await canManageMenuSetup(tenant.id, user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Only owner/admin can manage menu setup." },
        { status: 403 },
      );
    }

    const service = createServerSupabaseClient();
    const menu = await loadMenuForAdmin(service, tenant.id);
    return NextResponse.json(menu);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = MenuSetupPostSchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(body.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await canManageMenuSetup(tenant.id, user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Only owner/admin can manage menu setup." },
        { status: 403 },
      );
    }

    const service = createServerSupabaseClient();
    const batchPayload = {
      upsertOutlets: body.upsertOutlets,
      deleteOutletIds: body.deleteOutletIds,
      upsertStations: body.upsertStations,
      deleteStationIds: body.deleteStationIds,
      upsertTables: body.upsertTables,
      deleteTableIds: body.deleteTableIds,
      upsertCategories: body.upsertCategories,
      upsertItems: body.upsertItems,
      deleteCategoryIds: body.deleteCategoryIds,
      deleteItemIds: body.deleteItemIds,
      reorderCategories: body.reorderCategories,
      reorderItems: body.reorderItems,
    };

    const result = await saveMenuSetupBatch(service, tenant.id, batchPayload);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (isMenuSetupMetaOnlyMutation(batchPayload)) {
      const meta = await loadMenuSetupMeta(service, tenant.id);
      return NextResponse.json({ ok: true, partial: "meta", ...meta });
    }

    if (isMenuSetupContentOnlyMutation(batchPayload)) {
      const content = await loadMenuContentForAdmin(service, tenant.id);
      return NextResponse.json({ ok: true, partial: "content", ...content });
    }

    const menu = await loadMenuForAdmin(service, tenant.id);
    return NextResponse.json({ ok: true, ...menu });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
