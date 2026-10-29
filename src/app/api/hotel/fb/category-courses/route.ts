import { NextResponse } from "next/server";
import { z } from "zod";
import { FB_COURSE_MAX } from "@/lib/hms/fb-course-rules";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const Schema = z.object({
  slug: z.string().min(1),
  categoryId: z.string().uuid(),
  /** null = use the default (starters, or straight away for bar menus). */
  defaultCourse: z.coerce.number().int().min(0).max(FB_COURSE_MAX).nullable(),
});

/** Sets which course a menu category's items start on. */
export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("fb_menu_categories")
      .update({ default_course: body.defaultCourse })
      .eq("id", body.categoryId)
      .eq("tenant_id", auth.tenant.id)
      .select("id,name,default_course")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Category not found." }, { status: 404 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "fb_category_course_set",
      entityType: "fb_menu_category",
      entityId: body.categoryId,
      after: { name: data.name, default_course: data.default_course },
    });
    return NextResponse.json({ ok: true, category: data });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
