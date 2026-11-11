import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { createDiscountPackage } from "@/lib/hms/discount-packages";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();
const PostSchema = z.object({
  slug: z.string().min(1),
  code: z.string().trim().min(2, "The code needs at least 2 characters.").max(30).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, dashes or underscores only."),
  name: z.string().trim().max(80).nullish(),
  percent: z.coerce.number().gt(0, "Enter a percent above 0.").max(100),
  scope: z.enum(["all_nights", "first_night", "last_night", "first_and_last"]),
  validFrom: day,
  validTo: day,
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can manage discount codes." }, { status: 403 });
    if (body.validFrom && body.validTo && body.validTo < body.validFrom) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
    const { row, error } = await createDiscountPackage(auth.service, auth.tenant.id, body);
    if (!row) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ package: row });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
