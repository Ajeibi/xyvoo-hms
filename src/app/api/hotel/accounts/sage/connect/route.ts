import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createOAuthState } from "@/lib/hms/accounting-sync/state";
import { buildAuthorizeUrl, loadSageConfig } from "@/lib/hms/accounting-sync/sage-accounting";

/**
 * GET /api/hotel/accounts/sage/connect?slug=…&syncFrom=YYYY-MM-DD — owner/admin only.
 * Sends the browser to Sage with a signed, 10-minute `state` bound to this hotel and this user.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
  if (!caps.canManageIntegrations) return NextResponse.json({ error: "Only the owner or an admin can connect Sage." }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const asked = url.searchParams.get("syncFrom") ?? "";
  const syncFrom = /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(asked)) ? asked : `${today.slice(0, 7)}-01`;

  try {
    const config = loadSageConfig();
    const state = createOAuthState({ tenantId: auth.tenant.id, userId: auth.user.id, slug, syncFrom });
    return NextResponse.redirect(buildAuthorizeUrl(config, state, url.searchParams.get("country")));
  } catch (e) {
    console.error("[sage connect]", e instanceof Error ? e.message : "failed");
    return NextResponse.redirect(new URL(`/hms/${encodeURIComponent(slug)}/accounts/integrations?sage=not_configured`, req.url));
  }
}
