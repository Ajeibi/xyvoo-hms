import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { listBudgets, upsertBudget } from "@/lib/hms/procurement-budgets";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const budgets = await listBudgets(auth.service, auth.tenant.id);
    return NextResponse.json({ budgets });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  department: z.string().min(1).max(120),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  amount: z.coerce.number().min(0),
  currency: z.string().max(6).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { budget, error } = await upsertBudget(auth.service, {
      tenantId: auth.tenant.id,
      department: body.department,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      amount: body.amount,
      currency: body.currency,
    });
    if (error || !budget) return NextResponse.json({ error: error ?? "Could not save budget." }, { status: 400 });
    return NextResponse.json({ budget });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
