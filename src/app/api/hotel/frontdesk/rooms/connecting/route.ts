import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: links } = await auth.service
      .schema("hotel")
      .from("room_connecting_links")
      .select("id,room_unit_id_a,room_unit_id_b,created_at")
      .eq("tenant_id", auth.tenant.id);

    const roomIds = new Set<string>();
    for (const l of links ?? []) {
      roomIds.add(l.room_unit_id_a);
      roomIds.add(l.room_unit_id_b);
    }

    const { data: rooms } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,floor")
      .eq("tenant_id", auth.tenant.id)
      .in("id", [...roomIds]);

    const codeById = new Map((rooms ?? []).map((r) => [r.id, r]));

    return NextResponse.json({
      links: (links ?? []).map((l) => ({
        id: l.id,
        roomA: codeById.get(l.room_unit_id_a),
        roomB: codeById.get(l.room_unit_id_b),
        createdAt: l.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load links." }, { status: 500 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  roomUnitIdA: z.string().uuid(),
  roomUnitIdB: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canManageConnecting) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    if (body.roomUnitIdA === body.roomUnitIdB) {
      return NextResponse.json({ error: "Cannot link a room to itself." }, { status: 400 });
    }

    const [a, b] =
      body.roomUnitIdA < body.roomUnitIdB
        ? [body.roomUnitIdA, body.roomUnitIdB]
        : [body.roomUnitIdB, body.roomUnitIdA];

    const { data, error } = await auth.service
      .schema("hotel")
      .from("room_connecting_links")
      .insert({
        tenant_id: auth.tenant.id,
        room_unit_id_a: a,
        room_unit_id_b: b,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: codes } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .in("id", [a, b]);

    const codeA = codes?.find((c) => c.id === a)?.room_code ?? a;
    const codeB = codes?.find((c) => c.id === b)?.room_code ?? b;

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "connecting_linked",
      entityType: "room_unit",
      entityId: a,
      after: { linkId: data.id, pairedWith: b },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "connecting_linked",
      title: "Connecting rooms linked",
      body: `Rooms ${codeA} and ${codeB} are now linked.`,
      severity: "info",
      entityType: "room_unit",
      entityId: a,
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Link failed." }, { status: 500 });
  }
}

const DeleteSchema = z.object({
  slug: z.string().min(1),
  linkId: z.string().uuid(),
});

export async function DELETE(req: Request) {
  try {
    const body = DeleteSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canManageConnecting) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { data: link } = await auth.service
      .schema("hotel")
      .from("room_connecting_links")
      .select("id,room_unit_id_a,room_unit_id_b")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.linkId)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "Link not found." }, { status: 404 });
    }

    const { data: codes } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .in("id", [link.room_unit_id_a, link.room_unit_id_b]);

    const codeA = codes?.find((c) => c.id === link.room_unit_id_a)?.room_code ?? link.room_unit_id_a;
    const codeB = codes?.find((c) => c.id === link.room_unit_id_b)?.room_code ?? link.room_unit_id_b;

    await auth.service
      .schema("hotel")
      .from("room_connecting_links")
      .delete()
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.linkId);

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "connecting_unlinked",
      entityType: "room_unit",
      entityId: link.room_unit_id_a,
      after: { linkId: link.id, pairedWith: link.room_unit_id_b },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "connecting_unlinked",
      title: "Connecting rooms unlinked",
      body: `Rooms ${codeA} and ${codeB} are no longer linked.`,
      severity: "info",
      entityType: "room_unit",
      entityId: link.room_unit_id_a,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
}
