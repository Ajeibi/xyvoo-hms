import { copyProductImages } from "@/lib/store/external-images";
import { shopChanged } from "@/lib/store/site/shop-changed";
import { after, NextResponse } from "next/server";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncProductVariants, type VariantInput } from "./variants";
import {
  planCatalogueImport,
  summariseImportPlan,
  type ExistingCatalogueProduct,
  type ImportPlan,
  type ImportRowIssue,
  type PlannedProduct,
  type ProductImportRow,
} from "./product-import";

type Service = ReturnType<typeof createServerSupabaseClient>;

/** Biggest file and most rows one import takes, so a request can't run for ever. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

/** Every product in the shop with its live options: what an import matches rows against. */
export async function loadCatalogueForImport(service: Service, tenantId: string): Promise<ExistingCatalogueProduct[]> {
  const { data, error } = await service
    .schema("store")
    .from("products")
    .select("id, name, sku, slug, product_variants(id, options, sku, price_override, stock, image_url, barcode, weight_kg, archived_at)")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return (data || []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    sku: p.sku as string | null,
    slug: p.slug as string | null,
    variants: ((p.product_variants as Array<ExistingCatalogueProduct["variants"][number] & { archived_at: string | null }>) || []).filter(
      (v) => !v.archived_at,
    ),
  }));
}

const variantColumns = (productId: string, v: VariantInput) => ({
  product_id: productId,
  options: v.options || {},
  sku: v.sku || null,
  price_override: v.price_override ?? null,
  stock: v.stock ?? 0,
  image_url: v.image_url || null,
  barcode: v.barcode || null,
  weight_kg: v.weight_kg ?? null,
});

const SAVE_FAILED = "we couldn't save this row. Please try again.";

/** Runs async work over items a few at a time. */
async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

/** Saves a plan. Rows that fail to save are reported back rather than stopping the rest. */
export async function applyImportPlan(
  service: Service,
  tenantId: string,
  userId: string,
  plan: ImportPlan,
  source: "csv" | "excel",
): Promise<{ created: number; updated: number; failed: ImportRowIssue[] }> {
  const db = service.schema("store");
  const failed: ImportRowIssue[] = [];
  const batchId = crypto.randomUUID();
  let created = 0;
  let updated = 0;

  // New products, 100 at a time. If a batch fails, try its products one by one so one bad row doesn't sink the rest.
  const insertOne = async (p: PlannedProduct) => {
    const { data, error } = await db
      .from("products")
      .insert({ ...p.fields, tenant_id: tenantId, import_source: source, import_batch_id: batchId })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Product import: create failed", error);
      failed.push({ row: p.rowNumber, reason: SAVE_FAILED });
      return null;
    }
    return data.id as string;
  };

  const createdIds = new Map<PlannedProduct, string>();
  for (let i = 0; i < plan.creates.length; i += 100) {
    const chunk = plan.creates.slice(i, i + 100);
    const { data, error } = await db
      .from("products")
      .insert(chunk.map((p) => ({ ...p.fields, tenant_id: tenantId, import_source: source, import_batch_id: batchId })))
      .select("id, slug");
    if (!error && data) {
      const idBySlug = new Map(data.map((r) => [r.slug as string, r.id as string]));
      for (const p of chunk) {
        const id = idBySlug.get(p.fields.slug as string);
        if (id) createdIds.set(p, id);
      }
    } else {
      console.error("Product import: batch create failed, retrying one by one", error);
      for (const p of chunk) {
        const id = await insertOne(p);
        if (id) createdIds.set(p, id);
      }
    }
  }
  created = createdIds.size;

  const newVariants = [...createdIds].flatMap(([p, id]) => (p.variants || []).map((v) => variantColumns(id, v)));
  for (let i = 0; i < newVariants.length; i += 200) {
    const { error } = await db.from("product_variants").insert(newVariants.slice(i, i + 200));
    if (error) {
      console.error("Product import: variant create failed", error);
      const rows = [...createdIds].filter(([p]) => p.variants?.length).map(([p]) => p.rowNumber);
      failed.push(...rows.map((row) => ({ row, reason: "the product was added, but we couldn't save its options. Please add them by hand." })));
      break;
    }
  }

  // Existing products, a few at a time.
  const audit: Array<{ tenant_id: string; product_id: string; user_id: string; changed_fields: Record<string, unknown> }> = [];
  await inBatches(plan.updates, 5, async (p) => {
    const id = p.id!;
    if (Object.keys(p.fields).length) {
      const { error } = await db.from("products").update(p.fields).eq("id", id).eq("tenant_id", tenantId);
      if (error) {
        console.error("Product import: update failed", error);
        failed.push({ row: p.rowNumber, reason: SAVE_FAILED });
        return;
      }
      audit.push({ tenant_id: tenantId, product_id: id, user_id: userId, changed_fields: { ...p.fields, import_batch_id: batchId } });
    }
    if (p.variants) {
      try {
        // The product was matched from this store's own catalogue, so the id is the tenant's.
        await syncProductVariants(service, id, p.variants);
      } catch (err) {
        console.error("Product import: variant sync failed", err);
        failed.push({ row: p.rowNumber, reason: "we updated the product, but couldn't save its options. Please check them." });
      }
    }
    updated += 1;
  });
  if (audit.length) {
    const { error } = await db.from("product_audit_log").insert(audit);
    if (error) console.error("Product import: audit log failed", error);
  }

  failed.sort((a, b) => a.row - b.row);
  return { created, updated, failed };
}

/**
 * What both import routes do once they've read their file: preview what will
 * happen, or save it. Previewing saves nothing; the merchant confirms by
 * sending the same file again with mode=save.
 */
export async function respondToImport({
  service,
  tenantId,
  userId,
  rows,
  mode,
  source,
}: {
  service: Service;
  tenantId: string;
  userId: string;
  rows: Array<{ rowNumber: number; data: ProductImportRow }>;
  mode: "preview" | "save";
  source: "csv" | "excel";
}) {
  if (!rows.length) {
    return NextResponse.json({ error: "That file doesn't have any product rows in it. Please check the file and try again." }, { status: 400 });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `That file has ${rows.length} rows. Please split it into files of up to ${MAX_IMPORT_ROWS} rows and import them one at a time.` },
      { status: 400 },
    );
  }

  let plan: ImportPlan;
  try {
    plan = planCatalogueImport(rows, await loadCatalogueForImport(service, tenantId));
  } catch (err) {
    console.error("Product import: couldn't load the catalogue", err);
    return NextResponse.json({ error: "We couldn't check your products just now. Please try again." }, { status: 500 });
  }

  const preview = {
    newCount: plan.creates.length,
    updatedCount: plan.updates.length,
    problems: plan.problems,
    summary: summariseImportPlan(plan),
  };

  if (mode === "preview") return NextResponse.json({ preview });

  if (!plan.creates.length && !plan.updates.length) {
    return NextResponse.json({ error: "There's nothing we can save from that file. Please fix the rows with problems and try again.", preview }, { status: 400 });
  }

  const result = await applyImportPlan(service, tenantId, userId, plan, source);
  shopChanged(tenantId);
  // Photo addresses in the file are copied into the shop's storage after the reply (it can take a while for a big file).
  after(() => copyProductImages(tenantId));
  return NextResponse.json({
    created: result.created,
    updated: result.updated,
    // Kept as "imported" and "skipped" too, for anything that still reads the old response.
    imported: result.created + result.updated,
    skipped: [...plan.problems, ...result.failed].sort((a, b) => a.row - b.row),
  });
}
