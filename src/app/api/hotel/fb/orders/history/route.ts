import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFbOrderHistory, type FbOrderHistoryRange } from "@/lib/hms/fb-orders";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import { mapFbOrderHistoryRows } from "@/lib/hms/load-fb-pages";
import { fbForbidden, requireFbApi } from "../../_lib";

const RANGE_VALUES = [
  "all",
  "today",
  "yesterday",
  "last_week",
  "last_2_weeks",
  "last_month",
] as const satisfies readonly FbOrderHistoryRange[];

const QuerySchema = z.object({
  slug: z.string().min(1),
  range: z.enum(RANGE_VALUES).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      range: url.searchParams.get("range") ?? undefined,
    });
    const auth = await requireFbApi(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const canView =
      auth.capabilities.canUsePos ||
      auth.capabilities.canViewKitchenBoard;
    if (!canView) {
      const denied = fbForbidden(auth.capabilities, "canUsePos");
      return NextResponse.json({ error: denied?.error ?? "Forbidden" }, { status: 403 });
    }

    const range = query.range ?? "all";
    const [orders, fbSettings] = await Promise.all([
      loadFbOrderHistory(auth.service, auth.tenant.id, range),
      getTenantFbSettings(auth.service, auth.tenant.id),
    ]);
    return NextResponse.json({
      orders: mapFbOrderHistoryRows(orders),
      capabilities: auth.capabilities,
      kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
      range,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
