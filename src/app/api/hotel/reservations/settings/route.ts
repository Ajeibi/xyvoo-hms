import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { getTenantFolioSettings, updateTenantFolioSettings } from "@/lib/hms/folio";

const QuerySchema = z.object({ slug: z.string().min(1) });
const PatchSchema = z.object({
  slug: z.string().min(1),
  allowCheckoutWithBalance: z.boolean().optional(),
  largeChargeThreshold: z.number().positive().optional(),
  managerPin: z.string().min(4).max(12).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
    return NextResponse.json({ settings, canManage: isAdminLikeRole(auth.role) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });

    const result = await updateTenantFolioSettings(auth.service, auth.tenant.id, {
      allowCheckoutWithBalance: body.allowCheckoutWithBalance,
      largeChargeThreshold: body.largeChargeThreshold,
      managerPin: body.managerPin,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }
}
