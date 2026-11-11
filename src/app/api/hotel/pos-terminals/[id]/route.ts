import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";

const PatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can manage card machines." }, { status: 403 });
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    const { error } = await auth.service.schema("hotel").from("pos_terminals").update(update).eq("tenant_id", auth.tenant.id).eq("id", id);
    if (error) return NextResponse.json({ error: error.code === "23505" ? "You already have a card machine with that name." : error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

/** Past payments keep the machine's name, so removing one never changes an old receipt. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const slug = z.string().min(1).parse(new URL(req.url).searchParams.get("slug"));
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can manage card machines." }, { status: 403 });
    const { error } = await auth.service.schema("hotel").from("pos_terminals").delete().eq("tenant_id", auth.tenant.id).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
