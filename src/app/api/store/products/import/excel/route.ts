import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { friendlyColumnList, parseExcelRows, splitImportRows } from "@/lib/store/product-import";

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
    return NextResponse.json({ error: "Please choose an Excel file to import." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch (err) {
    console.error("Excel import: failed to open workbook", err);
    return NextResponse.json(
      { error: "We couldn't open that file. Please make sure it's a real Excel (.xlsx) file, not a renamed .csv or .xls, and try again." },
      { status: 400 },
    );
  }

  if (!workbook.worksheets[0]) {
    return NextResponse.json(
      { error: "That workbook doesn't have any sheets in it. Please add your products to the first sheet and try again." },
      { status: 400 },
    );
  }

  const { hasRecognizedColumns, rows } = parseExcelRows(workbook);
  if (!hasRecognizedColumns) {
    return NextResponse.json(
      {
        error: `We couldn't find any recognizable column headers in the first row. Make sure the first row of your sheet has column titles like: ${friendlyColumnList()}.`,
      },
      { status: 400 },
    );
  }

  const { toInsert, skipped } = splitImportRows(rows, tenantId);

  if (!toInsert.length) {
    return NextResponse.json(
      {
        error:
          skipped.length > 0
            ? "We couldn't import any products from that file — every row is missing a name, a price, or both. Please check the file and try again."
            : "That sheet doesn't have any product rows below the header. Please check the file and try again.",
      },
      { status: 400 },
    );
  }

  const service = createServerSupabaseClient();
  const { data, error } = await service.schema("store").from("products").insert(toInsert).select("id");

  if (error) {
    console.error("Excel import: insert failed", error);
    return NextResponse.json(
      { error: "We read your file, but couldn't save the products. Please try again — if this keeps happening, contact support." },
      { status: 400 },
    );
  }

  return NextResponse.json({ imported: data?.length || 0, skipped });
}
