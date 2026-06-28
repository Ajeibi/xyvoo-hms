import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";

const Query = z.object({
  slug: z.string().min(1),
});

export type AssignableStaffMember = {
  userId: string;
  name: string;
  role: string;
};

/** Front desk / managers: list tenant members for guest request assignment. Department-scoped roles get an empty list (MVP). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = Query.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities(auth.role);
    if (!caps.canView) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    if (caps.readOnly || caps.departmentScope) {
      return NextResponse.json({ staff: [] as AssignableStaffMember[] });
    }
    if (!caps.canCreate) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { data: members, error: mErr } = await auth.service
      .schema("hotel")
      .from("memberships")
      .select("user_id,role")
      .eq("tenant_id", auth.tenant.id)
      .limit(200);

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
    if (userIds.length === 0) return NextResponse.json({ staff: [] });

    const { data: profiles, error: pErr } = await auth.service
      .from("profiles")
      .select("user_id,contact_name")
      .in("user_id", userIds);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p.contact_name as string | null]));

    const staff: AssignableStaffMember[] = (members ?? []).map((m) => {
      const uid = m.user_id as string;
      const raw = nameByUser.get(uid);
      const name = (raw?.trim() || "Staff") as string;
      return { userId: uid, name, role: String(m.role ?? "") };
    });

    const byId = new Map<string, AssignableStaffMember>();
    for (const s of staff) {
      if (!byId.has(s.userId)) byId.set(s.userId, s);
    }
    const unique = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ staff: unique });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to load staff." }, { status: 500 });
  }
}
