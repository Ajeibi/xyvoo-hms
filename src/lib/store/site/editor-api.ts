import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listShopCategories } from "@/lib/shop/products";
import { getStoreSite, listSiteVersions } from "./data";
import { resolveSite } from "./resolve";

/** Shared pieces for the website editor's API routes. */

/** Owner or admin of the store (the people who can publish). */
export async function resolveEditorRequest(slug: unknown) {
  const resolved = await resolveStoreRequest(typeof slug === "string" ? slug : "");
  if (resolved.error) return resolved;
  if (!resolved.capabilities.canManageSettings) {
    return { error: NextResponse.json({ error: "Only the store owner or an admin can edit the website." }, { status: 403 }) };
  }
  return resolved;
}

/**
 * Everything the editor shows: the raw draft, the draft resolved over the
 * template defaults (so every field has a value), publish state, and the
 * store's pages, collections, products and categories for pickers.
 */
export async function loadEditorState(tenantId: string, storeName: string, logoUrl: string | null) {
  const store = createServerSupabaseClient().schema("store");
  const [site, versions, pages, collections, products, categories] = await Promise.all([
    getStoreSite(tenantId),
    listSiteVersions(tenantId),
    store.from("pages").select("id, title, slug, system_key, status").eq("tenant_id", tenantId).order("sort_order").order("created_at"),
    store.from("collections").select("id, name, slug").eq("tenant_id", tenantId).order("sort_order"),
    store.from("products").select("id, name, slug").eq("tenant_id", tenantId).eq("status", "active").order("name").limit(500),
    listShopCategories(tenantId),
  ]);
  if (!site) throw new Error("This store has no site record.");

  const resolved = resolveSite(site.templateSlug, site.draft, { storeName, tenantLogoUrl: logoUrl });
  return {
    templateSlug: site.templateSlug,
    status: site.status,
    publishedVersion: site.publishedVersion,
    publishedAt: site.publishedAt,
    hasUnpublishedChanges: JSON.stringify(site.draft) !== JSON.stringify(site.published ?? {}),
    draft: site.draft,
    resolved: {
      theme: resolved.theme,
      brand: resolved.brand,
      sections: resolved.sections,
      navigation: resolved.navigation,
      content: resolved.content,
      seo: resolved.seo,
      contrastIssues: resolved.contrastIssues,
    },
    versions,
    pages: (pages.data || []).map((p) => ({ id: p.id, title: p.title, slug: p.slug, systemKey: p.system_key, status: p.status })),
    collections: (collections.data || []).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    products: (products.data || []).map((p) => ({ id: p.id, name: p.name, slug: (p.slug as string | null) || p.id })),
    categories: categories.map((c) => c.name),
  };
}

export type EditorState = Awaited<ReturnType<typeof loadEditorState>>;
