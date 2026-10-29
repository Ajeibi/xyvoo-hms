import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildInvoicePdf } from "@/lib/hms/folio-invoice";
import { verifyInvoiceToken } from "@/lib/hms/folio-invoice-link";
import { pdfBody } from "@/lib/store/receipts-pdf";

/**
 * GET /api/hotel/bill/<token> — the guest's bill as a PDF, from the private link sent to them on
 * WhatsApp. No sign-in: the signed token names the stay and runs out after 30 days. The bill is
 * made fresh each time, so a stay still in progress shows its latest charges.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const stay = verifyInvoiceToken(token);
  if (!stay) {
    return new NextResponse("This link has expired or isn't right. Ask the hotel to send your bill again.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const built = await buildInvoicePdf(createServerSupabaseClient(), stay.tenantId, stay.reservationId);
  if (!built) {
    return new NextResponse("This bill couldn't be found. Ask the hotel to send it again.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(pdfBody(built.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${built.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
