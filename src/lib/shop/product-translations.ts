import { allRows } from "@/lib/supabase/all-rows";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShopLanguage } from "@/lib/store/i18n/languages";
import { shopTag } from "@/lib/store/site/shop-changed";
import type { ShopProduct } from "./products";

/*
 * Products in the shopper's language. Merchants can add a product's name and
 * descriptions in each language their shop offers (store.product_translations);
 * where they have, shoppers who chose that language see them, and everyone else
 * sees the product as written. getStorefront records the language for the
 * request, so every product loader on the page follows it without being told.
 */

type Scope = { tenantId: string; language: ShopLanguage; main: ShopLanguage } | null;

/** This request's shop and language, set once by getStorefront. */
const requestScope = cache((): { current: Scope } => ({ current: null }));

export function setProductLanguage(tenantId: string, language: ShopLanguage, main: ShopLanguage) {
  requestScope().current = { tenantId, language, main };
}

type Translation = { name: string | null; description: string | null; shortDescription: string | null };

/** A shop's translations for one language, kept with its other shared data and cleared on every product save. */
async function loadTranslations(tenantId: string, language: ShopLanguage): Promise<Record<string, Translation>> {
  const { data, error } = await allRows<{ product_id: string; locale: string; name: string | null; description: string | null; short_description: string | null }>(
    (from, to) =>
      createServerSupabaseClient()
        .schema("store")
        .from("product_translations")
        .select("product_id, locale, name, description, short_description, products!inner(tenant_id)")
        .eq("products.tenant_id", tenantId)
        // "fr", or a regional form such as "fr-FR".
        .or(`locale.eq.${language},locale.like.${language}-%`)
        .order("id")
        .range(from, to),
    10_000,
  );
  if (error) {
    console.error("[product translations] not loaded", error.message);
    return {};
  }
  const out: Record<string, Translation> = {};
  for (const row of data || []) {
    // The plain language wins over a regional form.
    if (out[row.product_id as string] && row.locale !== language) continue;
    out[row.product_id as string] = {
      name: (row.name as string | null)?.trim() || null,
      description: (row.description as string | null)?.trim() || null,
      shortDescription: (row.short_description as string | null)?.trim() || null,
    };
  }
  return out;
}

const translationsFor = cache((tenantId: string, language: ShopLanguage) =>
  unstable_cache(() => loadTranslations(tenantId, language), ["shop-product-translations-v1", tenantId, language], { tags: [shopTag(tenantId)], revalidate: 300 })(),
);

/** The products with any translation for the shopper's language put in. Unchanged in the shop's main language. */
export async function translateProducts(tenantId: string, products: ShopProduct[]): Promise<ShopProduct[]> {
  const scope = requestScope().current;
  if (!scope || scope.tenantId !== tenantId || scope.language === scope.main || !products.length) return products;
  const words = await translationsFor(tenantId, scope.language);
  return products.map((p) => {
    const w = words[p.id];
    if (!w) return p;
    return { ...p, name: w.name ?? p.name, description: w.description ?? p.description, shortDescription: w.shortDescription ?? p.shortDescription };
  });
}
