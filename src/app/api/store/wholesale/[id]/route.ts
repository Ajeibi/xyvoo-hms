import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { tradeDecisionSchema } from "@/lib/store/wholesale";
import { decideTrade, TradeError } from "@/lib/store/wholesale-server";

/** POST /api/store/wholesale/:accountId { slug, action, message? } — approve, decline or take away a trade account. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can manage trade accounts." }, { status: 403 });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "That account can't be found." }, { status: 404 });
  const parsed = tradeDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  try {
    const status = await decideTrade(resolved.access.tenantId, id, parsed.data.action, parsed.data.message);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "wholesale", action: parsed.data.action, targetId: id });
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof TradeError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    console.error("[wholesale] decide failed", error);
    return NextResponse.json({ error: "We couldn't do that just now. Please try again." }, { status: 500 });
  }
}
