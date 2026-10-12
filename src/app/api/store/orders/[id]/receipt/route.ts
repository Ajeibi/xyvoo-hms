import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { buildReceiptPdf } from "@/lib/store/receipts";
import { pdfBody } from "@/lib/store/receipts-pdf";

/**
 * GET /api/store/orders/<id>/receipt?slug= — the order's receipt (paid) or
 * invoice (bank transfer awaiting payment) as a PDF download. Any team member.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const built = await buildReceiptPdf({ tenantId: resolved.access.tenantId, orderId: id });
  if (!built) {
    return NextResponse.json({ error: "There's no receipt for this order yet. Receipts are ready once the order is paid." }, { status: 404 });
  }
  return new Response(pdfBody(built.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="${built.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
