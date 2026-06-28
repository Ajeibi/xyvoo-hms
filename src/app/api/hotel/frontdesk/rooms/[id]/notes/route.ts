import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const PostSchema = z.object({
  slug: z.string().min(1),
  body: z.string().min(1).max(2000),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  noteId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("room_unit_notes")
      .insert({
        tenant_id: auth.tenant.id,
        room_unit_id: id,
        body: body.body,
        author_user_id: auth.user.id,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_note_added",
      entityType: "room_unit",
      entityId: id,
      after: { noteId: data.id },
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save note." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await auth.service
      .schema("hotel")
      .from("room_unit_notes")
      .update({ body: body.body, updated_at: new Date().toISOString() })
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", id)
      .eq("id", body.noteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update note." }, { status: 500 });
  }
}
