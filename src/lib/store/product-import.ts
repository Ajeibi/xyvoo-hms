import Papa from "papaparse";
import type ExcelJS from "exceljs";
import { optionsKey, type VariantInput } from "./variants";
import { slugifyProductName, uniqueSlug } from "./product-catalogue";

/*
 * Catalogue spreadsheets: the columns we read and write, parsing a file's rows
 * into one shape whatever the format (CSV or Excel), and working out what an
 * import will do before anything is saved.
 *
 * One row per product. A product with options (sizes, colours) has an extra
 * row for each option, with "Option" filled in (for example "Size=M,
 * Colour=Red") and the product's SKU or web link repeated so we know which
 * product it belongs to. Re-importing an export updates the same products:
 * rows are matched by SKU, then by web link.
 */

export const PRODUCT_IMPORT_COLUMNS = [
  "name",
  "sku",
  "slug",
  "price",
  "compare_at_price",
  "cost_price",
  "stock",
  "category",
  "brand",
  "tags",
  "status",
  "description",
  "image_url",
  "option",
  "variant_sku",
  "variant_price",
  "variant_stock",
  "variant_barcode",
] as const;

export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number];

export type ProductImportRow = Partial<Record<ProductImportColumn, unknown>>;

/** The header merchants see in the template and the export. Plain words, never "cost_price". */
export const PRODUCT_IMPORT_COLUMN_LABELS: Record<ProductImportColumn, string> = {
  name: "Name",
  sku: "SKU",
  slug: "Web link",
  price: "Price",
  compare_at_price: "Was price",
  cost_price: "Cost price",
  stock: "Stock",
  category: "Category",
  brand: "Brand",
  tags: "Tags",
  status: "Status",
  description: "Description",
  image_url: "Image URL",
  option: "Option",
  variant_sku: "Option SKU",
  variant_price: "Option price",
  variant_stock: "Option stock",
  variant_barcode: "Option barcode",
};

/** Other headers people commonly use, all mapped to our columns. Keys are already normalised (see normaliseHeader). */
const HEADER_ALIASES: Record<string, ProductImportColumn> = {
  product: "name",
  product_name: "name",
  title: "name",
  stock_code: "sku",
  stock_code_sku: "sku",
  product_sku: "sku",
  web_link: "slug",
  handle: "slug",
  url_handle: "slug",
  selling_price: "price",
  was_price: "compare_at_price",
  compare_at_price: "compare_at_price",
  cost: "cost_price",
  what_it_costs_you: "cost_price",
  quantity: "stock",
  qty: "stock",
  how_many_you_have: "stock",
  image: "image_url",
  photo: "image_url",
  photo_link: "image_url",
  options: "option",
  variant: "option",
  option_sku: "variant_sku",
  option_price: "variant_price",
  option_stock: "variant_stock",
  option_barcode: "variant_barcode",
};

/** "Cost Price", "cost price " and "COST_PRICE" all become "cost_price". */
export function normaliseHeader(header: unknown) {
  return String(header ?? "")
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The column a header means, or null when we don't use it. */
export function columnForHeader(header: unknown): ProductImportColumn | null {
  const key = normaliseHeader(header);
  if ((PRODUCT_IMPORT_COLUMNS as readonly string[]).includes(key)) return key as ProductImportColumn;
  return HEADER_ALIASES[key] ?? null;
}

export function friendlyColumnList(): string {
  return PRODUCT_IMPORT_COLUMNS.map((c) => PRODUCT_IMPORT_COLUMN_LABELS[c]).join(", ");
}

// ---------------------------------------------------------------------------
// Reading cell values
// ---------------------------------------------------------------------------

/** Excel cells can be formulas, rich text or links; this gets the value a person sees. */
function plainCellValue(value: unknown): unknown {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: Array<{ text: string }>; text?: unknown; hyperlink?: unknown };
    if ("result" in v) return plainCellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return plainCellValue(v.text);
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return undefined;
  }
  return value;
}

