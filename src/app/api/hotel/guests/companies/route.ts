import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { createCompany } from "@/lib/hms/guest-companies";

const CompanyBodySchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Enter the company's name.").max(120),
  contactName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email("Enter a valid email address.").max(160).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(240).optional().nullable(),
  paymentTerms: z.string().trim().max(120).optional().nullable(),
  taxId: z.string().trim().max(60).optional().nullable(),
  industry: z.string().trim().max(80).optional().nullable(),
  accountManager: z.string().trim().max(80).optional().nullable(),
  negotiatedRateNote: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/** POST /api/hotel/guests/companies: add a company (it also becomes a customer in Accounts). */
export async function POST(req: Request) {
  try {
    const { slug, ...fields } = CompanyBodySchema.parse(await req.json());
    const auth = await requireGuestsApi(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const result = await createCompany(auth.service, { tenantId: auth.tenant.id, actorUserId: auth.user.id, fields });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not add the company." }, { status: 500 });
  }
}
