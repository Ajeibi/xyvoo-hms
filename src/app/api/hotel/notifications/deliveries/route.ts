import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";

/** The last 50 attempts to reach someone outside the app. Owners and admins only. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role !== "owner" && auth.role !== "admin") {
    return NextResponse.json({ error: "Only an owner or admin can see the delivery log." }, { status: 403 });
  }

  const { data, error } = await auth.service
    .schema("hotel")
    .from("notification_deliveries")
    .select("id,user_id,channel,status,detail,created_at,notifications(title)")
    .eq("tenant_id", auth.tenant.id)
    .order("created_at", { ascending: false })
    .limit(50);
  // Until the migration has run there is no log yet.
  if (error) return NextResponse.json({ deliveries: [] });

  const ids = [...new Set((data ?? []).map((d) => d.user_id as string))];
  const names = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const { data: u } = await auth.service.auth.admin.getUserById(id);
      const meta = u?.user?.user_metadata as { full_name?: string; name?: string } | undefined;
      names.set(id, meta?.full_name || meta?.name || u?.user?.email || "Team member");
    }),
  );

  return NextResponse.json({
    deliveries: (data ?? []).map((d) => {
      const n = d.notifications as { title: string } | { title: string }[] | null;
      return {
        id: d.id,
        person: names.get(d.user_id as string) ?? "Team member",
        channel: d.channel,
        status: d.status,
        detail: d.detail,
        createdAt: d.created_at,
        title: (Array.isArray(n) ? n[0]?.title : n?.title) ?? "Alert",
      };
    }),
  });
}