function asString(value: unknown): string | undefined {
  const plain = plainCellValue(value);
  if (plain == null) return undefined;
  let str = String(plain).trim();
  // The export puts an apostrophe before text that starts like a formula; take it off again.
  if (/^'[=+\-@]/.test(str)) str = str.slice(1);
  return str === "" ? undefined : str;
}

type NumberCell = { kind: "blank" } | { kind: "ok"; value: number } | { kind: "bad" };

/** Accepts 5000, "5,000", "₦5,000.00" and "NGN 5000". Anything else that isn't blank is "bad". */
function readNumber(value: unknown): NumberCell {
  const plain = plainCellValue(value);
  if (typeof plain === "number") return Number.isFinite(plain) ? { kind: "ok", value: plain } : { kind: "bad" };
  const str = asString(plain);
  if (str === undefined) return { kind: "blank" };
  const cleaned = str.replace(/^(NGN|GBP|USD|EUR|GHS|KES|ZAR)\s*/i, "").replace(/[₦£$€\s,]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return { kind: "bad" };
  const num = Number(cleaned);
  return Number.isFinite(num) ? { kind: "ok", value: num } : { kind: "bad" };
}

/** "Size=M, Colour=Red" (or "Size: M; Colour: Red"). A bare value like "Red" becomes Option=Red. */
export function parseOptionCell(text: string): Record<string, string> {
  const options: Record<string, string> = {};
  for (const part of text.split(/[,;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([^=:]+)[=:](.+)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key && value) options[key] = value;
    } else {
      options.Option = options.Option ? `${options.Option} ${trimmed}` : trimmed;
    }
  }
  return options;
}

export function formatOptionCell(options: Record<string, string>) {
  return Object.entries(options || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

/** Every row needs a name and a valid price to create a product. Kept for the plain messages it gives. */
export function describeImportRowIssue(row: ProductImportRow): string | null {
  const hasName = Boolean(asString(row.name));
  const price = readNumber(row.price);
  const hasPrice = price.kind === "ok";

  if (!hasName && !hasPrice) return "the name and price are missing.";
  if (!hasName) return "the product name is missing.";
  if (price.kind === "bad") return "the price isn't a number.";
  if (!hasPrice) return "the price is missing.";
  return null;
}

export function isImportableRow(row: ProductImportRow): boolean {
  return describeImportRowIssue(row) === null;
}

export type ImportRowIssue = { row: number; reason: string };

// ---------------------------------------------------------------------------
// Parsing files
// ---------------------------------------------------------------------------

export type ParsedImportSheet = {
  /** False when the header row matched none of our columns -- different from "no rows below it". */
  hasRecognizedColumns: boolean;
  rows: Array<{ rowNumber: number; data: ProductImportRow }>;
};

/** @deprecated name kept for older callers; same shape as ParsedImportSheet. */
export type ParsedExcelSheet = ParsedImportSheet;

function isBlankRow(row: ProductImportRow) {
  return Object.values(row).every((v) => asString(v) === undefined);
}

/**
 * Reads the first worksheet: the header row decides which column is which
 * (any order, any case, "Cost Price" or "cost_price"), then every row below it
 * is read with its real spreadsheet row number. Blank rows are left out.
 */
export function parseExcelRows(workbook: ExcelJS.Workbook): ParsedImportSheet {
  const sheet = workbook.worksheets[0];
  if (!sheet) return { hasRecognizedColumns: false, rows: [] };

  const columnKeys: Record<number, ProductImportColumn> = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const key = columnForHeader(plainCellValue(cell.value));
    if (key && !Object.values(columnKeys).includes(key)) columnKeys[colNumber] = key;
  });
  if (Object.keys(columnKeys).length === 0) return { hasRecognizedColumns: false, rows: [] };

  const rows: ParsedImportSheet["rows"] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: ProductImportRow = {};
    row.eachCell((cell, colNumber) => {
      const key = columnKeys[colNumber];
      if (key) record[key] = plainCellValue(cell.value);
    });
    if (!isBlankRow(record)) rows.push({ rowNumber, data: record });
  });
  return { hasRecognizedColumns: true, rows };
}

export type ParsedCsv = ParsedImportSheet & { unreadable: boolean };

