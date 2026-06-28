import { NextResponse } from "next/server";
import { z } from "zod";
import { loadKitchenHistory } from "@/lib/hms/fb-orders";
import { fbForbidden, requireFbApi } from "../../_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireFbApi(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canViewKitchenBoard");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const orders = await loadKitchenHistory(auth.service, auth.tenant.id);
    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        table_label: o.table_code ?? o.tab_label ?? "—",
        status: o.status,
        closed_at: o.closed_at,
        voided_at: o.voided_at,
        item_count: o.items.length,
        created_at: o.created_at,
        sent_to_kitchen_at: o.sent_to_kitchen_at,
      })),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
