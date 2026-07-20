import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { notificationVisibilityFilter } from "@/lib/hms/front-desk-ops";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let query = auth.service
    .schema("hotel")
    .from("notifications")
    .select("id,type,title,body,severity,created_at,read_at")
    .eq("tenant_id", auth.tenant.id);

  const scopeFilter = notificationVisibilityFilter(auth.departmentRole);
  if (scopeFilter) query = query.or(scopeFilter);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(30);

  if (error) return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });

  const notifications = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    severity: n.severity,
    createdAt: n.created_at,
    read: Boolean(n.read_at),
  }));
  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

const PatchSchema = z.object({
  slug: z.string().min(1),
  id: z.string().uuid(),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await auth.service
      .schema("hotel")
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("tenant_id", auth.tenant.id);

    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
