import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { buildReceiptPdf } from "@/lib/store/receipts";
import { isReceiptToken } from "@/lib/store/receipts-format";
import { pdfBody } from "@/lib/store/receipts-pdf";

/**
 * GET /api/receipts/<token> — a shopper's receipt (or invoice, for a bank
 * transfer order awaiting payment), opened from their email. Public: the long
 * random token is the key, so it's rate-limited per IP address to stop guessing.
 */

const NO_INDEX = { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };

/** A small, plain page for when there's no PDF to show. */
function message(status: number, title: string, text: string) {
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f1f5f9;color:#0f172a}main{max-width:32rem;margin:15vh auto;padding:2rem 1.5rem;background:#fff;border-radius:1rem;border:1px solid #e2e8f0}h1{font-size:1.4rem;margin:0 0 .75rem}p{line-height:1.6;margin:0;color:#334155}</style>
</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_INDEX } });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limit = await rateLimitShared(`receipt:${clientIp(req)}`, 30, 10 * 60_000);
  if (!limit.ok) return message(429, "Please try again shortly", "You've opened a lot of receipts in a short time. Please wait a few minutes and try the link again.");

  const { token } = await params;
  const built = isReceiptToken(token) ? await buildReceiptPdf({ token }) : null;
  if (!built) {
    return message(
      404,
      "We couldn't find this receipt",
      "The link may be incomplete, or the order may have been cancelled. Please check you've copied the whole link from your email, or reply to your order email to contact the shop.",
    );
  }
  return new Response(pdfBody(built.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${built.filename}"`, ...NO_INDEX },
  });
}
