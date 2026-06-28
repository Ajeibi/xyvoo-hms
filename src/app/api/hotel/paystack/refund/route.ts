import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFolioPayload } from "@/app/api/hotel/folio/_lib";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { insertFolioLine, verifyManagerPin } from "@/lib/hms/folio";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { paystackRefund } from "@/lib/paystack/client";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack/config";

const BodySchema = z.object({
  slug: z.string().min(1),
  folioLineId: z.string().uuid(),
  amount: z.coerce.number().positive().optional(),
  managerPin: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pinOk = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
    if (!pinOk) {
      return NextResponse.json({ error: "Manager PIN required or invalid." }, { status: 403 });
    }

    const config = getPaystackConfig(auth.tenant);
    if (!isPaystackReady(config)) {
      return NextResponse.json({ error: "Paystack is not configured." }, { status: 400 });
    }

    const { data: line } = await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .select("*")
      .eq("id", body.folioLineId)
      .eq("tenant_id", auth.tenant.id)
      .maybeSingle();

    if (!line || line.kind !== "payment" || line.voided_at) {
      return NextResponse.json({ error: "Payment line not found." }, { status: 404 });
    }

    const meta = (line.metadata as Record<string, unknown>) ?? {};
    if (meta.provider !== "paystack" || !line.reference) {
      return NextResponse.json({ error: "Only Paystack card payments can be refunded here." }, { status: 400 });
    }

    const refundAmount = body.amount ?? Math.abs(Number(line.amount));
    const refund = await paystackRefund({
      secretKey: config.secretKey!,
      transactionReference: line.reference as string,
      amount: refundAmount,
      merchantNote: body.note,
    });

    if (!refund.ok) {
      return NextResponse.json({ error: refund.message }, { status: 502 });
    }

    const { line: refundLine, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: line.reservation_id as string,
      kind: "refund",
      amount: refundAmount,
      method: "card",
      description: "Paystack refund",
      postedBy: auth.user.id,
      reference: (refund.data.reference as string) ?? line.reference,
      status: "refund_pending",
      metadata: { provider: "paystack", original_line_id: line.id, paystack_refund: refund.data },
    });

    if (error || !refundLine) {
      return NextResponse.json({ error: error ?? "Could not record refund." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_refund_requested",
      entityType: "folio_transaction",
      entityId: refundLine.id,
      after: { amount: refundAmount, reference: line.reference },
    });

    const payload = await loadFolioPayload(auth, line.reservation_id as string);
    return NextResponse.json({ ok: true, line: refundLine, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
