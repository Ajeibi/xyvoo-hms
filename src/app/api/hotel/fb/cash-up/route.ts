import { NextResponse } from "next/server";
import { z } from "zod";
import { cashVariance, closeNeeds } from "@/lib/hms/fb-cashup-rules";
import {
  closeCashSession,
  liveExpectedCash,
  loadCashSession,
  loadCashSessions,
  loadZReport,
  openCashSession,
  postCashUpJournal,
} from "@/lib/hms/fb-cashup";
import { loadTipStaff } from "@/lib/hms/fb-tips";
import { verifyManagerPin } from "@/lib/hms/folio";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const money = z.coerce.number().min(0, "Amounts can't be negative.").max(1_000_000_000);

const BodySchema = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("open"), outletId: z.string().uuid(), openingFloat: money }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("close"),
    id: z.string().uuid(),
    counted: money,
    varianceReason: z.string().trim().max(300, "Keep the reason to 300 characters.").optional().nullable(),
    notes: z.string().trim().max(500, "Keep the notes to 500 characters.").optional().nullable(),
    /** Not needed when the person is a manager or owner. */
    managerPin: z.string().max(20).optional(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("post"), id: z.string().uuid() }),
]);

/**
 * Tills: open ones and recent cash-ups. Staff count blind, so what an open
 * till should hold is only sent to managers. With ?id=…&report=1, the shift
 * report for one till.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const auth = await requireFbApi(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const denied = fbForbidden(auth.capabilities, "canTakePayment");
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const id = url.searchParams.get("id");
  if (id && url.searchParams.get("report") === "1") {
    const session = await loadCashSession(auth.service, auth.tenant.id, id);
    if (!session) return NextResponse.json({ error: "Cash-up not found." }, { status: 404 });
    if (session.status === "open" && !auth.capabilities.canConfigure) {
      return NextResponse.json({ error: "The shift report is ready once the till is closed." }, { status: 403 });
    }
    return NextResponse.json({ session, report: await loadZReport(auth.service, auth.tenant.id, id) });
  }

  const isManager = auth.capabilities.canConfigure;
  const [sessions, staff] = await Promise.all([
    loadCashSessions(auth.service, auth.tenant.id),
    loadTipStaff(auth.service, auth.tenant.id),
  ]);
  const expected: Record<string, number> = {};
  if (isManager) {
    for (const s of sessions.filter((x) => x.status === "open")) {
      expected[s.id] = await liveExpectedCash(auth.service, auth.tenant.id, s);
    }
  }
  return NextResponse.json({ sessions, staff, expected, isManager });
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, body.action === "post" ? "canConfigure" : "canTakePayment");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    if (body.action === "open") {
      const result = await openCashSession(auth.service, {
        tenantId: auth.tenant.id,
        outletId: body.outletId,
        openingFloat: body.openingFloat,
        openedBy: auth.user.id,
      });
      if (!result.session) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_till_opened",
        entityType: "fb_cash_session",
        entityId: result.session.id,
        after: { outlet: result.session.outletName, opening_float: result.session.openingFloat },
      });
      return NextResponse.json({ ok: true, session: result.session });
    }

    if (body.action === "post") {
      const result = await postCashUpJournal(auth.service, auth.tenant.id, body.id, auth.user.id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, journalEntryId: result.journalEntryId });
    }

    // Close: count blind; a difference needs a reason, a big one a manager.
    const session = await loadCashSession(auth.service, auth.tenant.id, body.id);
    if (!session) return NextResponse.json({ error: "Cash-up not found." }, { status: 404 });
    if (session.status !== "open") return NextResponse.json({ error: "This till has already been closed." }, { status: 400 });
    const variance = cashVariance(body.counted, await liveExpectedCash(auth.service, auth.tenant.id, session));
    const needs = closeNeeds(variance);
    if (needs.needsReason && !body.varianceReason?.trim()) {
      return NextResponse.json(
        {
          error: "The count doesn't match what the till should hold. Count again, or say why it's different.",
          needsReason: true,
          needsManager: needs.needsManager,
        },
        { status: 400 },
      );
    }
    let managerApproved = auth.capabilities.canConfigure;
    if (needs.needsManager) {
      const ok = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
      if (!ok) {
        return NextResponse.json(
          {
            error: body.managerPin
              ? "That manager PIN isn't right."
              : "The difference is large, so a manager needs to approve this. Enter the manager PIN.",
            needsReason: true,
            needsManager: true,
          },
          { status: 403 },
        );
      }
      managerApproved = true;
    }

    const closed = await closeCashSession(auth.service, {
      tenantId: auth.tenant.id,
      sessionId: body.id,
      counted: body.counted,
      varianceReason: body.varianceReason,
      notes: body.notes,
      closedBy: auth.user.id,
      managerApproved,
    });
    if (closed.error || !closed.session) {
      return NextResponse.json({ error: closed.error ?? "Could not close the till." }, { status: 400 });
    }
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "fb_till_closed",
      entityType: "fb_cash_session",
      entityId: body.id,
      after: {
        outlet: closed.session.outletName,
        counted: closed.session.countedCash,
        expected: closed.session.expectedCash,
        variance: closed.session.variance,
        reason: closed.session.varianceReason,
        manager_approved: managerApproved,
        journal_entry_id: closed.posting?.journalEntryId ?? null,
        posting_error: closed.posting?.error ?? null,
      },
    });
    return NextResponse.json({ ok: true, session: closed.session, postingError: closed.posting?.error ?? null });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 400 });
  }
}
