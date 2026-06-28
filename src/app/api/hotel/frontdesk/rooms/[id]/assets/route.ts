import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const PostSchema = z.object({
  slug: z.string().min(1),
  assetType: z.enum(["tv", "minibar", "safe", "phone", "ac", "other"]).default("other"),
  label: z.string().min(1).max(120),
  serialNumber: z.string().max(80).optional(),
  condition: z.enum(["good", "fair", "poor", "missing", "replaced"]).default("good"),
  notes: z.string().max(500).optional(),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  assetId: z.string().uuid(),
  label: z.string().min(1).max(120).optional(),
  condition: z.enum(["good", "fair", "poor", "missing", "replaced"]).optional(),
  notes: z.string().max(500).optional(),
});

const DeleteSchema = z.object({
  slug: z.string().min(1),
  assetId: z.string().uuid(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("room_unit_assets")
      .select("*")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", id)
      .order("asset_type");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      assets: (data ?? []).map((a) => ({
        id: a.id,
        assetType: a.asset_type,
        label: a.label,
        serialNumber: a.serial_number,
        condition: a.condition,
        lastInspectedAt: a.last_inspected_at,
        notes: a.notes,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load assets." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canEditNotes) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { data, error } = await auth.service
      .schema("hotel")
      .from("room_unit_assets")
      .insert({
        tenant_id: auth.tenant.id,
        room_unit_id: id,
        asset_type: body.assetType,
        label: body.label,
        serial_number: body.serialNumber ?? null,
        condition: body.condition,
        notes: body.notes ?? null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to add asset." }, { status: 500 });
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

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label) updates.label = body.label;
    if (body.condition) updates.condition = body.condition;
    if (body.notes !== undefined) updates.notes = body.notes;

    const { error } = await auth.service
      .schema("hotel")
      .from("room_unit_assets")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", id)
      .eq("id", body.assetId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update asset." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = DeleteSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await auth.service
      .schema("hotel")
      .from("room_unit_assets")
      .delete()
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", id)
      .eq("id", body.assetId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete asset." }, { status: 500 });
  }
}
