import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getStoreAccessContext,
  getStoreCapabilities,
  type StoreAccessContext,
  type StoreRoleCapabilities,
} from "@/lib/store/access";

type ResolvedStoreRequest = {
  access: StoreAccessContext & { tenantId: string; userId: string; role: string };
  capabilities: StoreRoleCapabilities;
  service: ReturnType<typeof createServerSupabaseClient>;
};

type Service = ReturnType<typeof createServerSupabaseClient>;

/**
 * Whether every given product belongs to this store. Every query runs as the
 * service role, so this is what stops one store reaching another's products
 * by id. Duplicates and empty ids are ignored.
 */
export async function storeOwnsProducts(service: Service, tenantId: string, productIds: Array<string | null | undefined>) {
  const ids = [...new Set(productIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!ids.length) return false;
  const { data, error } = await service.schema("store").from("products").select("id").eq("tenant_id", tenantId).in("id", ids);
  return !error && (data?.length ?? 0) === ids.length;
}

/** The same answer whether the product is someone else's or doesn't exist, so ids can't be probed. */
export const productNotFound = () => NextResponse.json({ error: "Product not found." }, { status: 404 });

/** Shared auth + tenant resolution for store API routes: validates slug, session, and membership. */
export async function resolveStoreRequest(
  slug: string,
): Promise<{ error: NextResponse } | { error?: undefined } & ResolvedStoreRequest> {
  if (!slug) return { error: NextResponse.json({ error: "Missing slug." }, { status: 400 }) };

  const access = await getStoreAccessContext(slug);
  if (!access.userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!access.tenantId || !access.role) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return {
    access: access as ResolvedStoreRequest["access"],
    capabilities: getStoreCapabilities(access.role),
    service: createServerSupabaseClient(),
  };
}
