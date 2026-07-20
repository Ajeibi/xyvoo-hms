import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { INSPECTION_POLICIES, upsertTenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";

const PutSchema = z.object({
  slug: z.string().min(1),
  slaCheckoutMinutes: z.number().int().min(1).max(480),
  slaStayoverMinutes: z.number().int().min(1).max(480),
  slaDeepCleanMinutes: z.number().int().min(1).max(480),
  slaTurndownMinutes: z.number().int().min(1).max(480),
  inspectionPolicy: z.enum(INSPECTION_POLICIES),
  spotCheckPercent: z.number().int().min(1).max(100),
  selfInspectionAllowed: z.boolean(),
  priorityEscalationMinutes: z.number().int().min(1).max(240),
  stayoverCadenceDays: z.number().int().min(1).max(7),
});

export async function PUT(req: Request) {
  try {
    const body = PutSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canConfigureSettings) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { slug: _slug, ...settings } = body;
    const saved = await upsertTenantHousekeepingSettings(auth.service, auth.tenant.id, settings);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping settings PUT]", e);
    return NextResponse.json({ error: "Failed to save settings." }, { status: 500 });
  }
}
