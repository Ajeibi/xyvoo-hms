import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Hand-picked product collections (store.collections + store.collection_products). */

export const collectionSchema = z.object({
  name: z.string().trim().min(2, "Give the collection a name.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens for the web address.")
    .max(80),
  description: z.string().trim().max(500),
  imageUrl: z.string().trim().url().max(1000).nullable(),
  imageAlt: z.string().trim().max(200),
  isVisible: z.boolean(),
  productIds: z.array(z.string().uuid()).max(500),
});

export type CollectionInput = z.infer<typeof collectionSchema>;

export type CollectionSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string;
  isVisible: boolean;
  productIds: string[];
};

export function slugifyCollectionName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Replaces a collection's products, keeping only products that belong to the store, in the order given. */
export async function setCollectionProducts(db: SupabaseClient, tenantId: string, collectionId: string, productIds: string[]) {
  const store = db.schema("store");
  let owned: string[] = [];
  if (productIds.length) {
    const { data, error } = await store.from("products").select("id").eq("tenant_id", tenantId).in("id", productIds);
    if (error) throw new Error(error.message);
    const ownedSet = new Set((data || []).map((p) => p.id as string));
    owned = productIds.filter((id) => ownedSet.has(id));
  }

  const { error: deleteError } = await store.from("collection_products").delete().eq("collection_id", collectionId);
  if (deleteError) throw new Error(deleteError.message);
  if (owned.length) {
    const { error } = await store
      .from("collection_products")
      .insert(owned.map((product_id, position) => ({ collection_id: collectionId, product_id, position })));
    if (error) throw new Error(error.message);
  }
}

export function toCollectionRow(input: CollectionInput) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description || null,
    image_url: input.imageUrl,
    image_alt: input.imageAlt || null,
    is_visible: input.isVisible,
  };
}
