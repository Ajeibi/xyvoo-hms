import { NextResponse } from "next/server";
import { loadEditorState, resolveEditorRequest } from "@/lib/store/site/editor-api";

/** GET /api/store/site?slug= — the website editor's state. */
export async function GET(req: Request) {
  const resolved = await resolveEditorRequest(new URL(req.url).searchParams.get("slug"));
  if (resolved.error) return resolved.error;
  try {
    return NextResponse.json(await loadEditorState(resolved.access.tenantId, resolved.access.storeDisplayName, resolved.access.logoUrl));
  } catch (error) {
    console.error("[site] load failed", error);
    return NextResponse.json({ error: "We couldn't load your website settings." }, { status: 500 });
  }
}
