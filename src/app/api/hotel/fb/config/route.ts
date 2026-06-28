import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFbConfig } from "@/lib/hms/fb-menu";
import { fbForbidden, requireFbApi } from "../_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
  seed: z.enum(["0", "1"]).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      seed: url.searchParams.get("seed") ?? undefined,
    });
    const auth = await requireFbApi(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canUsePos");
    if (denied && !auth.capabilities.canConfigure && !auth.capabilities.canViewKitchenBoard) {
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    const config = await loadFbConfig(auth.service, auth.tenant.id, {
      seedDefaults: query.seed !== "0",
    });
    return NextResponse.json({ ...config, capabilities: auth.capabilities });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
