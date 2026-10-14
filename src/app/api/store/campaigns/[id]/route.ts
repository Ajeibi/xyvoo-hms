import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { campaignInputSchema } from "@/lib/store/campaigns";
import { CampaignError, deleteCampaign, updateCampaign } from "@/lib/store/campaigns-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can change email campaigns." }, { status: 403 });
const notFound = () => NextResponse.json({ error: "That campaign can't be found." }, { status: 404 });

function failure(error: unknown) {
  if (error instanceof CampaignError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
  console.error("[campaigns] failed", error);
  return NextResponse.json({ error: "We couldn't do that just now. Please try again." }, { status: 500 });
}

/** PUT /api/store/campaigns/:id { slug, subject, previewText, blocks, audience } — change a draft or scheduled campaign. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const parsed = campaignInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the campaign." }, { status: 400 });
  try {
    const campaign = await updateCampaign(resolved.access.tenantId, id, parsed.data);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "campaigns", action: "updated", targetId: id, targetLabel: campaign.subject });
    return NextResponse.json({ campaign });
  } catch (error) {
    return failure(error);
  }
}

/** DELETE /api/store/campaigns/:id?slug= */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  if (!z.string().uuid().safeParse(id).success) return notFound();
  try {
    const subject = await deleteCampaign(resolved.access.tenantId, id);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "campaigns", action: "deleted", targetId: id, targetLabel: subject });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
