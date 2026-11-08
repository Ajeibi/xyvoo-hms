import { NextResponse } from "next/server";
import { z } from "zod";
import { authMaintenance, fail, isFailure } from "@/lib/hms/maintenance-api";
import { issuePart, returnPart } from "@/lib/hms/maintenance-parts";

const Post = z.object({
  slug: z.string().min(1),
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  qty: z.number().positive().max(100000),
});
const Delete = z.object({ slug: z.string().min(1), partId: z.string().uuid() });

/** POST: take a part out of stock for this work order. DELETE: put an unused part back. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = Post.parse(await req.json());
    const a = await authMaintenance(body.slug, "canManage");
    if (isFailure(a)) return a;
    const r = await issuePart(a.auth.service, a.auth.tenant.id, id, body, a.actor);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not issue the part.", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = Delete.parse(await req.json());
    const a = await authMaintenance(body.slug, "canManage");
    if (isFailure(a)) return a;
    const r = await returnPart(a.auth.service, a.auth.tenant.id, body.partId, a.actor);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not return the part.", 500);
  }
}
