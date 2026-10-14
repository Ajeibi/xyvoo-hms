import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { campaignInputSchema, DAILY_SEND_LIMIT } from "@/lib/store/campaigns";
import { createCampaign, listCampaigns, resolveAudience } from "@/lib/store/campaigns-server";
import { listCustomerGroups } from "@/lib/store/customer-groups-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can send email campaigns." }, { status: 403 });

/** GET /api/store/campaigns?slug= — every campaign with how it did, and who could receive one. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const tenantId = resolved.access.tenantId;
  try {
    const [campaigns, groups, everyone, { data: profile }] = await Promise.all([
      listCampaigns(tenantId),
      listCustomerGroups(tenantId).catch(() => []),
      resolveAudience(tenantId, { type: "everyone" }).catch(() => []),
      resolved.service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    const productIds = [...new Set(campaigns.flatMap((c) => c.blocks.flatMap((b) => (b.type === "product" ? [b.productId] : []))))];
    const { data: products } = productIds.length ? await resolved.service.schema("store").from("products").select("id, name").eq("tenant_id", tenantId).in("id", productIds) : { data: [] };
    return NextResponse.json({
      productNames: Object.fromEntries((products || []).map((p) => [p.id as string, p.name as string])),
      campaigns,
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
      subscribers: everyone.length,
      dailyLimit: DAILY_SEND_LIMIT,
      currency: profile?.currency_code || "NGN",
    });
  } catch (error) {
    console.error("[campaigns] list failed", error);
    return NextResponse.json({ error: "We couldn't load your campaigns just now." }, { status: 500 });
  }
}

/** POST /api/store/campaigns { slug, subject, previewText, blocks, audience } — save a new draft. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = campaignInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the campaign." }, { status: 400 });
  try {
    const campaign = await createCampaign(resolved.access.tenantId, resolved.access.userId, parsed.data);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "campaigns", action: "created", targetId: campaign.id, targetLabel: campaign.subject });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("[campaigns] create failed", error);
    return NextResponse.json({ error: "We couldn't save that campaign. Please try again." }, { status: 500 });
  }
}
