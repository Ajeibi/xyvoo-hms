import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { catalogueTemplateCsv } from "@/lib/store/product-import";

/** GET /api/store/products/import/template?slug= — a CSV with the import's column titles and a few example rows. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;

  return new Response(`﻿${catalogueTemplateCsv()}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
