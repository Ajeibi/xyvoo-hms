import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { clearDemoTenantData } from "@/lib/hms/seed/clear-demo-tenant";
import { seedDemoTenant } from "@/lib/hms/seed/seed-demo-tenant";

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);

const BodySchema = z.object({
  slug: z.string().min(1),
  force: z.boolean().optional(),
  action: z.enum(["seed", "clear"]).optional().default("seed"),
});

async function canManageDemo(tenantId: string, userId: string) {
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

    const body = BodySchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(body.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const allowed = await canManageDemo(tenant.id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Only owner/admin can manage demo data." }, { status: 403 });
    }

    const service = createServerSupabaseClient();

    if (body.action === "clear") {
      await clearDemoTenantData(service, tenant.id);
      return NextResponse.json({ ok: true, message: "Demo data removed." });
    }

    const result = await seedDemoTenant(service, tenant.id, body.slug, { force: body.force });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, skipped: result.skipped, message: result.message });
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
