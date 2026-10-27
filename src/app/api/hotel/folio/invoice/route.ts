import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { buildInvoicePdf, sendInvoiceEmail } from "@/lib/hms/folio-invoice";
import { pdfBody } from "@/lib/store/receipts-pdf";

/**
 * GET /api/hotel/folio/invoice?slug=&reservationId=[&view=1] — the stay's invoice (or bill so far)
 * as a PDF: shown in the browser to print with view=1, otherwise downloaded.
 * POST — emails it to the guest, or to `to`.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reservationId = url.searchParams.get("reservationId") ?? "";
  const auth = await requireHotelApiMember(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!UUID.test(reservationId)) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const built = await buildInvoicePdf(auth.service, auth.tenant.id, reservationId);
  if (!built) return NextResponse.json({ error: "The bill couldn't be made." }, { status: 404 });
  return new Response(pdfBody(built.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="${built.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

const PostSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  to: z.union([z.string().email().max(120), z.literal("")]).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const sent = await sendInvoiceEmail(auth.service, { tenantId: auth.tenant.id, reservationId: body.reservationId, to: body.to });
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_invoice_emailed",
      entityType: "reservation",
      entityId: body.reservationId,
      after: { to: sent.to, invoiceNumber: sent.invoiceNumber },
    });
    return NextResponse.json({ ok: true, to: sent.to, invoiceNumber: sent.invoiceNumber });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message === "Invalid email" ? "Enter a valid email address." : e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
