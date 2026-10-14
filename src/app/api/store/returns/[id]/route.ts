import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { returnDecisionSchema } from "@/lib/store/returns";
import { decideReturn, ReturnError } from "@/lib/store/returns-server";

/** POST /api/store/returns/:id { slug, action, message? } — approve, decline, receive, complete or cancel a return. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "That return can't be found." }, { status: 404 });
  const parsed = returnDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  try {
    const result = await decideReturn(resolved.access.tenantId, id, parsed.data.action, parsed.data.message);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "returns", action: parsed.data.action, targetId: id, targetLabel: result.orderRef });
    return NextResponse.json({ status: result.status });
  } catch (error) {
    if (error instanceof ReturnError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    console.error("[returns] decide failed", error);
    return NextResponse.json({ error: "We couldn't do that just now. Please try again." }, { status: 500 });
  }
}
