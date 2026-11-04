import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationsApi } from "@/lib/hms/reservations-api";
import { listReservationEmails, sendReservationEmail } from "@/lib/hms/reservation-emails";

/** GET — the emails sent for a booking. POST — send one again (confirmation, change notice or cancellation). */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const auth = await requireReservationsApi(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ emails: await listReservationEmails(auth.service, auth.tenant.id, id) });
}

const Body = z.object({ slug: z.string().min(1), kind: z.enum(["confirmation", "change", "cancellation"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = Body.parse(await req.json());
    const auth = await requireReservationsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: r } = await auth.service.schema("hotel").from("reservations").select("status").eq("tenant_id", auth.tenant.id).eq("id", id).maybeSingle();
    if (!r) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (body.kind === "cancellation" && r.status !== "cancelled") return NextResponse.json({ error: "This booking isn't cancelled." }, { status: 400 });
    if (body.kind !== "cancellation" && r.status === "cancelled") return NextResponse.json({ error: "This booking is cancelled. Send the cancellation notice instead." }, { status: 400 });

    const sent = await sendReservationEmail(auth.service, { tenantId: auth.tenant.id, reservationId: id, kind: body.kind, userId: auth.user.id, force: true });
    if (sent.status !== "sent") return NextResponse.json({ error: sent.reason ?? "The email wasn't sent." }, { status: 400 });
    return NextResponse.json({ ok: true, to: sent.to ?? null, emails: await listReservationEmails(auth.service, auth.tenant.id, id) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "The email couldn't be sent." }, { status: 500 });
  }
}
