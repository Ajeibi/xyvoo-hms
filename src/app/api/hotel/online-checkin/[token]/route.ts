import { NextResponse } from "next/server";
import { z } from "zod";
import { phoneCountry } from "@/lib/hms/folio-invoice-link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { emitNotification, writeAuditLog } from "@/lib/hms/front-desk-ops";
import {
  ARRIVAL_TIMES,
  decodeSignature,
  loadCheckInSettings,
  loadGuestStayView,
  loadOnlineCheckIn,
  submitOnlineCheckIn,
  verifyCheckInToken,
} from "@/lib/hms/online-checkin";

/*
 * The guest's online check-in. No sign-in: the signed link names one stay and runs out after 30
 * days. Everything it can do is limited to that stay.
 */

const EXPIRED = { error: "This link has expired or isn't right. Ask the hotel to send it again." };
const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };

const AnswerSchema = z.object({
  phone: z.string().trim().min(6, "Enter a phone number we can reach you on.").max(30),
  email: z.string().trim().email("That email doesn't look right.").max(200).nullable().optional().default(null),
  nationality: z
    .string()
    .trim()
    .length(2, "Choose your country.")
    .transform((v) => v.toUpperCase()),
  arrivalTime: z.enum(ARRIVAL_TIMES).nullable().optional().default(null),
  requests: z.string().trim().max(500).nullable().optional().default(null),
  agreed: z.literal(true, { error: "Please confirm that your details are right." }),
  signature: z.string(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = verifyCheckInToken(token);
  if (!link) return NextResponse.json(EXPIRED, { status: 404, headers: NO_STORE });
  const db = createServerSupabaseClient();
  const stay = await loadGuestStayView(db, link.tenantId, link.reservationId);
  if (!stay) return NextResponse.json(EXPIRED, { status: 404, headers: NO_STORE });
  const done = await loadOnlineCheckIn(db, link.tenantId, link.reservationId);
  const settings = await loadCheckInSettings(db, link.tenantId);
  const { data: profile } = await db.schema("hotel").from("profiles").select("country").eq("tenant_id", link.tenantId).not("country", "is", null).limit(1).maybeSingle();
  return NextResponse.json(
    {
      hotel: stay.hotel,
      confirmationCode: stay.confirmationCode,
      status: stay.status,
      arrivalAt: stay.arrivalAt,
      departureAt: stay.departureAt,
      nights: stay.nights,
      adults: stay.adults,
      roomTypeCode: stay.roomTypeCode,
      guest: stay.guest,
      depositDue: stay.depositDue,
      idRequired: stay.idRequired,
      idPolicy: settings.idPolicy,
      hotelCountry: phoneCountry(typeof profile?.country === "string" ? profile.country : null),
      idPhotos: stay.idPhotos,
      completed: done.status === "completed",
    },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = verifyCheckInToken(token);
    if (!link) return NextResponse.json(EXPIRED, { status: 404, headers: NO_STORE });
    const body = AnswerSchema.parse(await req.json());
    const signature = decodeSignature(body.signature);
    if (!signature) return NextResponse.json({ error: "Please sign in the box." }, { status: 400, headers: NO_STORE });

    const db = createServerSupabaseClient();
    const saved = await submitOnlineCheckIn(db, {
      tenantId: link.tenantId,
      reservationId: link.reservationId,
      answers: {
        phone: body.phone,
        email: body.email || null,
        nationality: body.nationality,
        arrivalTime: body.arrivalTime,
        requests: body.requests || null,
        signature,
      },
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409, headers: NO_STORE });

    await writeAuditLog({
      tenantId: link.tenantId,
      actorUserId: null,
      action: "online_checkin_completed",
      entityType: "reservation",
      entityId: link.reservationId,
      after: { guest: saved.guestName },
    });
    await emitNotification({
      tenantId: link.tenantId,
      type: "online_checkin_completed",
      title: "Guest checked in online",
      body: `${saved.guestName} confirmed their details and signed.`,
      severity: "info",
      entityType: "reservation",
      entityId: link.reservationId,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check your answers." }, { status: 400, headers: NO_STORE });
    console.error("[online check-in POST]", e);
    return NextResponse.json({ error: "Could not save your check-in." }, { status: 500, headers: NO_STORE });
  }
}
