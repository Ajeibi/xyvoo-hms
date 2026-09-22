import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserStoreDashboardPath } from "@/lib/auth/redirects";

const CompleteSchema = z.object({
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/, "Use lowercase letters, numbers, and hyphens only."),
});

export async function POST(req: Request) {
  const authClient = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingDashboardPath = await getUserStoreDashboardPath(user.id);
  if (existingDashboardPath) {
    return NextResponse.json({ success: true, redirectTo: existingDashboardPath });
  }

  const body = await req.json().catch(() => null);
  const parsed = CompleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid store details." },
      { status: 400 },
    );
  }

  const { storeName, slug } = parsed.data;
  const service = createServerSupabaseClient();

  const { data: existingTenant } = await service
    .from("tenants")
    .select("id")
    .eq("product", "store")
    .or(`subdomain.eq.${slug},name.eq.${slug}`)
    .maybeSingle();

  if (existingTenant) {
    return NextResponse.json({ error: "That storefront address is already taken." }, { status: 409 });
  }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({ subdomain: slug, name: slug, display_name: storeName, product: "store" })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: tenantError?.message || "Failed to create storefront." }, { status: 400 });
  }

  const { error: membershipError } = await service
    .schema("store")
    .from("memberships")
    .insert({ tenant_id: tenant.id, user_id: user.id, role: "owner" });

  if (membershipError) {
    await service.from("tenants").delete().eq("id", tenant.id);
    return NextResponse.json({ error: membershipError.message || "Failed to set up owner access." }, { status: 400 });
  }

  return NextResponse.json({ success: true, slug }, { status: 201 });
}
