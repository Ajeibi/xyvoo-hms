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
