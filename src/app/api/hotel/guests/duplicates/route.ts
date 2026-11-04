import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { dismissDuplicate, listDuplicateCandidates, mergeGuests, undoGuestMerge } from "@/lib/hms/guest-merge";

const MergeSchema = z.object({
  slug: z.string().min(1),
  action: z.enum(["merge", "dismiss", "undo"]),
  keepId: z.string().uuid().optional(),
  otherId: z.string().uuid().optional(),
  mergeId: z.string().uuid().optional(),
});

/** GET /api/hotel/guests/duplicates?slug=: guests who are probably the same person. */
export async function GET(req: Request) {
  try {
    const auth = await requireGuestsApi(new URL(req.url).searchParams.get("slug") ?? "");
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json({ candidates: await listDuplicateCandidates(auth.service, auth.tenant.id) });
  } catch {
    return NextResponse.json({ error: "Could not look for duplicates." }, { status: 500 });
  }
}

/**
 * POST /api/hotel/guests/duplicates: merge two guests (keepId stays; otherId is folded into it, whether or
 * not they were suggested), say they are different people, or undo a merge. Managers only.
 */
export async function POST(req: Request) {
  try {
    const body = MergeSchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canManageGuests(auth.role, auth.departmentRole)) return NextResponse.json({ error: "Only a manager can merge guests." }, { status: 403 });

    if (body.action === "undo") {
      if (!body.mergeId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      const r = await undoGuestMerge(auth.service, { tenantId: auth.tenant.id, mergeId: body.mergeId, actorUserId: auth.user.id });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, restored: r.restored });
    }

    if (!body.keepId || !body.otherId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    if (body.action === "dismiss") {
      const r = await dismissDuplicate(auth.service, { tenantId: auth.tenant.id, a: body.keepId, b: body.otherId, actorUserId: auth.user.id });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    const r = await mergeGuests(auth.service, { tenantId: auth.tenant.id, keepId: body.keepId, dropId: body.otherId, actorUserId: auth.user.id });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, moved: r.moved });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not merge the guests." }, { status: 500 });
  }
}
