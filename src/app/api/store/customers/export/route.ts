import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { customersToCsv, listCustomers } from "@/lib/store/customers";
import { featureUnavailable } from "@/lib/store/features";

/** GET /api/store/customers/export?slug= — the customer list as CSV. Owners and admins only, as it contains personal details. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can export customers." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "customerExport");
  if (blocked) return blocked;

  const csv = customersToCsv(await listCustomers(access.tenantId));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
