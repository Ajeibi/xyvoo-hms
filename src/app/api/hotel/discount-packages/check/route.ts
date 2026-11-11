import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { findUsableDiscountPackage, getCheckInDiscountThreshold, setCheckInDiscountThreshold } from "@/lib/hms/discount-packages";
import { postingDate } from "@/lib/hms/business-date";

/** The manual-discount limit, for the check-in form. */
export async function GET(req: Request) {
  try {
    const slug = z.string().min(1).parse(new URL(req.url).searchParams.get("slug"));
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const threshold = await getCheckInDiscountThreshold(auth.service, auth.tenant.id);
    return NextResponse.json({ threshold, canApprove: isAdminLikeRole(auth.role) });
  } catch {
    return NextResponse.json({ error: "Could not load the discount limit." }, { status: 400 });
  }
}

/** Checks a code typed at check-in and says what it gives. */
export async function POST(req: Request) {
  try {
    const body = z.object({ slug: z.string().min(1), code: z.string().max(40) }).parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const result = await findUsableDiscountPackage(auth.service, auth.tenant.id, body.code, await postingDate(auth.service, auth.tenant.id));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const { pkg } = result;
    return NextResponse.json({ code: pkg.code, name: pkg.name, percent: pkg.percent, scope: pkg.scope });
  } catch {
    return NextResponse.json({ error: "Could not check the code." }, { status: 400 });
  }
}

/** Sets the manual-discount limit (owners and admins). */
export async function PUT(req: Request) {
  try {
    const body = z.object({ slug: z.string().min(1), threshold: z.coerce.number().min(0).max(100) }).parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });
    const saved = await setCheckInDiscountThreshold(auth.service, auth.tenant.id, body.threshold);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
