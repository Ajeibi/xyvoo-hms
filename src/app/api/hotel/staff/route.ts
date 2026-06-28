import { NextResponse } from "next/server";
import { z } from "zod";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { DepartmentRoleSchema, findDepartmentLogin, requireDepartmentLoginAdmin } from "./_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
  department_role: DepartmentRoleSchema.optional(),
});

const UpdateSchema = z
  .object({
    slug: z.string().min(1),
    department_role: DepartmentRoleSchema,
    password: z.string().min(8).optional(),
    email: z.string().email().optional(),
  })
  .refine((body) => Boolean(body.password || body.email), {
    message: "Provide a new password and/or email.",
  });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      department_role: url.searchParams.get("department_role") ?? undefined,
    });

    const auth = await requireDepartmentLoginAdmin(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const logins = await getDepartmentLoginsForTenant(auth.tenant.id);
    if (query.department_role) {
      const login = logins.find((item) => item.departmentRole === query.department_role) ?? null;
      if (!login) {
        return NextResponse.json({ error: "Department login not found." }, { status: 404 });
      }
      return NextResponse.json({ login });
    }

    return NextResponse.json({ logins });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to load department logins." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = UpdateSchema.parse(await req.json());
    const auth = await requireDepartmentLoginAdmin(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const login = await findDepartmentLogin(auth.tenant.id, body.department_role);
    if (!login) {
      return NextResponse.json({ error: "Department login not found." }, { status: 404 });
    }

    const { error: updateError } = await auth.service.auth.admin.updateUserById(login.userId, {
      ...(body.email ? { email: body.email, email_confirm: true } : {}),
      ...(body.password ? { password: body.password } : {}),
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message || "Unable to update login." }, { status: 400 });
    }

    const refreshed = await findDepartmentLogin(auth.tenant.id, body.department_role);
    return NextResponse.json({ ok: true, login: refreshed });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update department login." }, { status: 500 });
  }
}
