import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const PostSchema = z.object({
  slug: z.string().min(1),
  body: z.string().min(1).max(2000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  id: z.string().uuid(),
  resolved: z.boolean().optional(),
  body: z.string().min(1).max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("shift_notes")
      .insert({
        tenant_id: auth.tenant.id,
        author_user_id: auth.user.id,
        body: body.body,
        priority: body.priority,
      })
      .select("id")
      .single();

    if (error || !data) return NextResponse.json({ error: "Could not save note." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "shift_note_created",
      entityType: "shift_note",
      entityId: data.id,
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const patch: Record<string, unknown> = {};
    if (body.resolved !== undefined) {
      patch.resolved_at = body.resolved ? new Date().toISOString() : null;
    }
    if (body.body !== undefined) patch.body = body.body;

    const { error } = await auth.service
      .schema("hotel")
      .from("shift_notes")
      .update(patch)
      .eq("id", body.id)
      .eq("tenant_id", auth.tenant.id);

    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "shift_note_updated",
      entityType: "shift_note",
      entityId: body.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
