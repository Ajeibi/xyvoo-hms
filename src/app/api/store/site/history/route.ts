import { NextResponse } from "next/server";
import { z } from "zod";
import { discardSiteDraft, restoreSiteVersion } from "@/lib/store/site/data";
import { loadEditorState, resolveEditorRequest } from "@/lib/store/site/editor-api";

const Schema = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("discard") }),
  z.object({ slug: z.string().min(1), action: z.literal("restore"), version: z.number().int().positive() }),
]);

/**
 * POST /api/store/site/history — "discard" throws away unpublished changes;
 * "restore" copies an earlier published version into the draft for review.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveEditorRequest(body?.slug);
  if (resolved.error) return resolved.error;

  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    if (parsed.data.action === "discard") {
      await discardSiteDraft(resolved.access.tenantId);
    } else if (!(await restoreSiteVersion(resolved.access.tenantId, parsed.data.version))) {
      return NextResponse.json({ error: "That version doesn't exist." }, { status: 404 });
    }
    return NextResponse.json(await loadEditorState(resolved.access.tenantId, resolved.access.storeDisplayName, resolved.access.logoUrl));
  } catch (error) {
    console.error("[site/history]", error);
    return NextResponse.json({ error: "We couldn't do that just now. Please try again." }, { status: 500 });
  }
}
