import { NextResponse } from "next/server";
import { z } from "zod";
import { authMaintenance, fail, isFailure } from "@/lib/hms/maintenance-api";
import {
  getMaintenanceSettings,
  listCategories,
  listTechnicians,
  saveCategory,
  saveMaintenanceSettings,
  saveTechnician,
} from "@/lib/hms/maintenance-settings";
import { WO_PRIORITIES } from "@/lib/hms/maintenance-shared";

const Body = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("settings"),
    slaUrgentHours: z.number().positive().max(10000),
    slaHighHours: z.number().positive().max(10000),
    slaNormalHours: z.number().positive().max(10000),
    slaLowHours: z.number().positive().max(10000),
    repeatFaultThreshold: z.number().int().min(2).max(50),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("category"),
    id: z.string().optional(),
    name: z.string().min(1).max(80),
    defaultPriority: z.enum(WO_PRIORITIES),
    active: z.boolean(),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("technician"),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    phone: z.string().max(40).nullable().optional(),
    specialty: z.string().max(80).nullable().optional(),
    active: z.boolean(),
  }),
]);

export async function GET(req: Request) {
  const a = await authMaintenance(new URL(req.url).searchParams.get("slug"));
  if (isFailure(a)) return a;
  const [settings, categories, technicians] = await Promise.all([
    getMaintenanceSettings(a.auth.service, a.auth.tenant.id),
    listCategories(a.auth.service, a.auth.tenant.id),
    listTechnicians(a.auth.service, a.auth.tenant.id),
  ]);
  return NextResponse.json({ settings, categories, technicians });
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const a = await authMaintenance(body.slug, "canConfigure");
    if (isFailure(a)) return a;
    const { auth, actor } = a;
    const tenantId = auth.tenant.id;
    let r: { error: string | null };
    if (body.action === "settings") r = await saveMaintenanceSettings(auth.service, tenantId, actor.userId, body);
    else if (body.action === "category") r = await saveCategory(auth.service, tenantId, actor.userId, body);
    else r = await saveTechnician(auth.service, tenantId, actor.userId, body);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not save.", 500);
  }
}
