import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { logActivity } from "@/lib/store/activity";
import { ALERT_KINDS, parseAlertPrefs } from "@/lib/store/merchant-alert-prefs";
import { countMerchantDevices, getAlertPrefs, saveAlertPrefs } from "@/lib/store/merchant-alerts";
import { getPushPublicKey } from "@/lib/store/push";

/** GET /api/store/alerts?slug= — the shop's alert settings, and what's needed to turn on alerts on this device. Any member. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  const [prefs, yourDevices, teamDevices, { data: profile }] = await Promise.all([
    getAlertPrefs(access.tenantId),
    countMerchantDevices(access.tenantId, access.userId),
    countMerchantDevices(access.tenantId),
    resolved.service.schema("store").from("business_profile").select("business_email").eq("tenant_id", access.tenantId).maybeSingle(),
  ]);
  return NextResponse.json({
    prefs,
    canManage: capabilities.canManageSettings,
    pushPublicKey: getPushPublicKey(),
    yourDevices,
    teamDevices,
    // Where alert emails go: the shop's contact email (Store details).
    alertEmail: capabilities.canManageSettings ? ((profile?.business_email as string | null) ?? null) : null,
  });
}

const channels = z.object({ email: z.boolean(), push: z.boolean() });
const PrefsSchema = z.object(Object.fromEntries(ALERT_KINDS.map((k) => [k, channels])) as Record<(typeof ALERT_KINDS)[number], typeof channels>);

/** PATCH /api/store/alerts { slug, prefs } — owner or admin. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change the shop's alerts." }, { status: 403 });
  const parsed = PrefsSchema.safeParse(body?.prefs);
  if (!parsed.success) return NextResponse.json({ error: "Check the alert settings." }, { status: 400 });

  try {
    const prefs = parseAlertPrefs(parsed.data);
    await saveAlertPrefs(resolved.access.tenantId, prefs);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "alerts", action: "updated" });
    return NextResponse.json({ prefs });
  } catch (error) {
    console.error("[alerts] save failed", error);
    return NextResponse.json({ error: "We couldn't save your alert settings. Please try again." }, { status: 500 });
  }
}
