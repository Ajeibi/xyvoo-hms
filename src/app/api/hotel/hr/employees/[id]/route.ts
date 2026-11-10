import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, canSeeHrPrivate, fail, isFailure } from "@/lib/hms/hr/hr-api";
import {
  addDocument,
  deleteDocument,
  getEmployee,
  getEmployeePrivate,
  getPayProfile,
  listDocuments,
  saveEmployeePrivate,
  savePayProfile,
  setClockPin,
  setEmployeeStatus,
  updateEmployee,
} from "@/lib/hms/hr/hr-employees";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, PAY_BASES } from "@/lib/hms/hr/hr-shared";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().max(max).nullable().optional();
const money = z.number().min(0).max(1_000_000_000);

const Body = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("details"),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    preferredName: text(80),
    jobTitle: text(120),
    department: text(80),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    startDate: date.nullable().optional(),
    workEmail: z.string().email().max(200).nullable().optional().or(z.literal("")),
    workPhone: text(40),
    userId: z.string().uuid().nullable().optional(),
    contractedHoursWeek: z.number().min(0).max(100).nullable().optional(),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("status"),
    status: z.enum(EMPLOYEE_STATUSES),
    endDate: date.nullable().optional(),
    leavingReason: text(500),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("pin"), pin: z.string().max(6).nullable() }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("private"),
    details: z.object({
      dateOfBirth: date.nullable().optional(),
      gender: text(40),
      maritalStatus: text(40),
      homeAddress: text(500),
      stateOfResidence: text(60),
      personalPhone: text(40),
      personalEmail: text(200),
      nextOfKinName: text(120),
      nextOfKinRelationship: text(60),
      nextOfKinPhone: text(40),
      nin: text(20),
      tin: text(30),
      bankName: text(120),
      bankAccountNumber: text(20),
      bankAccountName: text(160),
      pfaName: text(120),
      rsaPin: text(30),
      nhfNumber: text(30),
      guarantorName: text(120),
      guarantorPhone: text(40),
      notes: text(2000),
    }),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("pay"),
    pay: z.object({
      payBasis: z.enum(PAY_BASES),
      basicMonthly: money,
      housingMonthly: money,
      transportMonthly: money,
      otherAllowancesMonthly: money,
      hourlyRate: money,
      dailyRate: money,
      annualRentPaid: money,
      otherReliefsAnnual: money,
      monthlyDeductions: money,
      monthlyDeductionsNote: z.string().max(300).nullable(),
      pensionOptIn: z.boolean(),
      nhfOptIn: z.boolean(),
      payeExempt: z.boolean(),
    }),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("document_add"),
    kind: z.string().trim().min(1).max(120),
    reference: text(120),
    receivedOn: date.nullable().optional(),
    expiresOn: date.nullable().optional(),
    note: text(500),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("document_remove"), documentId: z.string().uuid() }),
]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authHr(new URL(req.url).searchParams.get("slug"));
  if (isFailure(a)) return a;
  const tenantId = a.auth.tenant.id;
  const employee = await getEmployee(a.auth.service, tenantId, id);
  if (!employee) return fail("Staff record not found.", 404);
  const canSeePrivate = await canSeeHrPrivate(a.privateDb, tenantId);
  if (!canSeePrivate) return NextResponse.json({ employee, canSeePrivate });
  const [details, pay, documents] = await Promise.all([
    getEmployeePrivate(a.privateDb, tenantId, id),
    getPayProfile(a.privateDb, tenantId, id),
    listDocuments(a.privateDb, tenantId, id),
  ]);
  return NextResponse.json({ employee, canSeePrivate, details, pay, documents });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Some of the details aren't valid. Check them and try again.");
  const body = parsed.data;
  const a = await authHr(body.slug);
  if (isFailure(a)) return a;
  const { auth, actor, privateDb } = a;
  const tenantId = auth.tenant.id;
  const employee = await getEmployee(auth.service, tenantId, id);
  if (!employee) return fail("Staff record not found.", 404);

  let result: { error: string | null };
  switch (body.action) {
    case "details": {
      const { slug: _s, action: _a, ...input } = body;
      void _s;
      void _a;
      result = await updateEmployee(auth.service, tenantId, id, { ...input, workEmail: input.workEmail === "" ? null : input.workEmail }, actor);
      break;
    }
    case "status":
      result = await setEmployeeStatus(auth.service, tenantId, id, body.status, { endDate: body.endDate, leavingReason: body.leavingReason }, actor);
      break;
    case "pin":
      result = await setClockPin(auth.service, tenantId, id, body.pin, actor);
      break;
    // The next four go through the caller's own client: the database refuses anyone but the
    // owner and the people the owner named, whatever this route does.
    case "private":
      result = await saveEmployeePrivate(privateDb, tenantId, id, body.details, actor);
      break;
    case "pay":
      result = await savePayProfile(privateDb, tenantId, id, body.pay, actor);
      break;
    case "document_add":
      result = await addDocument(privateDb, tenantId, id, body, actor);
      break;
    case "document_remove":
      result = await deleteDocument(privateDb, tenantId, id, body.documentId, actor);
      break;
  }
  if (result.error) return fail(result.error);
  return NextResponse.json({ ok: true });
}
