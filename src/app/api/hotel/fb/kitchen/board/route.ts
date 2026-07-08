import { NextResponse } from "next/server";
import { z } from "zod";
import { loadKitchenBoard } from "@/lib/hms/fb-orders";
import { loadStations } from "@/lib/hms/fb-menu";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import { fbForbidden, requireFbApi } from "../../_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
  station: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      station: url.searchParams.get("station") ?? undefined,
    });
    const auth = await requireFbApi(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canViewKitchenBoard");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const tickets = await loadKitchenBoard(
      auth.service,
      auth.tenant.id,
      query.station ?? "all",
    );
    const { stations } = await loadStations(auth.service, auth.tenant.id);
    const fbSettings = await getTenantFbSettings(auth.service, auth.tenant.id);
    return NextResponse.json({
      tickets,
      stations,
      kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
