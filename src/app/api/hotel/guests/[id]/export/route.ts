import { NextResponse } from "next/server";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { exportGuestData, logDataRequest } from "@/lib/hms/guest-consent";

/** GET /api/hotel/guests/:id/export?slug=: a copy of everything held on one guest (a data access request), as a JSON file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const auth = await requireGuestsApi(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const data = await exportGuestData(auth.service, auth.tenant.id, id);
    if (!data) return NextResponse.json({ error: "Guest not found." }, { status: 404 });

    const g = data.guest as { first_name: string; last_name: string };
    await logDataRequest(auth.service, {
      tenantId: auth.tenant.id,
      guestId: id,
      guestName: `${g.first_name} ${g.last_name}`.trim(),
      kind: "access",
      actorUserId: auth.user.id,
    });

    const file = `guest-data-${`${g.first_name}-${g.last_name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not export the guest's data." }, { status: 500 });
  }
}
