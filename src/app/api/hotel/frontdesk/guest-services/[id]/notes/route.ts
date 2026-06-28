import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { appendGuestRequestEvent } from "@/lib/hms/guest-services";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";

const PostBody = z.object({
  slug: z.string().min(1),
  body: z.string().min(1).max(2000),
  visibility: z.enum(["front_desk", "department", "manager"]).default("front_desk"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities(auth.role);
    if (!caps.canUpdate) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    if (body.visibility === "manager" && !caps.canViewManagerNotes) {
      return NextResponse.json({ error: "Manager visibility not allowed." }, { status: 403 });
    }

    const { data: row } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("department")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (caps.departmentScope && (row.department as string) !== caps.departmentScope) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { data: ins, error } = await auth.service
      .schema("hotel")
      .from("guest_request_notes")
      .insert({
        tenant_id: auth.tenant.id,
        guest_request_id: id,
        body: body.body,
        visibility: body.visibility,
        author_user_id: auth.user.id,
      })
      .select("id,created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await appendGuestRequestEvent(auth.service, {
      tenantId: auth.tenant.id,
      guestRequestId: id,
      action: "note_added",
      payload: { noteId: ins.id },
      actorUserId: auth.user.id,
    });

    return NextResponse.json({ ok: true, id: ins.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to add note." }, { status: 500 });
  }
}
