import { NextResponse } from "next/server";
import { z } from "zod";
import { closeFbOrder, postOrderPayment, postOrderToFolio } from "@/lib/hms/fb-orders";
import { getActiveCashFloatSession, openCashFloatSession } from "@/lib/hms/folio";
import { fbForbidden, requireFbApi } from "../../../_lib";

const FolioSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

const PaymentSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "card", "pos"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    const body =
      action === "payment"
        ? PaymentSchema.parse(await req.json())
        : FolioSchema.parse(await req.json());

    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (action === "folio-charge") {
      const denied = fbForbidden(auth.capabilities, "canPostFolio");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

      const folioBody = body as z.infer<typeof FolioSchema>;
      const posted = await postOrderToFolio(auth.service, {
        tenantId: auth.tenant.id,
        orderId: id,
        reservationId: folioBody.reservationId,
        postedBy: auth.user.id,
      });
      if (posted.error) return NextResponse.json({ error: posted.error }, { status: 400 });
      const closed = await closeFbOrder(auth.service, auth.tenant.id, id);
      return NextResponse.json({ ok: true, line: posted.line, order: closed.order });
    }

    if (action === "payment") {
      const denied = fbForbidden(auth.capabilities, "canTakePayment");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

      const payBody = body as z.infer<typeof PaymentSchema>;
      let cashFloatSessionId: string | undefined;
      if (payBody.method === "cash") {
        let session = await getActiveCashFloatSession(auth.service, auth.tenant.id);
        if (!session) {
          const opened = await openCashFloatSession(auth.service, {
            tenantId: auth.tenant.id,
            openedBy: auth.user.id,
            openingBalance: 0,
          });
          session = opened.session;
        }
        cashFloatSessionId = session?.id as string | undefined;
      }

      const posted = await postOrderPayment(auth.service, {
        tenantId: auth.tenant.id,
        orderId: id,
        reservationId: payBody.reservationId,
        amount: payBody.amount,
        method: payBody.method,
        postedBy: auth.user.id,
        cashFloatSessionId,
      });
      if (posted.error) return NextResponse.json({ error: posted.error }, { status: 400 });
      const closed = await closeFbOrder(auth.service, auth.tenant.id, id);
      return NextResponse.json({ ok: true, order: closed.order });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
