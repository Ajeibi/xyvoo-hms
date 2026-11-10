import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { createEmployee, listEmployees } from "@/lib/hms/hr/hr-employees";
import { EMPLOYMENT_TYPES } from "@/lib/hms/hr/hr-shared";

const Create = z.object({
  slug: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  preferredName: z.string().max(80).nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  workEmail: z.string().email().max(200).nullable().optional().or(z.literal("")),
  workPhone: z.string().max(40).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  contractedHoursWeek: z.number().min(0).max(100).nullable().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = await authHr(url.searchParams.get("slug"));
  if (isFailure(a)) return a;
  const employees = await listEmployees(a.auth.service, a.auth.tenant.id, { status: "current" });
  return NextResponse.json({ employees });
}

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Check the name and the other details, then try again.");
  const a = await authHr(parsed.data.slug);
  if (isFailure(a)) return a;
  const { slug: _slug, ...input } = parsed.data;
  void _slug;
  const result = await createEmployee(a.auth.service, a.auth.tenant.id, { ...input, workEmail: input.workEmail || null }, a.actor);
  if (result.error) return fail(result.error);
  return NextResponse.json({ id: result.id });
}