/** The CSV equivalent of parseExcelRows. Row numbers match what the merchant sees in their spreadsheet (header is row 1). */
export function parseCsvRows(text: string): ParsedCsv {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  // Papa reports a missing trailing line ending and similar as errors; only give up on real breakage.
  const fatal = parsed.errors.some((e) => e.type === "Quotes" || e.type === "Delimiter");
  if (fatal) return { hasRecognizedColumns: false, rows: [], unreadable: true };

  const [header = [], ...body] = parsed.data;
  const columnKeys: Record<number, ProductImportColumn> = {};
  header.forEach((cell, index) => {
    const key = columnForHeader(cell);
    if (key && !Object.values(columnKeys).includes(key)) columnKeys[index] = key;
  });
  if (Object.keys(columnKeys).length === 0) return { hasRecognizedColumns: false, rows: [], unreadable: false };

  const rows: ParsedImportSheet["rows"] = [];
  body.forEach((cells, index) => {
    const record: ProductImportRow = {};
    cells.forEach((cell, col) => {
      const key = columnKeys[col];
      if (key) record[key] = cell;
    });
    if (!isBlankRow(record)) rows.push({ rowNumber: index + 2, data: record });
  });
  return { hasRecognizedColumns: true, rows, unreadable: false };
}

// ---------------------------------------------------------------------------
// Planning an import
// ---------------------------------------------------------------------------

export type ExistingVariant = {
  id: string;
  options: Record<string, string>;
  sku: string | null;
  price_override: number | null;
  stock: number;
  image_url: string | null;
  barcode: string | null;
  weight_kg: number | null;
};

export type ExistingCatalogueProduct = {
  id: string;
  name: string;
  sku: string | null;
  slug: string | null;
  variants: ExistingVariant[];
};

export type PlannedProduct = {
  /** Set when this updates a product the shop already has. */
  id?: string;
  /** The row the product's details came from, for messages. */
  rowNumber: number;
  /** Only the columns the file filled in (a blank cell leaves the saved value alone). */
  fields: Record<string, unknown>;
  /** The product's full set of options after the import, or undefined to leave them as they are. */
  variants?: VariantInput[];
};

export type ImportPlan = {
  creates: PlannedProduct[];
  updates: PlannedProduct[];
  problems: ImportRowIssue[];
};

type ParsedRow = {
  rowNumber: number;
  name?: string;
  sku?: string;
  slug?: string;
  fields: Record<string, unknown>;
  option?: Record<string, string>;
  variant: { sku?: string; price?: number; stock?: number; barcode?: string };
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUS_WORDS: Record<string, "active" | "draft" | "archived"> = {
  active: "active",
  live: "active",
  "on sale": "active",
  draft: "draft",
  archived: "archived",
  archive: "archived",
};

/** Turns one spreadsheet row into column values, or a plain reason it can't be used. */
function readRow(rowNumber: number, data: ProductImportRow): ParsedRow | ImportRowIssue {
  const fields: Record<string, unknown> = {};
  const problem = (reason: string): ImportRowIssue => ({ row: rowNumber, reason });

  const name = asString(data.name);
  if (name) {
    if (name.length > 200) return problem("the name is longer than 200 characters.");
    fields.name = name;
  }
  const sku = asString(data.sku);
  if (sku) fields.sku = sku;
  const slugText = asString(data.slug);
  let slug: string | undefined;
  if (slugText) {
    slug = slugText.toLowerCase();
    if (!SLUG_PATTERN.test(slug)) return problem("the web link can only use lowercase letters, numbers and single hyphens.");
    fields.slug = slug;
  }

  const moneyColumns: Array<[ProductImportColumn, string, string]> = [
    ["price", "price", "price"],
    ["compare_at_price", "compare_at_price", "was price"],
    ["cost_price", "cost_price", "cost price"],
  ];
  for (const [column, field, label] of moneyColumns) {
    const cell = readNumber(data[column]);
    if (cell.kind === "bad") return problem(`the ${label} isn't a number.`);
    if (cell.kind === "ok") {
      if (cell.value < 0) return problem(`the ${label} can't be below zero.`);
      fields[field] = Math.round(cell.value * 100) / 100;
    }
  }

  const stock = readNumber(data.stock);
  if (stock.kind === "bad") return problem("the stock isn't a number.");
  if (stock.kind === "ok") {
    if (!Number.isInteger(stock.value) || stock.value < 0) return problem("the stock must be a whole number, 0 or more.");
    fields.stock = stock.value;
  }

  for (const column of ["category", "brand", "description", "image_url"] as const) {
    const value = asString(data[column]);
    if (value) fields[column] = value;
  }
  const tags = asString(data.tags);
  if (tags) fields.tags = [...new Set(tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean))];

  const statusText = asString(data.status);
  if (statusText) {
    const status = STATUS_WORDS[statusText.toLowerCase()];
    if (!status) return problem("the status must be Active, Draft or Archived.");
    fields.status = status;
  }

  const optionText = asString(data.option);
  const option = optionText ? parseOptionCell(optionText) : undefined;
  if (optionText && (!option || Object.keys(option).length === 0)) return problem("write the option like Size=M, Colour=Red.");

  const variant: ParsedRow["variant"] = {};
  const variantSku = asString(data.variant_sku);
  if (variantSku) variant.sku = variantSku;
  const variantBarcode = asString(data.variant_barcode);
  if (variantBarcode) variant.barcode = variantBarcode;
  const variantPrice = readNumber(data.variant_price);
  if (variantPrice.kind === "bad") return problem("the option price isn't a number.");
  if (variantPrice.kind === "ok") {
    if (variantPrice.value < 0) return problem("the option price can't be below zero.");
    variant.price = Math.round(variantPrice.value * 100) / 100;
  }
  const variantStock = readNumber(data.variant_stock);
  if (variantStock.kind === "bad") return problem("the option stock isn't a number.");
  if (variantStock.kind === "ok") {
    if (!Number.isInteger(variantStock.value) || variantStock.value < 0) return problem("the option stock must be a whole number, 0 or more.");
    variant.stock = variantStock.value;
  }
  if (!option && Object.keys(variant).length > 0) return problem("option details are filled in, but the Option column is empty.");

  return { rowNumber, name, sku, slug, fields, option, variant };
}

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Which rows belong to the same product: same SKU, else same web link, else (for rows with neither) same name. */
function groupKey(row: ParsedRow) {
  if (row.sku) return `sku:${lower(row.sku)}`;
  if (row.slug) return `slug:${row.slug}`;
  if (row.name) return `name:${lower(row.name)}`;
  return null;
}

