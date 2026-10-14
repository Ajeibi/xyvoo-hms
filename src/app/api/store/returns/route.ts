import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getReturnWindow, listReturns, saveReturnWindow } from "@/lib/store/returns-server";

/** GET /api/store/returns?slug= — every return, and the shop's return window in days. Anyone on the team can see them. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  try {
    const [returns, windowDays] = await Promise.all([listReturns(resolved.access.tenantId), getReturnWindow(resolved.access.tenantId)]);
    return NextResponse.json({ returns, windowDays, canChangeWindow: resolved.capabilities.canManageSettings });
  } catch (error) {
    console.error("[returns] list failed", error);
    return NextResponse.json({ error: "We couldn't load returns just now." }, { status: 500 });
  }
}

const WindowSchema = z.object({
  slug: z.string(),
  windowDays: z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? Number.NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 0 && v <= 365, "Use a whole number of days from 0 to 365."),
});

/** PUT /api/store/returns { slug, windowDays } — how many days after delivery a return can be asked for (0 for no returns). */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change the return window." }, { status: 403 });
  const parsed = WindowSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the number of days." }, { status: 400 });
  try {
    await saveReturnWindow(resolved.access.tenantId, parsed.data.windowDays);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "returns", action: "window", targetLabel: `${parsed.data.windowDays} days` });
    return NextResponse.json({ windowDays: parsed.data.windowDays });
  } catch (error) {
    console.error("[returns] window failed", error);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
