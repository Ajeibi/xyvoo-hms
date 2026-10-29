import { NextResponse } from "next/server";
import { z } from "zod";
import { productNotFound, resolveStoreRequest, storeOwnsProducts } from "@/lib/store/api-helpers";
import { SHOP_LANGUAGES } from "@/lib/store/i18n/languages";
import { shopChanged } from "@/lib/store/site/shop-changed";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** A product's words in one of the languages a shop can be shown in. */
const TranslationSchema = z.object({
  locale: z.enum(SHOP_LANGUAGES, { message: "Choose a language." }),
  name: optionalText(200),
  description: optionalText(10_000),
  short_description: optionalText(300),
  meta_title: optionalText(70),
  meta_description: optionalText(160),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { data, error } = await result.service
    .schema("store")
    .from("product_translations")
    .select("*")
    .eq("product_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ translations: data || [] });
}

/** Upsert by (product_id, locale) so re-saving a locale just updates it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const parsed = TranslationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the translation." }, { status: 400 });

  const { data, error } = await result.service
    .schema("store")
    .from("product_translations")
    .upsert({ product_id: id, ...parsed.data }, { onConflict: "product_id,locale" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Shoppers reading that language see it straight away.
  shopChanged(result.access.tenantId);
  return NextResponse.json({ translation: data }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { error } = await result.service.schema("store").from("product_translations").delete().eq("id", itemId).eq("product_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  shopChanged(result.access.tenantId);
  return NextResponse.json({ success: true });
}
