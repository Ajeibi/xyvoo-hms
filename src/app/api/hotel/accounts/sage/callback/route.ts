import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { peekOAuthState, validateOAuthState } from "@/lib/hms/accounting-sync/state";
import { createSageDriver, loadSageConfig } from "@/lib/hms/accounting-sync/sage-accounting";
import { saveNewConnection } from "@/lib/hms/accounting-sync/connection";

/**
 * GET /api/hotel/accounts/sage/callback — Sage sends the user back here with ?code&state.
 * The state must be genuine, unexpired, and issued to THIS signed-in user for THIS hotel.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (slug: string | null, result: string) =>
    NextResponse.redirect(new URL(slug ? `/hms/${encodeURIComponent(slug)}/accounts/integrations?sage=${result}` : "/", req.url));

  const rawState = url.searchParams.get("state");
  const peek = peekOAuthState(rawState);
  if (!peek) return back(null, "invalid_state");

  const auth = await requireHotelApiMember(peek.slug);
  if ("error" in auth) return back(null, "invalid_state");
  const state = validateOAuthState(rawState, { tenantId: auth.tenant.id, userId: auth.user.id });
  if (!state) return back(peek.slug, "invalid_state");

  const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
  if (!caps.canManageIntegrations) return back(peek.slug, "forbidden");

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back(peek.slug, "denied");

  try {
    const driver = createSageDriver(loadSageConfig());
    const tokens = await driver.exchangeCode(code);
    const businesses = await driver.listBusinesses(tokens.accessToken);
    if (businesses.length === 0) return back(peek.slug, "no_business");

    const saved = await saveNewConnection(auth.service, {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      tokens,
      businesses,
      syncFrom: state.syncFrom,
    });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "accounting_sage_connected",
      entityType: "accounting_connection",
      entityId: "sage_accounting",
      after: { status: saved.status, syncFrom: state.syncFrom, businesses: businesses.length },
    });
    return back(peek.slug, saved.status === "connected" ? "connected" : "pick");
  } catch (e) {
    // Never log the code or tokens; only the error message from our own wrappers.
    console.error("[sage callback]", e instanceof Error ? e.message : "failed");
    return back(peek.slug, "error");
  }
}
