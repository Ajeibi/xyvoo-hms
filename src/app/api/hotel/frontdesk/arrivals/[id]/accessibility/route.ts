import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { emitNotification, writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import {
  ACCESSIBILITY_FLAGS,
  cleanFlags,
  flagsSummary,
  loadStayAccessibility,
  mergeFlags,
} from "@/lib/hms/accessibility-flags";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const SaveSchema = z.object({
  slug: z.string().min(1),
  flags: z.array(z.enum(ACCESSIBILITY_FLAGS)).max(ACCESSIBILITY_FLAGS.length),
  /** Also keep the flags on the guest's profile, so their next stay starts with them. */
  rememberForGuest: z.boolean().default(false),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const a = await loadStayAccessibility(auth.service, auth.tenant.id, id);
    return NextResponse.json({ ...a, flags: mergeFlags(a.stayFlags, a.guestFlags) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = SaveSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: resRow } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,status,room_unit_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();
    if (!resRow) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    const before = await loadStayAccessibility(auth.service, auth.tenant.id, id);
    const flags = cleanFlags(body.flags);
    const { error } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update({ accessibility_flags: flags })
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);
    if (error) {
      console.error("[accessibility PUT]", error.message);
      return NextResponse.json({ error: "Could not save. The accessibility update may not have been run yet." }, { status: 500 });
    }

    if (body.rememberForGuest && before.guestId) {
      await auth.service.schema("hotel").from("guests").update({ accessibility_flags: flags }).eq("tenant_id", auth.tenant.id).eq("id", before.guestId);
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "accessibility_flags_set",
      entityType: "reservation",
      entityId: id,
      before: { flags: before.stayFlags },
      after: { flags, rememberedForGuest: body.rememberForGuest },
    });

    // Housekeeping prepares the room, so tell them when a flag is added for a room-holding stay.
    const added = flags.filter((f) => !before.stayFlags.includes(f));
    if (added.length > 0 && ["confirmed", "checked_in"].includes(resRow.status as string)) {
      let roomCode: string | null = null;
      if (resRow.room_unit_id) {
        const { data: unit } = await auth.service.schema("hotel").from("room_units").select("room_code").eq("id", resRow.room_unit_id).maybeSingle();
        roomCode = (unit?.room_code as string | undefined) ?? null;
      }
      await emitNotification({
        tenantId: auth.tenant.id,
        type: "accessibility_needs",
        title: "Guest with accessibility needs",
        body: `${roomCode ? `Room ${roomCode}` : "An arriving guest"}: ${flagsSummary(flags)}`,
        severity: "info",
        entityType: "reservation",
        entityId: id,
        department: "housekeeping",
      });
    }
    return NextResponse.json({ ok: true, flags });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[accessibility PUT]", e);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
