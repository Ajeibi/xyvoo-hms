import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const RegisterSchema = z.object({
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/, "Use lowercase letters, numbers, and hyphens only."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid registration details." },
      { status: 400 },
    );
  }

  const { storeName, slug, email, password } = parsed.data;
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

  const { data: created, error: createUserError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: storeName },
  });

  if (createUserError || !created.user) {
    const message = createUserError?.message.includes("already been registered")
      ? "An account with that email already exists. Try signing in instead."
      : createUserError?.message || "Failed to create account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const userId = created.user.id;

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({ subdomain: slug, name: slug, display_name: storeName, product: "store" })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    await service.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: tenantError?.message || "Failed to create storefront." },
      { status: 400 },
    );
  }

  const { error: membershipError } = await service
    .schema("store")
    .from("memberships")
    .insert({ tenant_id: tenant.id, user_id: userId, role: "owner" });

  if (membershipError) {
    await service.from("tenants").delete().eq("id", tenant.id);
    await service.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: membershipError.message || "Failed to set up owner access." }, { status: 400 });
  }

  return NextResponse.json({ success: true, slug }, { status: 201 });
}
