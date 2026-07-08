import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getTenantFbSettings,
  KITCHEN_OVERDUE_MINUTES_MAX,
  KITCHEN_OVERDUE_MINUTES_MIN,
  upsertTenantFbSettings,
} from "@/lib/hms/fb-settings";
import { loadFbCategoryPrepTimes } from "@/lib/hms/fb-menu";
import { fbForbidden, requireFbApi } from "../_lib";

const PatchSchema = z.object({
  slug: z.string().min(1),
  kitchenOverdueMinutes: z
    .number()
    .int()
    .min(KITCHEN_OVERDUE_MINUTES_MIN)
    .max(KITCHEN_OVERDUE_MINUTES_MAX),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

    const auth = await requireFbApi(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const canView =
      auth.capabilities.canUsePos ||
      auth.capabilities.canViewKitchenBoard ||
      auth.capabilities.canConfigure;
    if (!canView) {
      const denied = fbForbidden(auth.capabilities, "canViewKitchenBoard");
      return NextResponse.json({ error: denied?.error ?? "Forbidden" }, { status: 403 });
    }

    const [settings, categories] = await Promise.all([
      getTenantFbSettings(auth.service, auth.tenant.id),
      loadFbCategoryPrepTimes(auth.service, auth.tenant.id),
    ]);
    return NextResponse.json({ ...settings, categories, capabilities: auth.capabilities });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const settings = await upsertTenantFbSettings(auth.service, auth.tenant.id, {
      kitchenOverdueMinutes: body.kitchenOverdueMinutes,
    });
    return NextResponse.json({ ...settings, capabilities: auth.capabilities });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
