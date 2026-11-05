import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { chooseBusiness, createTokenStore, getConnectionRow, setSyncFrom, toPublicConnection } from "@/lib/hms/accounting-sync/connection";
import { DriverError } from "@/lib/hms/accounting-sync/driver";
import { loadAccountMap, saveAccountMap } from "@/lib/hms/accounting-sync/mapping";
import { listQueue, queueCounts, queueExistingJournals, requeueUnmapped, retryRows, type QueueStatus } from "@/lib/hms/accounting-sync/queue";
import { createSageDriver, loadSageConfig } from "@/lib/hms/accounting-sync/sage-accounting";
import { ensureAccessToken } from "@/lib/hms/accounting-sync/tokens";
import { runSyncForTenant } from "@/lib/hms/accounting-sync/worker";

export const maxDuration = 60;

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const PostBody = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("choose_business"), businessId: z.string().min(1) }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("save_mapping"),
    rows: z.array(z.object({ accountCode: z.string().min(1).max(40), externalAccountId: z.string().max(100), externalAccountName: z.string().max(200) })).max(2000),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("set_sync_from"), syncFrom: DateSchema }),
  z.object({ slug: z.string().min(1), action: z.literal("queue_existing") }),
  z.object({ slug: z.string().min(1), action: z.literal("sync_now") }),
  z.object({ slug: z.string().min(1), action: z.literal("retry"), id: z.string().uuid().optional() }),
]);

const STATUSES: QueueStatus[] = ["pending", "sent", "failed", "skipped"];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    if (url.searchParams.get("sageAccounts")) {
      if (!caps.canManageIntegrations) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const conn = await getConnectionRow(auth.service, auth.tenant.id);
      if (!conn || conn.status !== "connected" || !conn.external_business_id) {
        return NextResponse.json({ error: "Sage is not connected." }, { status: 409 });
      }
      const driver = createSageDriver(loadSageConfig());
      try {
        const accessToken = await ensureAccessToken(createTokenStore(auth.service, auth.tenant.id), driver);
        const accounts = await driver.listAccounts({ accessToken, businessId: conn.external_business_id });
        return NextResponse.json({ accounts });
      } catch (e) {
        if (e instanceof DriverError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.kind === "auth" ? 409 : 502 });
        throw e;
      }
    }

    const status = url.searchParams.get("status") as QueueStatus | null;
    const [row, counts, queue, mapping, chart] = await Promise.all([
      getConnectionRow(auth.service, auth.tenant.id),
      queueCounts(auth.service, auth.tenant.id),
      listQueue(auth.service, auth.tenant.id, { status: status && STATUSES.includes(status) ? status : null }),
      loadAccountMap(auth.service, auth.tenant.id),
      auth.service.schema("hotel").from("chart_of_accounts").select("code,name,type").eq("tenant_id", auth.tenant.id).eq("is_active", true).order("code"),
    ]);
    return NextResponse.json({ connection: toPublicConnection(row), counts, queue, mapping, chart: chart.data ?? [] });
  } catch (e) {
    console.error("[sage GET]", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Failed to load Sage sync." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const tenantId = auth.tenant.id;
    const needsManage = body.action === "choose_business" || body.action === "save_mapping" || body.action === "set_sync_from" || body.action === "queue_existing";
    if (needsManage && !caps.canManageIntegrations) {
      return NextResponse.json({ error: "Only the owner or an admin can change the Sage setup." }, { status: 403 });
    }

    switch (body.action) {
      case "choose_business": {
        const r = await chooseBusiness(auth.service, tenantId, body.businessId);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
        await writeAuditLog({ tenantId, actorUserId: auth.user.id, action: "accounting_sage_business_chosen", entityType: "accounting_connection", entityId: "sage_accounting", after: { business: r.business.name } });
        return NextResponse.json({ ok: true });
      }
      case "save_mapping": {
        await saveAccountMap(auth.service, tenantId, body.rows);
        const requeued = await requeueUnmapped(auth.service, tenantId);
        await writeAuditLog({ tenantId, actorUserId: auth.user.id, action: "accounting_sage_mapping_saved", entityType: "accounting_connection", entityId: "sage_accounting", after: { rows: body.rows.length, requeued } });
        return NextResponse.json({ ok: true, requeued });
      }
      case "set_sync_from": {
        await setSyncFrom(auth.service, tenantId, body.syncFrom);
        await writeAuditLog({ tenantId, actorUserId: auth.user.id, action: "accounting_sage_sync_from_changed", entityType: "accounting_connection", entityId: "sage_accounting", after: { syncFrom: body.syncFrom } });
        return NextResponse.json({ ok: true });
      }
      case "queue_existing": {
        const queued = await queueExistingJournals(auth.service, tenantId);
        await writeAuditLog({ tenantId, actorUserId: auth.user.id, action: "accounting_sage_backfill_queued", entityType: "accounting_connection", entityId: "sage_accounting", after: { queued } });
        return NextResponse.json({ ok: true, queued });
      }
      case "retry": {
        const count = await retryRows(auth.service, tenantId, body.id);
        return NextResponse.json({ ok: true, count });
      }
      case "sync_now": {
        const result = await runSyncForTenant(auth.service, tenantId, { limit: 60, budgetMs: 45_000 });
        return NextResponse.json({ ok: true, result });
      }
    }
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[sage POST]", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Failed to update Sage sync." }, { status: 500 });
  }
}
