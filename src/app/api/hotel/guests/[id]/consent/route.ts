import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { CONSENT_CHANNELS } from "@/lib/hms/guest-consent-shared";
import { getGuestConsent, setGuestConsent, signUnsubscribeToken } from "@/lib/hms/guest-consent";

const BodySchema = z.object({
  slug: z.string().min(1),
  channel: z.enum(CONSENT_CHANNELS),
  granted: z.boolean(),
  note: z.string().max(300).optional().nullable(),
});

/** GET /api/hotel/guests/:id/consent?slug=: current consent, its history, and the guest's unsubscribe link. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const auth = await requireGuestsApi(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const consent = await getGuestConsent(auth.service, auth.tenant.id, id);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ ...consent, unsubscribeUrl: `${origin}/unsubscribe/${signUnsubscribeToken(auth.tenant.id, id)}` });
  } catch {
    return NextResponse.json({ error: "Could not load consent." }, { status: 500 });
  }
}

/** PUT /api/hotel/guests/:id/consent: record that a guest agreed to, or stopped, marketing on one channel. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await setGuestConsent(auth.service, {
      tenantId: auth.tenant.id,
      guestId: id,
      channel: body.channel,
      granted: body.granted,
      source: "desk",
      note: body.note,
      actorUserId: auth.user.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await getGuestConsent(auth.service, auth.tenant.id, id)) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not save consent." }, { status: 500 });
  }
}
