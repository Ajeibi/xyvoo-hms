import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";

const PatchSchema = z.object({
  slug: z.string().min(1),
  label: z.string().trim().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Rename or switch a custom option on or off. The stored key never changes, so old stays keep their
 * value and simply show the new name. There is no delete: switching off is how a hotel retires one,
 * and the built-in choices are not in this table at all.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change these lists." }, { status: 403 });
    const update: Record<string, unknown> = {};
    if (body.label !== undefined) update.label = body.label;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    const { error } = await auth.service.schema("hotel").from("booking_options").update(update).eq("tenant_id", auth.tenant.id).eq("id", id);
    if (error) return NextResponse.json({ error: error.code === "23505" ? "You already have one with that name." : error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
