import type ExcelJS from "exceljs";

/** Shared row shape + mapping for bulk product import, regardless of
 * source file format (CSV, Excel, ...) -- every importer parses its own
 * file format into this same loosely-typed row shape, then hands off to
 * mapImportRow so the validation/insert logic only lives in one place. */
export type ProductImportRow = {
  name?: unknown;
  description?: unknown;
  price?: unknown;
  cost_price?: unknown;
  sku?: unknown;
  category?: unknown;
  brand?: unknown;
  stock?: unknown;
  image_url?: unknown;
};

export const PRODUCT_IMPORT_COLUMNS = [
  "name",
  "description",
  "price",
  "cost_price",
  "sku",
  "category",
  "brand",
  "stock",
  "image_url",
] as const;

/** Human-readable column names for error messages -- merchants see "Cost
 * Price", never "cost_price". */
export const PRODUCT_IMPORT_COLUMN_LABELS: Record<(typeof PRODUCT_IMPORT_COLUMNS)[number], string> = {
  name: "Name",
  description: "Description",
  price: "Price",
  cost_price: "Cost Price",
  sku: "SKU",
  category: "Category",
  brand: "Brand",
  stock: "Stock",
  image_url: "Image URL",
};

export function friendlyColumnList(): string {
  return PRODUCT_IMPORT_COLUMNS.map((c) => PRODUCT_IMPORT_COLUMN_LABELS[c]).join(", ");
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const str = String(value).trim();
  return str === "" ? undefined : str;
}

function asNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/** Every row needs a name and a valid price -- everything else is optional
 * and defaults sensibly. Returns a plain-English reason when a row can't be
 * imported, or null when it's fine, so callers can report exactly why each
 * skipped row was skipped instead of just dropping it silently. */
export function describeImportRowIssue(row: ProductImportRow): string | null {
  const hasName = Boolean(asString(row.name));
  const hasPrice = asNumber(row.price) !== undefined;

  if (!hasName && !hasPrice) return "Missing a product name and a price.";
  if (!hasName) return "Missing a product name.";
  if (!hasPrice) return "Missing a price, or the price isn't a number.";
  return null;
}

export function isImportableRow(row: ProductImportRow): boolean {
  return describeImportRowIssue(row) === null;
}

export type ImportRowIssue = { row: number; reason: string };

export type ImportSplitResult = {
  toInsert: ReturnType<typeof mapImportRow>[];
  skipped: ImportRowIssue[];
};

/** Splits parsed rows (each tagged with its original spreadsheet row number)
 * into ones ready to insert and ones to report back to the merchant as
 * skipped, with a plain-English reason for each -- shared by both the CSV
 * and Excel routes so the reporting behaves identically either way. */
export function splitImportRows(
  rows: Array<{ rowNumber: number; data: ProductImportRow }>,
  tenantId: string,
): ImportSplitResult {
  const toInsert: ReturnType<typeof mapImportRow>[] = [];
  const skipped: ImportRowIssue[] = [];

  for (const { rowNumber, data } of rows) {
    const issue = describeImportRowIssue(data);
    if (issue) {
      skipped.push({ row: rowNumber, reason: issue });
    } else {
      toInsert.push(mapImportRow(data, tenantId));
    }
  }

  return { toInsert, skipped };
}

export type ParsedExcelSheet = {
  /** False when the header row matched none of PRODUCT_IMPORT_COLUMNS --
   * distinct from "matched, but zero data rows below it" so the route can
   * give an accurate error message for each case. */
  hasRecognizedColumns: boolean;
  rows: Array<{ rowNumber: number; data: ProductImportRow }>;
};

/** Reads the first worksheet's header row to find which columns match the
 * known import fields (order-independent, case-insensitive, spaces ->
 * underscores so "Cost Price" matches "cost_price"), then extracts every
 * subsequent row into that shape, tagged with its real spreadsheet row
 * number. Pure function so it's testable without a running server or an
 * uploaded file -- only I/O is decoding the workbook the caller already
 * loaded. */
export function parseExcelRows(workbook: ExcelJS.Workbook): ParsedExcelSheet {
  const sheet = workbook.worksheets[0];
  if (!sheet) return { hasRecognizedColumns: false, rows: [] };

  const headerRow = sheet.getRow(1);
  const columnKeys: Record<number, string> = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    if ((PRODUCT_IMPORT_COLUMNS as readonly string[]).includes(key)) columnKeys[colNumber] = key;
  });

  if (Object.keys(columnKeys).length === 0) return { hasRecognizedColumns: false, rows: [] };

  const rows: Array<{ rowNumber: number; data: ProductImportRow }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const record: ProductImportRow = {};
    row.eachCell((cell, colNumber) => {
      const key = columnKeys[colNumber];
      if (key) (record as Record<string, unknown>)[key] = cell.value;
    });
    rows.push({ rowNumber, data: record });
  });

  return { hasRecognizedColumns: true, rows };
}

export function mapImportRow(row: ProductImportRow, tenantId: string) {
  return {
    tenant_id: tenantId,
    name: asString(row.name) || "",
    description: asString(row.description) || null,
    price: asNumber(row.price) || 0,
    cost_price: asNumber(row.cost_price) ?? null,
    sku: asString(row.sku) || null,
    category: asString(row.category) || null,
    brand: asString(row.brand) || null,
    stock: asNumber(row.stock) ?? 0,
    image_url: asString(row.image_url) || null,
  };
}
