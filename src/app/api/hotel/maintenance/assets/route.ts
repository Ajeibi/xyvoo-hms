import { NextResponse } from "next/server";
import { z } from "zod";
import { authMaintenance, fail, isFailure } from "@/lib/hms/maintenance-api";
import { listAssets, saveAsset } from "@/lib/hms/maintenance-assets";
import { getMaintenanceSettings } from "@/lib/hms/maintenance-settings";

const Asset = z.object({
  slug: z.string().min(1),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  assetTag: z.string().max(40).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  roomUnitId: z.string().uuid().nullable().optional(),
  locationText: z.string().max(200).nullable().optional(),
  make: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  serialNumber: z.string().max(80).nullable().optional(),
  installedOn: z.string().nullable().optional(),
  warrantyUntil: z.string().nullable().optional(),
  fixedAssetId: z.string().uuid().nullable().optional(),
  status: z.enum(["in_service", "out_of_service", "retired"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = await authMaintenance(url.searchParams.get("slug"));
  if (isFailure(a)) return a;
  const settings = await getMaintenanceSettings(a.auth.service, a.auth.tenant.id);
  const assets = await listAssets(a.auth.service, a.auth.tenant.id, {
    repeatThreshold: settings.repeatFaultThreshold,
    includeRetired: url.searchParams.get("retired") === "1",
  });
  return NextResponse.json({ assets });
}

/** POST saves equipment: with `id` it edits, without it adds. */
export async function POST(req: Request) {
  try {
    const body = Asset.parse(await req.json());
    const a = await authMaintenance(body.slug, "canManage");
    if (isFailure(a)) return a;
    const { id, slug: _slug, ...input } = body;
    void _slug;
    const r = await saveAsset(a.auth.service, a.auth.tenant.id, a.actor, input, id);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not save the equipment.", 500);
  }
}
