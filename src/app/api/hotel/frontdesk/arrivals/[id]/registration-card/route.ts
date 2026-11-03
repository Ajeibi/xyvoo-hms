import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { decodeSignature } from "@/lib/hms/online-checkin";
import { createRegistrationCard, listRegistrationCards, loadOnlineSignature } from "@/lib/hms/registration-card";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const SignSchema = z.object({
  slug: z.string().min(1),
  /** Sign on this device: a PNG from the signature box. Leave out to use the guest's online signature. */
  signature: z.string().optional(),
  signedBy: z.string().trim().max(120).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [cards, online] = await Promise.all([
      listRegistrationCards(auth.service, auth.tenant.id, id),
      loadOnlineSignature(auth.service, auth.tenant.id, id),
    ]);
    return NextResponse.json({ cards, hasOnlineSignature: online !== null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = SignSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    let signature: Uint8Array | null = null;
    let signedBy = body.signedBy ?? "";
    let source: "online" | "desk" = "desk";
    if (body.signature) {
      signature = decodeSignature(body.signature);
      if (!signature) return NextResponse.json({ error: "Please sign in the box." }, { status: 400 });
      if (!signedBy) return NextResponse.json({ error: "Write the name of the person signing." }, { status: 400 });
    } else {
      const online = await loadOnlineSignature(auth.service, auth.tenant.id, id);
      if (!online) return NextResponse.json({ error: "This guest has not signed online." }, { status: 404 });
      signature = online.bytes;
      signedBy = signedBy || online.signedBy;
      source = "online";
    }

    const made = await createRegistrationCard(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: id,
      signature,
      signedBy,
      source,
      userId: auth.user.id,
    });
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "registration_card_signed",
      entityType: "reservation",
      entityId: id,
      after: { card_id: made.id, signedBy, source },
    });
    return NextResponse.json({ ok: true, id: made.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[registration-card POST]", e);
    return NextResponse.json({ error: "Failed to make the card." }, { status: 500 });
  }
}