/**
 * Works out what an import will do, without saving anything: which rows make
 * new products, which update existing ones (matched by SKU, then by web
 * link), and which rows have problems and why. Products the file doesn't
 * mention are left alone, and so are options the file doesn't mention.
 */
export function planCatalogueImport(
  rows: Array<{ rowNumber: number; data: ProductImportRow }>,
  existing: ExistingCatalogueProduct[],
): ImportPlan {
  const plan: ImportPlan = { creates: [], updates: [], problems: [] };

  const bySku = new Map<string, ExistingCatalogueProduct>();
  const bySlug = new Map<string, ExistingCatalogueProduct>();
  const unnamedByName = new Map<string, ExistingCatalogueProduct[]>();
  for (const p of existing) {
    if (p.sku && !bySku.has(lower(p.sku))) bySku.set(lower(p.sku), p);
    if (p.slug) bySlug.set(p.slug, p);
    if (!p.sku && !p.slug) unnamedByName.set(lower(p.name), [...(unnamedByName.get(lower(p.name)) || []), p]);
  }
  const takenSlugs = new Set(existing.map((p) => p.slug).filter((s): s is string => Boolean(s)));

  // 1. Read every row, and group them by product.
  const groups = new Map<string, ParsedRow[]>();
  for (const { rowNumber, data } of rows) {
    const parsed = readRow(rowNumber, data);
    if ("reason" in parsed) {
      plan.problems.push(parsed);
      continue;
    }
    const key = groupKey(parsed);
    if (!key) {
      plan.problems.push({ row: rowNumber, reason: "add a name, SKU or web link so we know which product this row is for." });
      continue;
    }
    groups.set(key, [...(groups.get(key) || []), parsed]);
  }

  // Rows with only a name (often hand-typed option rows) join the one SKU or web-link group with that name, if there is one.
  for (const [key, groupRows] of [...groups]) {
    if (!key.startsWith("name:") || !groupRows.every((r) => r.option)) continue;
    const name = key.slice(5);
    const homes = [...groups].filter(([k, rs]) => !k.startsWith("name:") && rs.some((r) => lower(r.name) === name));
    if (homes.length === 1) {
      homes[0][1].push(...groupRows);
      homes[0][1].sort((a, b) => a.rowNumber - b.rowNumber);
      groups.delete(key);
    }
  }

  const claimedBy = new Map<string, number>();

  // 2. One product per group.
  for (const groupRows of groups.values()) {
    const main = groupRows.find((r) => !r.option) ?? groupRows[0];
    const optionRows = groupRows.filter((r) => r.option);
    const extraMainRows = groupRows.filter((r) => !r.option && r !== main);
    const skipRest = (reason: string) => {
      for (const r of optionRows) if (r !== main) plan.problems.push({ row: r.rowNumber, reason });
    };

    for (const r of extraMainRows) {
      plan.problems.push({ row: r.rowNumber, reason: `this product is already on row ${main.rowNumber}. Add an Option to make it a size or colour.` });
    }

    const match =
      (main.sku ? bySku.get(lower(main.sku)) : undefined) ??
      (main.slug ? bySlug.get(main.slug) : undefined) ??
      (!main.sku && !main.slug && main.name && unnamedByName.get(lower(main.name))?.length === 1
        ? unnamedByName.get(lower(main.name))![0]
        : undefined);

    if (match) {
      const earlier = claimedBy.get(match.id);
      if (earlier !== undefined) {
        plan.problems.push({ row: main.rowNumber, reason: `this is the same product as row ${earlier}.` });
        skipRest(`skipped because row ${main.rowNumber} has a problem.`);
        continue;
      }
    }

    const fields = { ...main.fields };

    if (!match) {
      const issue = !fields.name && fields.price === undefined
        ? "the name and price are missing."
        : !fields.name
          ? "the product name is missing."
          : fields.price === undefined
            ? "the price is missing."
            : null;
      if (issue) {
        plan.problems.push({ row: main.rowNumber, reason: issue });
        skipRest(`skipped because row ${main.rowNumber} has a problem.`);
        continue;
      }
    }

    // Web links must stay unique in the shop.
    if (fields.slug && fields.slug !== match?.slug && takenSlugs.has(fields.slug as string)) {
      plan.problems.push({ row: main.rowNumber, reason: "another product already uses that web link." });
      skipRest(`skipped because row ${main.rowNumber} has a problem.`);
      continue;
    }
    if (!match && !fields.slug) fields.slug = uniqueSlug(slugifyProductName(String(fields.name)), takenSlugs);
    if (fields.slug) {
      if (match?.slug && match.slug !== fields.slug) takenSlugs.delete(match.slug);
      takenSlugs.add(fields.slug as string);
    }

    // Options: update the ones the file mentions, add new ones, keep the rest.
    let variants: VariantInput[] | undefined;
    if (optionRows.length) {
      const existingVariants = match?.variants ?? [];
      const used = new Set<string>();
      const seenOptions = new Map<string, number>();
      variants = [];
      for (const r of optionRows) {
        const key = optionsKey(r.option!);
        const seen = seenOptions.get(key);
        if (seen !== undefined) {
          plan.problems.push({ row: r.rowNumber, reason: `this option is already on row ${seen}.` });
          continue;
        }
        seenOptions.set(key, r.rowNumber);
        const found =
          (r.variant.sku ? existingVariants.find((v) => !used.has(v.id) && v.sku && lower(v.sku) === lower(r.variant.sku)) : undefined) ??
          existingVariants.find((v) => !used.has(v.id) && optionsKey(v.options) === key);
        if (found) used.add(found.id);
        variants.push({
          id: found?.id,
          options: r.option!,
          sku: r.variant.sku ?? found?.sku ?? undefined,
          price_override: r.variant.price ?? found?.price_override ?? undefined,
          stock: r.variant.stock ?? found?.stock ?? 0,
          image_url: found?.image_url ?? undefined,
          barcode: r.variant.barcode ?? found?.barcode ?? undefined,
          weight_kg: found?.weight_kg ?? undefined,
        });
      }
      for (const v of existingVariants) {
        if (used.has(v.id)) continue;
        variants.push({
          id: v.id,
          options: v.options,
          sku: v.sku ?? undefined,
          price_override: v.price_override ?? undefined,
          stock: v.stock,
          image_url: v.image_url ?? undefined,
          barcode: v.barcode ?? undefined,
          weight_kg: v.weight_kg ?? undefined,
        });
      }
    }

    if (match) {
      claimedBy.set(match.id, main.rowNumber);
      plan.updates.push({ id: match.id, rowNumber: main.rowNumber, fields, variants });
    } else {
      plan.creates.push({ rowNumber: main.rowNumber, fields: { status: "active", stock: 0, ...fields }, variants });
    }
  }

  plan.problems.sort((a, b) => a.row - b.row);
  return plan;
}

