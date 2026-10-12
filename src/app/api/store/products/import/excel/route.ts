import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { friendlyColumnList, parseExcelRows } from "@/lib/store/product-import";
import { MAX_IMPORT_FILE_BYTES, respondToImport } from "@/lib/store/product-import-server";

/** POST /api/store/products/import/excel (form: slug, file, mode=preview|save). Preview first; save once the merchant confirms. */
export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Please choose an Excel file to import." }, { status: 400 });

  const resolved = await resolveStoreRequest(String(formData.get("slug") || ""));
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canImportProducts) {
    return NextResponse.json({ error: "Only an owner or admin can bulk-import products." }, { status: 403 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please choose an Excel file to import." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json({ error: "That file is larger than 5 MB. Please split it into smaller files and import them one at a time." }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch (err) {
    console.error("Excel import: failed to open workbook", err);
    return NextResponse.json(
      { error: "We couldn't open that file. Please make sure it's an Excel (.xlsx) file, not a renamed .csv or an old .xls, and try again." },
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
      { error: `We couldn't find any column titles we recognise in the first row. Use titles like: ${friendlyColumnList()}. The template shows the layout.` },
      { status: 400 },
    );
  }

  return respondToImport({
    service: resolved.service,
    tenantId: resolved.access.tenantId,
    userId: resolved.access.userId,
    rows,
    mode: formData.get("mode") === "save" ? "save" : "preview",
    source: "excel",
  });
}
