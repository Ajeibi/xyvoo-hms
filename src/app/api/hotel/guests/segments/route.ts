import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { deleteSegment, saveSegment, summariseSegments } from "@/lib/hms/guest-segments";

const SaveSchema = z.object({ slug: z.string().min(1), name: z.string().trim().min(1).max(80), rules: z.record(z.string(), z.unknown()) });

/** GET /api/hotel/guests/segments?slug=: every segment with its current head count. */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const auth = await requireGuestsApi(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(await summariseSegments(auth.service, auth.tenant.id));
  } catch {
    return NextResponse.json({ error: "Could not load segments." }, { status: 500 });
  }
}

/** POST /api/hotel/guests/segments: save a segment the hotel built. */
export async function POST(req: Request) {
  try {
    const body = SaveSchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const result = await saveSegment(auth.service, { tenantId: auth.tenant.id, actorUserId: auth.user.id, name: body.name, rules: body.rules });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not save the segment." }, { status: 500 });
  }
}

/** DELETE /api/hotel/guests/segments?slug=&id=: remove a saved segment. */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const auth = await requireGuestsApi(url.searchParams.get("slug") ?? "");
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    const result = await deleteSegment(auth.service, { tenantId: auth.tenant.id, actorUserId: auth.user.id, id });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not delete the segment." }, { status: 500 });
  }
}