/** "12 new, 30 updated, 3 rows with problems". */
export function summariseImportPlan(plan: Pick<ImportPlan, "creates" | "updates" | "problems">) {
  const parts = [`${plan.creates.length} new`, `${plan.updates.length} updated`];
  const problemRows = new Set(plan.problems.map((p) => p.row)).size;
  if (problemRows) parts.push(`${problemRows} ${problemRows === 1 ? "row" : "rows"} with problems`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Writing spreadsheets: the export and the template
// ---------------------------------------------------------------------------

export type ExportProduct = {
  name: string;
  sku: string | null;
  slug: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  stock: number;
  category: string | null;
  brand: string | null;
  tags: string[] | null;
  status: string;
  description: string | null;
  image_url: string | null;
  product_variants?: Array<ExistingVariant & { archived_at?: string | null }>;
};

const HEADER = PRODUCT_IMPORT_COLUMNS.map((c) => PRODUCT_IMPORT_COLUMN_LABELS[c]);

/** Stops a spreadsheet treating text such as "=SUM(...)" as a formula when the file is opened. */
function safeText(value: string | null | undefined) {
  if (!value) return "";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const STATUS_LABEL: Record<string, string> = { active: "Active", draft: "Draft", archived: "Archived" };

/** The whole catalogue as CSV: a row per product, then a row per option repeating its name, SKU and web link. */
export function catalogueToCsv(products: ExportProduct[]) {
  const rows: string[][] = [HEADER];
  for (const p of products) {
    const identity = { name: safeText(p.name), sku: safeText(p.sku), slug: p.slug ?? "" };
    const productRow: Record<ProductImportColumn, string> = {
      ...identity,
      price: String(Number(p.price) || 0),
      compare_at_price: p.compare_at_price != null ? String(p.compare_at_price) : "",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      stock: String(p.stock ?? 0),
      category: safeText(p.category),
      brand: safeText(p.brand),
      tags: (p.tags || []).join(", "),
      status: STATUS_LABEL[p.status] ?? p.status,
      description: safeText(p.description),
      image_url: p.image_url ?? "",
      option: "",
      variant_sku: "",
      variant_price: "",
      variant_stock: "",
      variant_barcode: "",
    };
    rows.push(PRODUCT_IMPORT_COLUMNS.map((c) => productRow[c]));
    for (const v of (p.product_variants || []).filter((v) => !v.archived_at)) {
      const variantRow: Partial<Record<ProductImportColumn, string>> = {
        ...identity,
        option: safeText(formatOptionCell(v.options)),
        variant_sku: safeText(v.sku),
        variant_price: v.price_override != null ? String(v.price_override) : "",
        variant_stock: String(v.stock ?? 0),
        variant_barcode: safeText(v.barcode),
      };
      rows.push(PRODUCT_IMPORT_COLUMNS.map((c) => variantRow[c] ?? ""));
    }
  }
  return Papa.unparse(rows, { newline: "\r\n" });
}

/** The downloadable template: plain headers and a few example rows to copy. */
export function catalogueTemplateCsv() {
  const example = (values: Partial<Record<ProductImportColumn, string>>) => PRODUCT_IMPORT_COLUMNS.map((c) => values[c] ?? "");
  return Papa.unparse(
    [
      HEADER,
      example({
        name: "Ankara wrap dress",
        sku: "DRESS-001",
        price: "15000",
        compare_at_price: "18000",
        cost_price: "9000",
        stock: "12",
        category: "Dresses",
        brand: "Adire House",
        tags: "summer, cotton",
        status: "Active",
        description: "A bright cotton wrap dress, made in Lagos.",
      }),
      example({ name: "Leather sandals", sku: "SANDAL-01", price: "12500", category: "Shoes", status: "Active" }),
      example({ name: "Leather sandals", sku: "SANDAL-01", option: "Size=40", variant_stock: "4" }),
      example({ name: "Leather sandals", sku: "SANDAL-01", option: "Size=41", variant_stock: "6" }),
      example({ name: "Leather sandals", sku: "SANDAL-01", option: "Size=42", variant_stock: "2", variant_price: "13000" }),
      example({ name: "Shea butter, 250g", price: "4000", stock: "30", category: "Skincare", status: "Draft" }),
    ],
    { newline: "\r\n" },
  );
}
