import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { loadGroups, membersReadyToCheckIn } from "@/lib/hms/frontdesk-groups";
import { POST as checkInOne } from "@/app/api/hotel/frontdesk/arrivals/[id]/check-in/route";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const BodySchema = z.object({ slug: z.string().min(1) });

/**
 * Checks in every room of the group that is waiting and has a room, one after another, through
 * the same code as a single check-in so each room gets its bill, deposits and alerts the same way.
 * A room that can't be checked in (say, it isn't clean yet) is reported and the rest carry on.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const [group] = await loadGroups(auth.service, auth.tenant.id, id);
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    const ready = membersReadyToCheckIn(group.members);
    const skipped = group.members.filter((m) => m.status === "confirmed" && !m.roomUnitId);
    if (ready.length === 0) {
      return NextResponse.json(
        { error: skipped.length > 0 ? "Give each room in the group a room number first." : "Nobody in this group is waiting to check in." },
        { status: 409 },
      );
    }

    const results: { reservationId: string; confirmationCode: string; roomCode: string | null; ok: boolean; error?: string }[] = [];
    for (const m of ready) {
      const inner = new Request(req.url, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({ slug: body.slug, checkedInByUserId: auth.user.id }),
      });
      const res = await checkInOne(inner, { params: Promise.resolve({ id: m.reservationId }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      results.push({
        reservationId: m.reservationId,
        confirmationCode: m.confirmationCode,
        roomCode: m.roomCode,
        ok: res.ok,
        ...(res.ok ? {} : { error: json.error ?? "Could not check in." }),
      });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "group_check_in",
      entityType: "group_booking",
      entityId: id,
      after: {
        name: group.name,
        checked_in: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        without_room: skipped.length,
      },
    });
    return NextResponse.json({
      ok: true,
      checkedIn: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      withoutRoom: skipped.map((m) => m.confirmationCode),
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[group check-in]", e);
    return NextResponse.json({ error: "Group check-in failed." }, { status: 500 });
  }
}
