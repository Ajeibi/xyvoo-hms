import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { FOLIO_WINDOWS, fetchFolioLines } from "@/lib/hms/folio";
import { listArCustomers } from "@/lib/hms/ar-customers";
import {
  BILLING_WINDOWS,
  CHARGE_GROUPS,
  loadWindows,
  removeWindowPayer,
  saveRoutingRule,
  saveWindowPayer,
} from "@/lib/hms/folio-windows";
import { loadFolioPayload, loadReservation } from "../_lib";

/**
 * GET /api/hotel/folio/windows?slug=&reservationId= — a stay's payers, routing rules, and the
 * company accounts a window can be billed to.
 * POST — set up or remove a payer, or save or remove a routing rule.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reservationId = url.searchParams.get("reservationId") ?? "";
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const [{ payers, rules }, customers] = await Promise.all([
    loadWindows(auth.service, auth.tenant.id, reservationId),
    listArCustomers(auth.service, auth.tenant.id),
  ]);
  return NextResponse.json({
    payers,
    rules,
    accounts: customers.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name })),
  });
}

const PostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("payer"),
    slug: z.string().min(1),
    reservationId: z.string().uuid(),
    window: z.enum(BILLING_WINDOWS as [string, ...string[]]),
    payerName: z.string().trim().min(1, "Enter who pays this part.").max(120),
    arCustomerId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    action: z.literal("remove-payer"),
    slug: z.string().min(1),
    reservationId: z.string().uuid(),
    window: z.enum(BILLING_WINDOWS as [string, ...string[]]),
  }),
  z.object({
    action: z.literal("rule"),
    slug: z.string().min(1),
    reservationId: z.string().uuid(),
    chargeGroup: z.enum(CHARGE_GROUPS),
    target: z.enum(FOLIO_WINDOWS).nullable(),
  }),
]);

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    if (reservation.status !== "checked_in" && reservation.status !== "confirmed") {
      return NextResponse.json({ error: "This stay has ended, so its payers can't be changed." }, { status: 400 });
    }

    let result: { ok: true; moved?: number } | { ok: false; error: string };
    if (body.action === "payer") {
      result = await saveWindowPayer(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: body.reservationId,
        window: body.window as (typeof BILLING_WINDOWS)[number],
        payerName: body.payerName,
        arCustomerId: body.arCustomerId ?? null,
        userId: auth.user.id,
      });
    } else if (body.action === "remove-payer") {
      result = await removeWindowPayer(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: body.reservationId,
        window: body.window as (typeof BILLING_WINDOWS)[number],
        lines: await fetchFolioLines(auth.service, auth.tenant.id, body.reservationId),
      });
    } else {
      const [lines, { payers }] = await Promise.all([
        fetchFolioLines(auth.service, auth.tenant.id, body.reservationId),
        loadWindows(auth.service, auth.tenant.id, body.reservationId),
      ]);
      result = await saveRoutingRule(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: body.reservationId,
        chargeGroup: body.chargeGroup,
        target: body.target,
        userId: auth.user.id,
        lines,
        payers,
      });
    }
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: `folio_window_${body.action.replace("-", "_")}`,
      entityType: "reservation",
      entityId: body.reservationId,
      after: { ...body, slug: undefined, moved: result.moved },
    });

    const [payload, windows] = await Promise.all([
      loadFolioPayload(auth, body.reservationId),
      loadWindows(auth.service, auth.tenant.id, body.reservationId),
    ]);
    return NextResponse.json({ ok: true, moved: result.moved ?? 0, folio: payload?.folio, billing: payload?.billing, ...windows });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
