import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { loadInvoiceData } from "@/lib/hms/folio-invoice";
import { invoiceWhatsAppLink, invoiceWhatsAppMessage, signInvoiceToken } from "@/lib/hms/folio-invoice-link";

/**
 * POST /api/hotel/folio/invoice/whatsapp — the WhatsApp link that sends the guest their bill from
 * the hotel's own WhatsApp: the message with a private link to the PDF, to the guest's WhatsApp
 * number (or phone), or to `phone`. Staff open it and press send; nothing is sent from here.
 */

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  phone: z.string().trim().max(40).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const d = await loadInvoiceData(auth.service, auth.tenant.id, body.reservationId);
    if (!d) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const phone = body.phone || d.guest.whatsapp || d.guest.phone;
    if (!phone) return NextResponse.json({ error: "This guest has no phone number. Enter their WhatsApp number to send the bill." }, { status: 400 });

    const url = `${new URL(req.url).origin}/api/hotel/bill/${signInvoiceToken(auth.tenant.id, body.reservationId)}`;
    const link = invoiceWhatsAppLink(phone, invoiceWhatsAppMessage(d, url), d.hotelCountry);
    if (!link) return NextResponse.json({ error: "That phone number doesn't look right. Use the full number, like 0803 123 4567 or +234 803 123 4567." }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_invoice_whatsapp",
      entityType: "reservation",
      entityId: body.reservationId,
      after: { phone, invoiceNumber: d.invoiceNumber },
    });
    return NextResponse.json({ ok: true, link, phone, invoiceNumber: d.invoiceNumber });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
