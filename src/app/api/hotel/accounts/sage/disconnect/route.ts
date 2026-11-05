import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { markDisconnected } from "@/lib/hms/accounting-sync/connection";
import { skipOpenRows } from "@/lib/hms/accounting-sync/queue";
import { createSageDriver, loadSageConfig } from "@/lib/hms/accounting-sync/sage-accounting";

const Body = z.object({ slug: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageIntegrations) return NextResponse.json({ error: "Only the owner or an admin can disconnect Sage." }, { status: 403 });

    const refresh = await markDisconnected(auth.service, auth.tenant.id);
    await skipOpenRows(auth.service, auth.tenant.id, "Sage was disconnected");
    if (refresh) {
      // Best effort: the local tokens are already gone either way.
      try {
        await createSageDriver(loadSageConfig()).revoke(refresh);
      } catch {
        /* ignore */
      }
    }
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "accounting_sage_disconnected",
      entityType: "accounting_connection",
      entityId: "sage_accounting",
      after: { status: "disconnected" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[sage disconnect]", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Failed to disconnect." }, { status: 500 });
  }
}
