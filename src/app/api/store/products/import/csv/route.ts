import Papa from "papaparse";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { splitImportRows, type ProductImportRow } from "@/lib/store/product-import";

export async function POST(req: Request) {
  const formData = await req.formData();
  const slug = String(formData.get("slug") || "");
  const file = formData.get("file");

  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.tenantId || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!getStoreCapabilities(access.role).canImportProducts) {
    return NextResponse.json({ error: "Only an owner or admin can bulk-import products." }, { status: 403 });
  }
  const tenantId = access.tenantId;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please choose a CSV file to import." }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<ProductImportRow>(text, { header: true, skipEmptyLines: true });

  if (parsed.errors.length) {
    console.error("CSV import: parse failed", parsed.errors);
    return NextResponse.json(
      {
        error:
          "We couldn't read that file as a CSV. Make sure it's a plain, comma-separated file — the kind Excel, Google Sheets, or Numbers export when you choose \"Save As CSV\" — and try again.",
      },
      { status: 400 },
    );
  }

  // Papa's row 1 is the first DATA row (it consumes the header itself), and
  // spreadsheets are 1-indexed with a header row, so the row a merchant sees
  // in their own file is this index + 2.
  const rowsWithNumbers = parsed.data.map((data, index) => ({ rowNumber: index + 2, data }));
  const { toInsert, skipped } = splitImportRows(rowsWithNumbers, tenantId);

  if (!toInsert.length) {
    return NextResponse.json(
      {
        error:
          skipped.length > 0
            ? "We couldn't import any products from that file — every row is missing a name, a price, or both. Please check the file and try again."
            : "That file doesn't have any product rows in it. Please check the file and try again.",
      },
      { status: 400 },
    );
  }

  const service = createServerSupabaseClient();
  const { data, error } = await service.schema("store").from("products").insert(toInsert).select("id");

  if (error) {
    console.error("CSV import: insert failed", error);
    return NextResponse.json(
      { error: "We read your file, but couldn't save the products. Please try again — if this keeps happening, contact support." },
      { status: 400 },
    );
  }

  return NextResponse.json({ imported: data?.length || 0, skipped });
}
