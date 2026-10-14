import { after, NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { scheduleError } from "@/lib/store/campaigns";
import { CampaignError, kickCampaigns, startCampaign } from "@/lib/store/campaigns-server";

/** POST /api/store/campaigns/:id/send { slug, scheduledAt? } — send now, or at a time in the future. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can send email campaigns." }, { status: 403 });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "That campaign can't be found." }, { status: 404 });

  const scheduledAt = typeof body?.scheduledAt === "string" && body.scheduledAt ? body.scheduledAt : null;
  const problem = scheduleError(scheduledAt, new Date());
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const result = await startCampaign(resolved.access.tenantId, id, scheduledAt);
    await logActivity({
      tenantId: resolved.access.tenantId,
      actor: resolved.access,
      area: "campaigns",
      action: result.status === "scheduled" ? "scheduled" : "sent",
      targetId: id,
      targetLabel: `${result.recipients} ${result.recipients === 1 ? "person" : "people"}`,
    });
    if (result.status === "sending") after(() => kickCampaigns());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CampaignError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    console.error("[campaigns] send failed", error);
    return NextResponse.json({ error: "We couldn't start sending just now. Please try again." }, { status: 500 });
  }
}
