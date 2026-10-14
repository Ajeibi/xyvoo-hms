import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { cancelCampaign, CampaignError } from "@/lib/store/campaigns-server";

/** POST /api/store/campaigns/:id/cancel { slug } — stop a scheduled or part-sent campaign. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change email campaigns." }, { status: 403 });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "That campaign can't be found." }, { status: 404 });
  try {
    await cancelCampaign(resolved.access.tenantId, id);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "campaigns", action: "stopped", targetId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CampaignError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    console.error("[campaigns] cancel failed", error);
    return NextResponse.json({ error: "We couldn't stop that campaign. Please try again." }, { status: 500 });
  }
}
