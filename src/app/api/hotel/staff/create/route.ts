import { NextResponse } from "next/server";
import { z } from "zod";
import { getDepartmentLoginRolesForTenant } from "@/lib/hms/department-logins";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CREATABLE_DEPARTMENT_ROLES } from "@/lib/hms/role-sections";
import { getHotelTenantBySlug } from "@/lib/hms/data";

const CreateStaffSchema = z.object({
  slug: z.string().min(1),
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  department_role: z.enum(CREATABLE_DEPARTMENT_ROLES as [string, ...string[]]),
});

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);

export async function POST(req: Request) {
  try {
    const authClient = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = CreateStaffSchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(parsed.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const service = createServerSupabaseClient();
    const { data: actorMembership } = await service
      .schema("hotel")
      .from("memberships")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!actorMembership || !ADMIN_LIKE_ROLES.has(actorMembership.role)) {
      return NextResponse.json({ error: "Only owner/admin can create department logins." }, { status: 403 });
    }

    const createdDepartmentRoles = await getDepartmentLoginRolesForTenant(tenant.id);
    if (createdDepartmentRoles.includes(parsed.department_role)) {
      return NextResponse.json(
        { error: `${parsed.department_role} login has already been created.` },
        { status: 400 },
      );
    }

    const systemRole = parsed.department_role === "Admin / GM" ? "admin" : "staff";
    const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.full_name,
        department_role: parsed.department_role,
        tenant_slug: parsed.slug,
      },
    });

    if (createUserError || !createdUser.user) {
      return NextResponse.json({ error: createUserError?.message || "Unable to create staff login." }, { status: 400 });
    }

    const { error: membershipError } = await service.schema("hotel").from("memberships").insert({
      tenant_id: tenant.id,
      user_id: createdUser.user.id,
      role: systemRole,
    });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message || "Unable to assign membership." }, { status: 400 });
    }

    await service.schema("hotel").from("profiles").upsert(
      {
        tenant_id: tenant.id,
        user_id: createdUser.user.id,
        contact_name: parsed.full_name,
      },
      { onConflict: "user_id" },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create staff login." }, { status: 500 });
  }
}
